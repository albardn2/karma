import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  View,
  Dimensions,
  Platform,
  TextInput,
  Animated,
  Modal,
} from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useRouter, useLocalSearchParams, Stack } from "expo-router";
import { apiCall } from "@/utils/api";
import { LinearGradient } from "expo-linear-gradient";
import { NativeHeader } from "@/components/layout/NativeHeader";
import * as Clipboard from 'expo-clipboard';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface User {
  uuid: string;
  email_address: string;
  first_name: string;
  last_name: string;
  username: string;
  rfid_token?: string;
  permission_scope: string;
  created_at: string;
  is_deleted: boolean;
}

const InfoRow = ({
  label,
  value,
  editable = false,
  multiline = false,
  keyboardType = "default",
  fieldName,
  isEditing,
  editedUser,
  setEditedUser,
  errors,
  clearFieldError,
}: {
  label: string;
  value: string;
  editable?: boolean;
  multiline?: boolean;
  keyboardType?: "default" | "email-address";
  fieldName?: keyof User;
  isEditing: boolean;
  editedUser: User | null;
  setEditedUser: (
    updater: (prev: User | null) => User | null,
  ) => void;
  errors: Partial<Record<string, string>>;
  clearFieldError: (fieldName: string) => void;
}) => {
  const copyToClipboard = async (text: string) => {
    if (!text || text === "Not provided") return;

    try {
      await Clipboard.setStringAsync(text);
      Alert.alert("Copied", `${label} copied to clipboard`);
    } catch (error) {
      Alert.alert("Error", "Failed to copy to clipboard");
    }
  };

  return (
    <View style={styles.infoRow}>
      <ThemedText style={styles.infoLabel}>{label}</ThemedText>
      {isEditing && editable && editedUser && fieldName ? (
        <>
          <TextInput
            style={[
              styles.infoInput,
              multiline && styles.infoInputMultiline,
              errors[fieldName] && styles.inputError,
            ]}
            value={value}
            onChangeText={(text) => {
              setEditedUser((prev) =>
                prev ? { ...prev, [fieldName]: text } : null,
              );
              clearFieldError(fieldName);
            }}
            multiline={multiline}
            keyboardType={keyboardType}
            placeholderTextColor="#9ca3af"
          />
          {errors[fieldName] && (
            <ThemedText style={styles.errorText}>{errors[fieldName]}</ThemedText>
          )}
        </>
      ) : (
        <View style={styles.infoValueContainer}>
          <ThemedText style={styles.infoValue}>
            {value || "Not provided"}
            {value && value !== "Not provided" && (
              <TouchableOpacity
                style={styles.copyButton}
                onPress={() => copyToClipboard(value)}
              >
                <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                  <Path
                    d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"
                    fill="#6b7280"
                  />
                </Svg>
              </TouchableOpacity>
            )}
          </ThemedText>
        </View>
      )}
    </View>
  );
};

export default function UserDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [screenData, setScreenData] = useState(Dimensions.get("window"));
  const [isEditing, setIsEditing] = useState(false);
  const [editedUser, setEditedUser] = useState<User | null>(null);
  const [updating, setUpdating] = useState(false);
  const [banner, setBanner] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const bannerAnimation = useState(new Animated.Value(0))[0];
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const deleteModalAnimation = useState(new Animated.Value(0))[0];
  const [availablePermissions, setAvailablePermissions] = useState<string[]>([]);

  // Platform detection
  const isWeb = Platform.OS === "web";
  const isNative = Platform.OS === 'ios' || Platform.OS === 'android';
  const isMobileWeb = isWeb && screenData.width < 768;
  const isDesktop = isWeb && screenData.width >= 768;

  useEffect(() => {
    const onChange = (result: any) => {
      setScreenData(result.window);
    };
    const subscription = Dimensions.addEventListener("change", onChange);
    return () => subscription?.remove();
  }, []);

  useEffect(() => {
    if (id) {
      fetchUser();
    }
  }, [id]);

  useEffect(() => {
    const fetchPermissions = async () => {
      try {
        const response = await apiCall('/auth/permissions');
        if (response.status === 200 && response.data) {
          setAvailablePermissions(response.data);
        }
      } catch (error) {
        console.error('Error fetching permissions:', error);
        // Fallback to empty array if API fails
        setAvailablePermissions([]);
      }
    };

    fetchPermissions();
  }, []);

  const showBanner = (type: "success" | "error", message: string) => {
    setBanner({ type, message });
    Animated.sequence([
      Animated.timing(bannerAnimation, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.delay(3000),
      Animated.timing(bannerAnimation, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => setBanner(null));
  };

  const validateForm = (): boolean => {
    if (!editedUser) return false;

    const newErrors: Record<string, string> = {};

    if (!editedUser.first_name?.trim()) {
      newErrors.first_name = "First name is required";
    }
    if (!editedUser.last_name?.trim()) {
      newErrors.last_name = "Last name is required";
    }
    if (!editedUser.username?.trim()) {
      newErrors.username = "Username is required";
    }
    if (!editedUser.permission_scope?.trim()) {
      newErrors.permission_scope = "At least one permission level is required";
    }
    // Email validation only if provided
    if (
      editedUser.email_address?.trim() &&
      !/\S+@\S+\.\S+/.test(editedUser.email_address)
    ) {
      newErrors.email_address = "Please enter a valid email address";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const clearFieldError = (fieldName: string) => {
    if (errors[fieldName]) {
      setErrors((prev) => ({ ...prev, [fieldName]: "" }));
    }
  };

  const fetchUser = async () => {
    try {
      setLoading(true);
      const response = await apiCall<User>(`/auth/user/${id}`);

      if (response.status === 200 && response.data) {
        setUser(response.data);
        setEditedUser(response.data);
      } else {
        Alert.alert("Error", "Failed to load user details");
        router.back();
      }
    } catch (error) {
      console.error("Error fetching user:", error);
      Alert.alert("Error", "Failed to load user details");
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedUser(user);
  };

  const handleSaveEdit = async () => {
    if (!editedUser || !user) return;

    if (!validateForm()) {
      showBanner("error", "Please fix the validation errors before saving");
      return;
    }

    try {
      setUpdating(true);

      // Only send fields that have changed
      const updateData: Partial<User> = {};
      if (editedUser.first_name !== user.first_name) {
        updateData.first_name = editedUser.first_name;
      }
      if (editedUser.last_name !== user.last_name) {
        updateData.last_name = editedUser.last_name;
      }
      if (editedUser.email_address !== user.email_address) {
        updateData.email = editedUser.email_address;
      }
      if (editedUser.username !== user.username) {
        updateData.username = editedUser.username;
      }
      if (editedUser.rfid_token !== user.rfid_token) {
        updateData.rfid_token = editedUser.rfid_token;
      }
      if (editedUser.permission_scope !== user.permission_scope) {
        updateData.permission_scope = editedUser.permission_scope;
      }

      // If no changes, just exit edit mode
      if (Object.keys(updateData).length === 0) {
        setIsEditing(false);
        showBanner("success", "No changes were made");
        return;
      }

      const response = await apiCall(`/auth/user/${id}`, {
        method: "PUT",
        body: JSON.stringify(updateData),
      });

      if (response.status === 200 && response.data) {
        setUser(response.data);
        setEditedUser(response.data);
        setIsEditing(false);
        setErrors({});
        showBanner("success", "User updated successfully!");
      } else {
        let errorMsg = "Failed to update user";
        if (response.error) {
          try {
            const err =
              typeof response.error === "string"
                ? JSON.parse(response.error)
                : response.error;
            errorMsg = err.detail || err.message || errorMsg;
          } catch {}
        }
        showBanner("error", errorMsg);
      }
    } catch (error) {
      console.error("Error updating user:", error);
      showBanner("error", "Network error - please try again");
    } finally {
      setUpdating(false);
    }
  };

  const handleDelete = () => {
    console.log("Delete button clicked - showing confirmation");
    setShowDeleteConfirm(true);
    Animated.timing(deleteModalAnimation, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const closeDeleteConfirm = () => {
    Animated.timing(deleteModalAnimation, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setShowDeleteConfirm(false);
    });
  };

  const handleConfirmDelete = () => {
    closeDeleteConfirm();
    setTimeout(() => {
      confirmDelete();
    }, 300);
  };

  const confirmDelete = async () => {
    try {
      setLoading(true);
      console.log("Attempting to delete user:", id);

      const response = await apiCall(`/auth/user/${id}`, {
        method: "DELETE",
      });

      console.log("Delete response:", response);

      if (response.status === 204 || response.status === 200) {
        // Navigate back to users list page
        if (isNative) {
          router.replace("/users");
        } else {
          router.replace("/?section=users");
        }
      } else {
        // Handle specific error messages from backend
        let errorMessage = "Failed to delete user";
        if (response.error) {
          try {
            const errorData = JSON.parse(response.error);
            errorMessage =
              errorData.message || errorData.detail || errorMessage;
          } catch {
            // If parsing fails, use the raw error string
            errorMessage = response.error;
          }
        }
        Alert.alert("Cannot Delete User", errorMessage);
      }
    } catch (error) {
      console.error("Error deleting user:", error);
      Alert.alert("Error", "Failed to delete user");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const getPermissionColor = (permission: string) => {
    // Generate consistent colors based on permission string hash
    const hash = permission.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);

    const colors = [
      '#dc2626', '#ea580c', '#d97706', '#059669', 
      '#0891b2', '#7c3aed', '#db2777', '#16a34a',
      '#dc2626', '#ea580c'
    ];

    return colors[Math.abs(hash) % colors.length];
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#5469D4" />
          <ThemedText style={styles.loadingText}>
            Loading user details...
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  if (!user) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.errorContainer}>
          <ThemedText style={styles.errorText}>User not found</ThemedText>
          <TouchableOpacity onPress={() => router.back()}>
            <LinearGradient
              colors={["#5469D4", "#4F46E5"]}
              style={styles.backButton}
            >
              <ThemedText style={styles.backButtonText}>Go Back</ThemedText>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </ThemedView>
    );
  }

  const PermissionSelector = () => {

    const getPermissionLabel = (permission: string) => {
      // Convert snake_case to Title Case dynamically
      return permission
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    };

    if (!isEditing || !editedUser) {
      const userPermissions = user.permission_scope.split(',').filter(p => p.trim());
      return (
        <View style={styles.permissionBadgesContainer}>
          {userPermissions.map((permission, index) => (
            <View
              key={index}
              style={[
                styles.permissionBadge,
                { backgroundColor: getPermissionColor(permission.trim()) },
              ]}
            >
              <ThemedText style={styles.permissionText}>
                {getPermissionLabel(permission.trim())}
              </ThemedText>
            </View>
          ))}
        </View>
      );
    }

    return (
      <View style={styles.permissionSelectorContainer}>
        <View style={styles.permissionSelector}>
          {availablePermissions.map((permission) => {
            const selectedPermissions = editedUser.permission_scope.split(',').filter(p => p.trim());
            const isSelected = selectedPermissions.includes(permission);

            return (
              <TouchableOpacity
                key={permission}
                style={[
                  styles.permissionOption,
                  {
                    backgroundColor: isSelected ? getPermissionColor(permission) : "#f3f4f6",
                  },
                ]}
                onPress={() => {
                  const currentPermissions = editedUser.permission_scope.split(',').filter(p => p.trim());
                  let newPermissions;

                  if (isSelected) {
                    // Remove permission
                    newPermissions = currentPermissions.filter(p => p !== permission);
                  } else {
                    // Add permission
                    newPermissions = [...currentPermissions, permission];
                  }

                  setEditedUser((prev) => (prev ? { ...prev, permission_scope: newPermissions.join(',') } : null));
                }}
              >
                <ThemedText
                  style={[
                    styles.permissionOptionText,
                    isSelected && { color: "#fff" },
                  ]}
                >
                  {getPermissionLabel(permission)}
                </ThemedText>
              </TouchableOpacity>
            );
          })}
        </View>
        {editedUser.permission_scope && (
          <ThemedText style={styles.selectedPermissionsText}>
            Selected: {editedUser.permission_scope.split(',').filter(p => p.trim()).map(p => getPermissionLabel(p.trim())).join(', ')}
          </ThemedText>
        )}
      </View>
    );
  };

  return (
    <>
      <Stack.Screen 
        options={{ 
          headerShown: false
        }} 
      />
      <ThemedView style={[styles.container, isNative && { paddingTop: 0 }]}>
        {/* Native Header for mobile */}
        {isNative && (
          <NativeHeader
            title=""
            onBack={() => router.back()}
            rightComponent={
              <View style={styles.headerActions}>
                {isEditing ? (
                  <>
                    <TouchableOpacity
                      style={styles.cancelButton}
                      onPress={handleCancelEdit}
                      disabled={updating}
                    >
                      <ThemedText style={styles.cancelButtonText}>
                        Cancel
                      </ThemedText>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleSaveEdit}
                      disabled={updating}
                    >
                      <LinearGradient
                        colors={
                          updating
                            ? ["#9ca3af", "#6b7280"]
                            : ["#10b981", "#059669"]
                        }
                        style={styles.saveButton}
                      >
                        <ThemedText style={styles.saveButtonText}>
                          {updating ? "Saving..." : "Save"}
                        </ThemedText>
                      </LinearGradient>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <TouchableOpacity
                      onPress={handleEdit}
                      style={styles.editButton}
                    >
                      <ThemedText style={styles.editButtonText}>
                        ✏️
                      </ThemedText>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleDelete}
                      style={styles.deleteButton}
                    >
                      <ThemedText style={styles.deleteButtonText}>
                        🗑️
                      </ThemedText>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            }
          />
        )}

        {/* Banner */}
        {banner && (
          <Animated.View
            style={[
              styles.banner,
              banner.type === "success"
                ? styles.successBanner
                : styles.errorBanner,
              {
                opacity: bannerAnimation,
                transform: [
                  {
                    translateY: bannerAnimation.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-100, 0],
                    }),
                  },
                ],
                top: isNative ? insets.top : 0, // Use safe area for native, 0 for web
                position: isNative ? 'absolute' : 'fixed' // Fixed positioning for web
              },
            ]}
          >
            <ThemedText style={styles.bannerText}>{banner.message}</ThemedText>
          </Animated.View>
        )}

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.content,
            isDesktop && styles.desktopContent,
            (isMobileWeb) && styles.mobileContent,
            (isNative) && styles.nativeContent,
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* User Header Card */}
          <View style={[
            styles.headerCard,
            {
              padding: isDesktop ? 24 : 16,
              marginBottom: isDesktop ? 24 : 16,
            }
          ]}>
            {/* Only show header actions for desktop and web, not for native */}
            {!isNative && (
              <View style={styles.cardHeader}>
                <TouchableOpacity
                  onPress={() => router.back()}
                  style={styles.backButton}
                >
                  <ThemedText style={styles.backButtonText}>← Back</ThemedText>
                </TouchableOpacity>

                <View style={styles.headerActions}>
                  {isEditing ? (
                    <>
                      <TouchableOpacity
                        style={styles.cancelButton}
                        onPress={handleCancelEdit}
                        disabled={updating}
                      >
                        <ThemedText style={styles.cancelButtonText}>
                          Cancel
                        </ThemedText>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={handleSaveEdit}
                        disabled={updating}
                      >
                        <LinearGradient
                          colors={
                            updating
                              ? ["#9ca3af", "#6b7280"]
                              : ["#10b981", "#059669"]
                          }
                          style={styles.saveButton}
                        >
                          <ThemedText style={styles.saveButtonText}>
                            {updating ? "Saving..." : "Save Changes"}
                          </ThemedText>
                        </LinearGradient>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <>
                      <TouchableOpacity
                        onPress={handleEdit}
                        style={styles.editButton}
                      >
                        <ThemedText style={styles.editButtonText}>
                          ✏️ Edit
                        </ThemedText>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={handleDelete}
                        style={styles.deleteButton}
                      >
                        <ThemedText style={styles.deleteButtonText}>
                          🗑️ Delete
                        </ThemedText>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </View>
            )}

            <View style={styles.userHeader}>
              <View style={styles.userInfo}>
                <ThemedText style={styles.userName}>
                  {isEditing && editedUser
                    ? `${editedUser.first_name} ${editedUser.last_name}`
                    : `${user.first_name} ${user.last_name}`}
                </ThemedText>
                <ThemedText style={styles.username}>
                  @{isEditing && editedUser
                    ? editedUser.username
                    : user.username}
                </ThemedText>
                <View style={styles.permissionContainer}>
                  <PermissionSelector />
                </View>
              </View>
            </View>
          </View>

          {/* Personal Information */}
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>
              Personal Information
            </ThemedText>
            <View style={styles.sectionContent}>
              <InfoRow
                label="First Name"
                value={
                  isEditing && editedUser
                    ? editedUser.first_name
                    : user.first_name
                }
                editable={true}
                fieldName="first_name"
                isEditing={isEditing}
                editedUser={editedUser}
                setEditedUser={setEditedUser}
                errors={errors}
                clearFieldError={clearFieldError}
              />
              <InfoRow
                label="Last Name"
                value={
                  isEditing && editedUser
                    ? editedUser.last_name
                    : user.last_name
                }
                editable={true}
                fieldName="last_name"
                isEditing={isEditing}
                editedUser={editedUser}
                setEditedUser={setEditedUser}
                errors={errors}
                clearFieldError={clearFieldError}
              />
              <InfoRow
                label="Email Address"
                value={
                  isEditing && editedUser
                    ? editedUser.email_address
                    : user.email_address
                }
                editable={true}
                keyboardType="email-address"
                fieldName="email_address"
                isEditing={isEditing}
                editedUser={editedUser}
                setEditedUser={setEditedUser}
                errors={errors}
                clearFieldError={clearFieldError}
              />
              <InfoRow
                label="Username"
                value={
                  isEditing && editedUser
                    ? editedUser.username
                    : user.username
                }
                editable={true}
                fieldName="username"
                isEditing={isEditing}
                editedUser={editedUser}
                setEditedUser={setEditedUser}
                errors={errors}
                clearFieldError={clearFieldError}
              />
            </View>
          </View>

          {/* Account Settings */}
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>
              Account Settings
            </ThemedText>
            <View style={styles.sectionContent}>
              <InfoRow
                label="RFID Token"
                value={
                  isEditing && editedUser
                    ? editedUser.rfid_token || ""
                    : user.rfid_token || ""
                }
                editable={true}
                fieldName="rfid_token"
                isEditing={isEditing}
                editedUser={editedUser}
                setEditedUser={setEditedUser}
                errors={errors}
                clearFieldError={clearFieldError}
              />
              <InfoRow
                label="UUID"
                value={user.uuid}
                isEditing={isEditing}
                editedUser={editedUser}
                setEditedUser={setEditedUser}
                errors={errors}
                clearFieldError={clearFieldError}
              />
              <InfoRow
                label="Created"
                value={formatDate(user.created_at)}
                isEditing={isEditing}
                editedUser={editedUser}
                setEditedUser={setEditedUser}
                errors={errors}
                clearFieldError={clearFieldError}
              />
              
            </View>
          </View>
        </ScrollView>

        {/* Custom Delete Confirmation Modal */}
        <Modal
          visible={showDeleteConfirm}
          transparent={true}
          animationType="fade"
          onRequestClose={closeDeleteConfirm}
        >
          <View style={styles.modalOverlay}>
            <Animated.View
              style={[
                styles.deleteModal,
                {
                  opacity: deleteModalAnimation,
                  transform: [
                    {
                      scale: deleteModalAnimation.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.8, 1],
                      }),
                    },
                  ],
                },
              ]}
            >
              <View style={styles.deleteModalHeader}>
                <ThemedText style={styles.deleteModalIcon}>⚠️</ThemedText>
                <ThemedText style={styles.deleteModalTitle}>
                  Delete User
                </ThemedText>
              </View>

              <ThemedText style={styles.deleteModalMessage}>
                Are you sure you want to delete{" "}
                <ThemedText style={styles.deleteModalUserName}>
                  {user?.first_name} {user?.last_name}
                </ThemedText>
                ? This action cannot be undone and will permanently remove all
                user data.
              </ThemedText>

              <View style={styles.deleteModalActions}>
                <TouchableOpacity
                  style={styles.deleteModalCancelButton}
                  onPress={closeDeleteConfirm}
                  activeOpacity={0.7}
                >
                  <ThemedText style={styles.deleteModalCancelText}>
                    Cancel
                  </ThemedText>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleConfirmDelete}
                  activeOpacity={0.7}
                >
                  <LinearGradient
                    colors={["#ef4444", "#dc2626"]}
                    style={styles.deleteModalConfirmButton}
                  >
                    <ThemedText style={styles.deleteModalConfirmText}>
                      {loading ? "Deleting..." : "Delete User"}
                    </ThemedText>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </View>
        </Modal>
      </ThemedView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#666",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  errorText: {
    fontSize: 18,
    color: "#ef4444",
    marginBottom: 24,
    textAlign: "center",
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
    alignItems: 'center',
    flexShrink: 0,
  },
  editButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#5469D4",
    backgroundColor: "#fff",
    minWidth: 48,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editButtonText: {
    fontSize: 20,
    color: "#5469D4",
    fontWeight: "600",
  },
  deleteButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ef4444",
    backgroundColor: "#fff",
    minWidth: 48,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButtonText: {
    fontSize: 20,
    color: "#ef4444",
    fontWeight: "600",
  },
  cancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#6b7280",
    backgroundColor: "#fff",
    minWidth: 80,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 14,
    color: "#6b7280",
    fontWeight: "600",
  },
  saveButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    minWidth: 65,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 14,
    color: "#fff",
    fontWeight: "600",
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingBottom: 40,
  },
  desktopContent: {
    padding: 32,
    maxWidth: 1200,
    alignSelf: "center",
    width: "100%",
  },
  mobileContent: {
    padding: 16,
  },
  nativeContent: {
    padding: 12,
  },
  headerCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  backButton: {
    padding: 8,
    marginRight: 16,
  },
  backButtonText: {
    fontSize: 16,
    color: "#5469D4",
    fontWeight: "600",
  },
  userHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: 4,
    lineHeight: 34,
    paddingTop: 2,
  },
  username: {
    fontSize: 18,
    color: "#6b7280",
    marginBottom: 12,
    lineHeight: 22,
    paddingTop: 1,
  },
  permissionContainer: {
    marginTop: 8,
  },
  permissionBadgesContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  permissionBadge: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  permissionText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#fff",
    textTransform: "capitalize",
  },
  permissionSelectorContainer: {
    marginTop: 8,
  },
  permissionSelector: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  permissionOption: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d1d5db",
  },
  permissionOptionText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6b7280",
    textTransform: "uppercase",
  },
  section: {
    backgroundColor: "#fff",
    borderRadius: 12,
    marginBottom: Platform.OS === 'ios' || Platform.OS === 'android' ? 12 : 20,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: Platform.OS === 'ios' || Platform.OS === 'android' ? 16 : 18,
    fontWeight: "600",
    color: "#1f2937",
    padding: Platform.OS === 'ios' || Platform.OS === 'android' ? 16 : 20,
    paddingBottom: 0,
  },
  sectionContent: {
    padding: Platform.OS === 'ios' || Platform.OS === 'android' ? 16 : 20,
    paddingTop: 12,
  },
  infoRow: {
    marginBottom: 16,
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 4,
  },
  copyButton: {
    padding: 2,
    marginLeft: 4,
    borderRadius: 4,
    backgroundColor: "#f3f4f6",
    alignSelf: "flex-start",
  },
  infoValueContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  infoValue: {
    fontSize: 16,
    color: "#1f2937",
    lineHeight: 24,
    flex: 1,
  },
  infoInput: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    fontSize: 16,
    color: "#1f2937",
    backgroundColor: "#fff",
  },
  infoInputMultiline: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  banner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingVertical: 16,
    paddingHorizontal: 20,
    zIndex: 99999,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 20,
  },
  successBanner: {
    backgroundColor: "#10b981",
  },
  errorBanner: {
    backgroundColor: "#ef4444",
  },
  bannerText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  inputError: {
    borderColor: "#ef4444",
    borderWidth: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  deleteModal: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 400,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  deleteModalHeader: {
    alignItems: "center",
    marginBottom: 20,
  },
  deleteModalIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  deleteModalTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1f2937",
    textAlign: "center",
  },
  deleteModalMessage: {
    fontSize: 16,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 32,
  },
  deleteModalUserName: {
    fontWeight: "600",
    color: "#1f2937",
  },
  deleteModalActions: {
    flexDirection: "row",
    gap: 12,
  },
  deleteModalCancelButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#d1d5db",
    backgroundColor: "#fff",
    alignItems: "center",
  },
  deleteModalCancelText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6b7280",
  },
  deleteModalConfirmButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: "center",
  },
  deleteModalConfirmText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  selectedPermissionsText: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 8,
    fontStyle: "italic",
  },
});