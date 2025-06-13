
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

interface FinancialAccount {
  uuid: string;
  account_name: string;
  balance: number;
  currency: string;
  notes: string | null;
  created_by_uuid: string | null;
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
  editedAccount,
  setEditedAccount,
  errors,
  clearFieldError,
}: {
  label: string;
  value: string;
  editable?: boolean;
  multiline?: boolean;
  keyboardType?: "default" | "numeric";
  fieldName?: keyof FinancialAccount;
  isEditing: boolean;
  editedAccount: FinancialAccount | null;
  setEditedAccount: (
    updater: (prev: FinancialAccount | null) => FinancialAccount | null,
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
      {isEditing && editable && editedAccount && fieldName ? (
        <>
          <TextInput
            style={[
              styles.infoInput,
              multiline && styles.infoInputMultiline,
              errors[fieldName] && styles.inputError,
            ]}
            value={fieldName === 'balance' ? value : value}
            onChangeText={(text) => {
              setEditedAccount((prev) => {
                if (!prev) return null;
                return { ...prev, [fieldName]: text };
              });
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

export default function FinancialAccountDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [account, setAccount] = useState<FinancialAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [screenData, setScreenData] = useState(Dimensions.get("window"));
  const [isEditing, setIsEditing] = useState(false);
  const [editedAccount, setEditedAccount] = useState<FinancialAccount | null>(null);
  const [updating, setUpdating] = useState(false);
  const [banner, setBanner] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const bannerAnimation = useState(new Animated.Value(0))[0];
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const deleteModalAnimation = useState(new Animated.Value(0))[0];
  const [availableCurrencies, setAvailableCurrencies] = useState<string[]>([]);

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
      fetchAccount();
    }
  }, [id]);

  useEffect(() => {
    const fetchCurrencies = async () => {
      try {
        const response = await apiCall('/payment/currencies');
        if (response.status === 200 && response.data) {
          setAvailableCurrencies(response.data);
        }
      } catch (error) {
        console.error('Error fetching currencies:', error);
        setAvailableCurrencies([]);
      }
    };

    fetchCurrencies();
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
    if (!editedAccount) return false;

    const newErrors: Record<string, string> = {};

    if (!editedAccount.account_name?.trim()) {
      newErrors.account_name = "Account name is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const clearFieldError = (fieldName: string) => {
    if (errors[fieldName]) {
      setErrors((prev) => ({ ...prev, [fieldName]: "" }));
    }
  };

  const fetchAccount = async () => {
    try {
      setLoading(true);
      const response = await apiCall<FinancialAccount>(`/financial-account/${id}`);

      if (response.status === 200 && response.data) {
        setAccount(response.data);
        setEditedAccount(response.data);
      } else {
        Alert.alert("Error", "Failed to load account details");
        router.back();
      }
    } catch (error) {
      console.error("Error fetching account:", error);
      Alert.alert("Error", "Failed to load account details");
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
    setEditedAccount(account);
  };

  const handleSaveEdit = async () => {
    if (!editedAccount || !account) return;

    if (!validateForm()) {
      showBanner("error", "Please fix the validation errors before saving");
      return;
    }

    try {
      setUpdating(true);

      // Only send fields that have changed
      const updateData: Partial<FinancialAccount> = {};
      if (editedAccount.account_name !== account.account_name) {
        updateData.account_name = editedAccount.account_name;
      }
      if (editedAccount.currency !== account.currency) {
        updateData.currency = editedAccount.currency;
      }
      if (editedAccount.notes !== account.notes) {
        updateData.notes = editedAccount.notes;
      }

      // If no changes, just exit edit mode
      if (Object.keys(updateData).length === 0) {
        setIsEditing(false);
        showBanner("success", "No changes were made");
        return;
      }

      const response = await apiCall(`/financial-account/${id}`, {
        method: "PUT",
        body: JSON.stringify(updateData),
      });

      if (response.status === 200 && response.data) {
        setAccount(response.data);
        setEditedAccount(response.data);
        setIsEditing(false);
        setErrors({});
        showBanner("success", "Account updated successfully!");
      } else {
        let errorMsg = "Failed to update account";
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
      console.error("Error updating account:", error);
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
      console.log("Attempting to delete account:", id);

      const response = await apiCall(`/financial-account/${id}`, {
        method: "DELETE",
      });

      console.log("Delete response:", response);

      if (response.status === 200) {
        // Navigate back to accounts list page
        if (isNative) {
          router.replace("/financial-accounts");
        } else {
          router.replace("/?section=financial-accounts");
        }
      } else {
        // Handle specific error messages from backend
        let errorMessage = "Failed to delete account";
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
        Alert.alert("Cannot Delete Account", errorMessage);
      }
    } catch (error) {
      console.error("Error deleting account:", error);
      Alert.alert("Error", "Failed to delete account");
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

  const getBalanceColor = (balance: number) => {
    if (balance > 0) return "#10b981";
    if (balance < 0) return "#ef4444";
    return "#6b7280";
  };

  const formatCurrency = (amount: number, currency: string) => {
    return `${currency.toUpperCase()} ${amount.toFixed(2)}`;
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#5469D4" />
          <ThemedText style={styles.loadingText}>
            Loading account details...
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  if (!account) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.errorContainer}>
          <ThemedText style={styles.errorText}>Account not found</ThemedText>
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

  const CurrencySelector = () => {
    if (!isEditing || !editedAccount) {
      return (
        <View style={styles.currencyBadge}>
          <ThemedText style={styles.currencyText}>
            {account.currency.toUpperCase()}
          </ThemedText>
        </View>
      );
    }

    return (
      <View style={styles.currencySelector}>
        {availableCurrencies.map((currency) => (
          <TouchableOpacity
            key={currency}
            style={[
              styles.currencyOption,
              editedAccount.currency === currency &&
                styles.activeCurrencyOption,
            ]}
            onPress={() =>
              setEditedAccount((prev) => (prev ? { ...prev, currency } : null))
            }
          >
            <ThemedText
              style={[
                styles.currencyOptionText,
                editedAccount.currency === currency &&
                  styles.activeCurrencyOptionText,
              ]}
            >
              {currency.toUpperCase()}
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
                top: isNative ? insets.top : 0,
                position: isNative ? 'absolute' : 'fixed'
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
          {/* Account Header Card */}
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

            <View style={styles.accountHeader}>
              <View style={styles.accountInfo}>
                <ThemedText style={styles.accountName}>
                  {isEditing && editedAccount
                    ? editedAccount.account_name
                    : account.account_name}
                </ThemedText>
                <View style={styles.balanceContainer}>
                  <ThemedText style={[
                    styles.balanceAmount,
                    { color: getBalanceColor(isEditing && editedAccount ? editedAccount.balance : account.balance) }
                  ]}>
                    {formatCurrency(
                      isEditing && editedAccount ? editedAccount.balance : account.balance,
                      isEditing && editedAccount ? editedAccount.currency : account.currency
                    )}
                  </ThemedText>
                </View>
                <View style={styles.currencyContainer}>
                  <CurrencySelector />
                </View>
              </View>
            </View>
          </View>

          {/* Account Information */}
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>
              Account Information
            </ThemedText>
            <View style={styles.sectionContent}>
              <InfoRow
                label="Account Name"
                value={
                  isEditing && editedAccount
                    ? editedAccount.account_name
                    : account.account_name
                }
                editable={true}
                fieldName="account_name"
                isEditing={isEditing}
                editedAccount={editedAccount}
                setEditedAccount={setEditedAccount}
                errors={errors}
                clearFieldError={clearFieldError}
              />
              
              <InfoRow
                label="Notes"
                value={
                  isEditing && editedAccount
                    ? editedAccount.notes || ""
                    : account.notes || ""
                }
                editable={true}
                multiline={true}
                fieldName="notes"
                isEditing={isEditing}
                editedAccount={editedAccount}
                setEditedAccount={setEditedAccount}
                errors={errors}
                clearFieldError={clearFieldError}
              />
            </View>
          </View>

          {/* System Information */}
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>System Information</ThemedText>
            <View style={styles.sectionContent}>
              <InfoRow
                label="UUID"
                value={account.uuid}
                isEditing={isEditing}
                editedAccount={editedAccount}
                setEditedAccount={setEditedAccount}
                errors={errors}
                clearFieldError={clearFieldError}
              />
              <InfoRow
                label="Created By"
                value={account.created_by_uuid || "System"}
                isEditing={isEditing}
                editedAccount={editedAccount}
                setEditedAccount={setEditedAccount}
                errors={errors}
                clearFieldError={clearFieldError}
              />
              <InfoRow
                label="Created"
                value={formatDate(account.created_at)}
                isEditing={isEditing}
                editedAccount={editedAccount}
                setEditedAccount={setEditedAccount}
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
                  Delete Account
                </ThemedText>
              </View>

              <ThemedText style={styles.deleteModalMessage}>
                Are you sure you want to delete{" "}
                <ThemedText style={styles.deleteModalAccountName}>
                  {account?.account_name}
                </ThemedText>
                ? This action cannot be undone and will permanently remove all
                account data and transaction history.
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
                      {loading ? "Deleting..." : "Delete Account"}
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
  accountHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  accountInfo: {
    flex: 1,
  },
  accountName: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: 8,
    lineHeight: 34,
    paddingTop: 2,
  },
  balanceContainer: {
    marginBottom: 12,
  },
  balanceAmount: {
    fontSize: 24,
    fontWeight: "bold",
  },
  currencyContainer: {
    marginTop: 8,
  },
  currencyBadge: {
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: "#e0e7ff",
  },
  currencyText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#3730a3",
    textTransform: "uppercase",
  },
  currencySelector: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  currencyOption: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d1d5db",
    backgroundColor: "#f3f4f6",
  },
  activeCurrencyOption: {
    backgroundColor: "#5469D4",
    borderColor: "#5469D4",
  },
  currencyOptionText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6b7280",
    textTransform: "uppercase",
  },
  activeCurrencyOptionText: {
    color: "#fff",
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
  deleteModalAccountName: {
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
});
