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
import { CustomerLocationMap } from "@/components/CustomerLocationMap";
import { NativeHeader } from "@/components/layout/NativeHeader";
import * as Clipboard from 'expo-clipboard';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Customer {
  uuid: string;
  email_address: string | null;
  company_name: string;
  full_name: string;
  phone_number: string;
  full_address: string;
  business_cards: string | null;
  notes: string | null;
  category:
    | "roastery"
    | "restaurant"
    | "minimarket"
    | "supermarket"
    | "distributer";
  coordinates: string | null;
  created_at: string;
  is_deleted: boolean;
  balance_per_currency: Record<string, number>;
}

const InfoRow = ({
  label,
  value,
  editable = false,
  multiline = false,
  keyboardType = "default",
  fieldName,
  isEditing,
  editedCustomer,
  setEditedCustomer,
  errors,
  clearFieldError,
}: {
  label: string;
  value: string;
  editable?: boolean;
  multiline?: boolean;
  keyboardType?: "default" | "email-address" | "phone-pad";
  fieldName?: keyof Customer;
  isEditing: boolean;
  editedCustomer: Customer | null;
  setEditedCustomer: (
    updater: (prev: Customer | null) => Customer | null,
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
      {isEditing && editable && editedCustomer && fieldName ? (
        <>
          <TextInput
            style={[
              styles.infoInput,
              multiline && styles.infoInputMultiline,
              errors[fieldName] && styles.inputError,
            ]}
            value={value}
            onChangeText={(text) => {
              setEditedCustomer((prev) =>
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

export default function CustomerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [screenData, setScreenData] = useState(Dimensions.get("window"));
  const [isEditing, setIsEditing] = useState(false);
  const [editedCustomer, setEditedCustomer] = useState<Customer | null>(null);
  const [updating, setUpdating] = useState(false);
  const [banner, setBanner] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const bannerAnimation = useState(new Animated.Value(0))[0];
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const deleteModalAnimation = useState(new Animated.Value(0))[0];

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
      fetchCustomer();
    }
  }, [id]);

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
    if (!editedCustomer) return false;

    const newErrors: Record<string, string> = {};

    if (!editedCustomer.full_name?.trim()) {
      newErrors.full_name = "Customer name is required";
    }
    if (!editedCustomer.company_name?.trim()) {
      newErrors.company_name = "Company name is required";
    }

    const hasPhone = editedCustomer.phone_number?.trim().length > 0;
    const hasEmail = editedCustomer.email_address?.trim().length > 0;

    if (!hasPhone && !hasEmail) {
      newErrors.phone_number = "Either phone number or email is required";
      newErrors.email_address = "Either phone number or email is required";
    }

    if (
      editedCustomer.email_address?.trim() &&
      !/\S+@\S+\.\S+/.test(editedCustomer.email_address)
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

  const fetchCustomer = async () => {
    try {
      setLoading(true);
      const response = await apiCall<Customer>(`/customer/${id}`);

      if (response.status === 200 && response.data) {
        setCustomer(response.data);
        setEditedCustomer(response.data);
      } else {
        Alert.alert("Error", "Failed to load customer details");
        router.back();
      }
    } catch (error) {
      console.error("Error fetching customer:", error);
      Alert.alert("Error", "Failed to load customer details");
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
    setEditedCustomer(customer);
  };

  const handleSaveEdit = async () => {
    if (!editedCustomer || !customer) return;

    if (!validateForm()) {
      showBanner("error", "Please fix the validation errors before saving");
      return;
    }

    try {
      setUpdating(true);

      // Only send fields that have changed
      const updateData: Partial<Customer> = {};
      if (editedCustomer.full_name !== customer.full_name) {
        updateData.full_name = editedCustomer.full_name;
      }
      if (editedCustomer.company_name !== customer.company_name) {
        updateData.company_name = editedCustomer.company_name;
      }
      if (editedCustomer.email_address !== customer.email_address) {
        updateData.email_address = editedCustomer.email_address;
      }
      if (editedCustomer.phone_number !== customer.phone_number) {
        updateData.phone_number = editedCustomer.phone_number;
      }
      if (editedCustomer.full_address !== customer.full_address) {
        updateData.full_address = editedCustomer.full_address;
      }
      if (editedCustomer.business_cards !== customer.business_cards) {
        updateData.business_cards = editedCustomer.business_cards;
      }
      if (editedCustomer.notes !== customer.notes) {
        updateData.notes = editedCustomer.notes;
      }
      if (editedCustomer.category !== customer.category) {
        updateData.category = editedCustomer.category;
      }
      if (editedCustomer.coordinates !== customer.coordinates) {
        updateData.coordinates = editedCustomer.coordinates;
      }

      // If no changes, just exit edit mode
      if (Object.keys(updateData).length === 0) {
        setIsEditing(false);
        showBanner("success", "No changes were made");
        return;
      }

      const response = await apiCall(`/customer/${id}`, {
        method: "PUT",
        body: JSON.stringify(updateData),
      });

      if (response.status === 200 && response.data) {
        setCustomer(response.data);
        setEditedCustomer(response.data);
        setIsEditing(false);
        setErrors({});
        showBanner("success", "Customer updated successfully!");
      } else {
        let errorMsg = "Failed to update customer";
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
      console.error("Error updating customer:", error);
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
      console.log("Attempting to delete customer:", id);

      const response = await apiCall(`/customer/${id}`, {
        method: "DELETE",
      });

      console.log("Delete response:", response);

      if (response.status === 200) {
        // Navigate back to customers list page
        if (isNative) {
          router.replace("/customers");
        } else {
          router.replace("/?section=customers");
        }
      } else {
        // Handle specific error messages from backend
        let errorMessage = "Failed to delete customer";
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
        Alert.alert("Cannot Delete Customer", errorMessage);
      }
    } catch (error) {
      console.error("Error deleting customer:", error);
      Alert.alert("Error", "Failed to delete customer");
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

  const getTotalBalance = () => {
    if (!customer) return 0;
    return Object.values(customer.balance_per_currency).reduce(
      (sum, amount) => sum + amount,
      0,
    );
  };

  const getBalanceColor = (balance: number) => {
    if (balance > 0) return "#10b981";
    if (balance < 0) return "#ef4444";
    return "#6b7280";
  };

  const categoryColors: Record<string, string> = {
    restaurant: "#5469D4",
    roastery: "#5469D4",
    minimarket: "#5469D4",
    supermarket: "#5469D4",
    distributer: "#5469D4",
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#5469D4" />
          <ThemedText style={styles.loadingText}>
            Loading customer details...
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  if (!customer) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.errorContainer}>
          <ThemedText style={styles.errorText}>Customer not found</ThemedText>
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

  const CategorySelector = () => {
    if (!isEditing || !editedCustomer) {
      return (
        <View
          style={[
            styles.categoryBadge,
            { backgroundColor: categoryColors[customer.category] || "#5469D4" },
          ]}
        >
          <ThemedText style={styles.categoryText}>
            {customer.category.charAt(0).toUpperCase() +
              customer.category.slice(1)}
          </ThemedText>
        </View>
      );
    }

    return (
      <View style={styles.categorySelector}>
        {(
          [
            "roastery",
            "restaurant",
            "minimarket",
            "supermarket",
            "distributer",
          ] as const
        ).map((category) => (
          <TouchableOpacity
            key={category}
            style={[
              styles.categoryOption,
              editedCustomer.category === category &&
                styles.activeCategoryOption,
              {
                backgroundColor:
                  editedCustomer.category === category
                    ? categoryColors[category]
                    : "#f3f4f6",
              },
            ]}
            onPress={() =>
              setEditedCustomer((prev) => (prev ? { ...prev, category } : null))
            }
          >
            <ThemedText
              style={[
                styles.categoryOptionText,
                editedCustomer.category === category &&
                  styles.activeCategoryOptionText,
              ]}
            >
              {category.charAt(0).toUpperCase() + category.slice(1)}
            </ThemedText>
          </TouchableOpacity>
        ))}
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
          {/* Customer Header Card */}
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

            <View style={styles.customerHeader}>
              <View style={styles.customerInfo}>
                <ThemedText style={styles.customerName}>
                  {isEditing && editedCustomer
                    ? editedCustomer.full_name
                    : customer.full_name}
                </ThemedText>
                <ThemedText style={styles.companyName}>
                  {isEditing && editedCustomer
                    ? editedCustomer.company_name
                    : customer.company_name}
                </ThemedText>
                <View style={styles.categoryContainer}>
                  <CategorySelector />
                </View>
              </View>
            </View>
          </View>

          {/* Contact Information */}
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>
              Contact Information
            </ThemedText>
            <View style={styles.sectionContent}>
              <InfoRow
                label="Full Name"
                value={
                  isEditing && editedCustomer
                    ? editedCustomer.full_name
                    : customer.full_name
                }
                editable={true}
                fieldName="full_name"
                isEditing={isEditing}
                editedCustomer={editedCustomer}
                setEditedCustomer={setEditedCustomer}
                errors={errors}
                clearFieldError={clearFieldError}
              />
              <InfoRow
                label="Company Name"
                value={
                  isEditing && editedCustomer
                    ? editedCustomer.company_name
                    : customer.company_name
                }
                editable={true}
                fieldName="company_name"
                isEditing={isEditing}
                editedCustomer={editedCustomer}
                setEditedCustomer={setEditedCustomer}
                errors={errors}
                clearFieldError={clearFieldError}
              />
              <InfoRow
                label="Email Address"
                value={
                  isEditing && editedCustomer
                    ? editedCustomer.email_address || ""
                    : customer.email_address || ""
                }
                editable={true}
                keyboardType="email-address"
                fieldName="email_address"
                isEditing={isEditing}
                editedCustomer={editedCustomer}
                setEditedCustomer={setEditedCustomer}
                errors={errors}
                clearFieldError={clearFieldError}
              />
              <InfoRow
                label="Phone Number"
                value={
                  isEditing && editedCustomer
                    ? editedCustomer.phone_number
                    : customer.phone_number
                }
                editable={true}
                keyboardType="phone-pad"
                fieldName="phone_number"
                isEditing={isEditing}
                editedCustomer={editedCustomer}
                setEditedCustomer={setEditedCustomer}
                errors={errors}
                clearFieldError={clearFieldError}
              />
              <InfoRow
                label="Full Address"
                value={
                  isEditing && editedCustomer
                    ? editedCustomer.full_address
                    : customer.full_address
                }
                editable={true}
                multiline={true}
                fieldName="full_address"
                isEditing={isEditing}
                editedCustomer={editedCustomer}
                setEditedCustomer={setEditedCustomer}
                errors={errors}
                clearFieldError={clearFieldError}
              />
            </View>
          </View>

          {/* Business Details */}
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>
              Business Details
            </ThemedText>
            <View style={styles.sectionContent}>
              <InfoRow
                label="Business Cards"
                value={
                  isEditing && editedCustomer
                    ? editedCustomer.business_cards || ""
                    : customer.business_cards || ""
                }
                editable={true}
                multiline={true}
                fieldName="business_cards"
                isEditing={isEditing}
                editedCustomer={editedCustomer}
                setEditedCustomer={setEditedCustomer}
                errors={errors}
                clearFieldError={clearFieldError}
              />
              <InfoRow
                label="Notes"
                value={
                  isEditing && editedCustomer
                    ? editedCustomer.notes || ""
                    : customer.notes || ""
                }
                editable={true}
                multiline={true}
                fieldName="notes"
                isEditing={isEditing}
                editedCustomer={editedCustomer}
                setEditedCustomer={setEditedCustomer}
                errors={errors}
                clearFieldError={clearFieldError}
              />
              <InfoRow
                label="Coordinates"
                value={
                  isEditing && editedCustomer
                    ? editedCustomer.coordinates || ""
                    : customer.coordinates || ""
                }
                editable={true}
                fieldName="coordinates"
                isEditing={isEditing}
                editedCustomer={editedCustomer}
                setEditedCustomer={setEditedCustomer}
                errors={errors}
                clearFieldError={clearFieldError}
              />
              <InfoRow
                label="UUID"
                value={customer.uuid}
                isEditing={isEditing}
                editedCustomer={editedCustomer}
                setEditedCustomer={setEditedCustomer}
                errors={errors}
                clearFieldError={clearFieldError}
              />
              <InfoRow
                label="Created"
                value={formatDate(customer.created_at)}
                isEditing={isEditing}
                editedCustomer={editedCustomer}
                setEditedCustomer={setEditedCustomer}
                errors={errors}
                clearFieldError={clearFieldError}
              />
            </View>
          </View>

          {/* Balance Details */}
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Balance Details</ThemedText>
            <View style={styles.sectionContent}>
              {Object.entries(customer.balance_per_currency).length > 0 ? (
                Object.entries(customer.balance_per_currency).map(
                  ([currency, amount]) => (
                    <View key={currency} style={styles.balanceRow}>
                      <ThemedText style={styles.currencyLabel}>
                        {currency.toUpperCase()}
                      </ThemedText>
                      <ThemedText
                        style={[
                          styles.currencyAmount,
                          { color: getBalanceColor(amount) },
                        ]}
                      >
                        {amount.toFixed(2)}
                      </ThemedText>
                    </View>
                  ),
                )
              ) : (
                <ThemedText style={styles.noBalanceText}>
                  No balance information available
                </ThemedText>
              )}
            </View>
          </View>

          {/* Location Map */}
          {customer.coordinates && (
            <View style={styles.section}>
              <ThemedText style={styles.sectionTitle}>Location</ThemedText>
              <View style={styles.sectionContent}>
                <CustomerLocationMap customer={customer} />
              </View>
            </View>
          )}
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
                  Delete Customer
                </ThemedText>
              </View>

              <ThemedText style={styles.deleteModalMessage}>
                Are you sure you want to delete{" "}
                <ThemedText style={styles.deleteModalCustomerName}>
                  {customer?.full_name}
                </ThemedText>
                ? This action cannot be undone and will permanently remove all
                customer data.
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
                      {loading ? "Deleting..." : "Delete Customer"}
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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  desktopHeader: {
    paddingHorizontal: 32,
    paddingVertical: 24,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
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
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1f2937",
  },
  desktopTitle: {
    fontSize: 32,
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
  customerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  customerInfo: {
    flex: 1,
  },
  customerName: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: 4,
    lineHeight: 34,
    paddingTop: 2,
  },
  companyName: {
    fontSize: 18,
    color: "#6b7280",
    marginBottom: 12,
    lineHeight: 22,
    paddingTop: 1,
  },
  categoryContainer: {
    marginTop: 8,
  },
  categoryBadge: {
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#fff",
    textTransform: "uppercase",
  },
  categorySelector: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  categoryOption: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d1d5db",
  },
  activeCategoryOption: {
    borderColor: "transparent",
  },
  categoryOptionText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6b7280",
    textTransform: "uppercase",
  },
  activeCategoryOptionText: {
    color: "#fff",
  },
  balanceContainer: {
    alignItems: "flex-end",
  },
  balanceLabel: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 4,
  },
  balanceAmount: {
    fontSize: 24,
    fontWeight: "bold",
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
  balanceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  currencyLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
  },
  currencyAmount: {
    fontSize: 16,
    fontWeight: "600",
  },
  noBalanceText: {
    fontSize: 14,
    color: "#6b7280",
    fontStyle: "italic",
    textAlign: "center",
    paddingVertical: 20,
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
  errorText: {
    fontSize: 14,
    color: "#ef4444",
    marginTop: 4,
    fontWeight: "500",
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
  deleteModalCustomerName: {
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
  mapContainer: {
    height: 300,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
});
