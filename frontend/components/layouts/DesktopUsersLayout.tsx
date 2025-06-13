
import React, { useState, useEffect, useMemo } from 'react';
import { StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, Animated, Modal, View } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useRouter } from 'expo-router';
import { apiCall } from '@/utils/api';
import { LinearGradient } from 'expo-linear-gradient';

interface User {
  uuid: string;
  username: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone_number: string | null;
  language: string | null;
  created_at: string;
  permission_scope: 'superuser' | 'admin' | 'operation_manager' | 'accountant' | 'operator' | 'driver' | 'sales' | null;
  is_deleted: boolean;
}

interface UserPage {
  users: User[];
  total_count: number;
  page: number;
  per_page: number;
  pages: number;
}

interface FilterState {
  uuid: string;
  permission_scope: string;
  email: string;
  username: string;
  first_name: string;
  last_name: string;
  phone_number: string;
}

interface DesktopUsersLayoutProps {
  onUserPress: (user: User) => void;
  onCreateUser: () => void;
}

export function DesktopUsersLayout({ onUserPress, onCreateUser }: DesktopUsersLayoutProps) {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [banner, setBanner] = useState<{type: 'success' | 'error', message: string} | null>(null);
  const bannerAnimation = useState(new Animated.Value(0))[0];
  const [showFilters, setShowFilters] = useState(false);
  const [showPermissionDropdown, setShowPermissionDropdown] = useState(false);
  const [permissions, setPermissions] = useState<string[]>([]);

  const [filters, setFilters] = useState<FilterState>({
    uuid: '',
    permission_scope: '',
    email: '',
    username: '',
    first_name: '',
    last_name: '',
    phone_number: '',
  });

  const [appliedFilters, setAppliedFilters] = useState<FilterState>({
    uuid: '',
    permission_scope: '',
    email: '',
    username: '',
    first_name: '',
    last_name: '',
    phone_number: '',
  });

  useEffect(() => {
    fetchPermissions();
    fetchUsers();
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchPermissions();
  }, [page, appliedFilters]);

  const fetchPermissions = async () => {
    try {
      const response = await apiCall('/auth/permissions');
      if (response.status === 200 && response.data) {
        setPermissions(response.data);
      } else {
        // Fallback to empty array if API fails
        setPermissions([]);
      }
    } catch (error) {
      console.error('Error fetching permissions:', error);
      // Fallback to empty array if API fails
      setPermissions([]);
    }
  };

  const showBanner = (type: 'success' | 'error', message: string) => {
    setBanner({ type, message });
    Animated.sequence([
      Animated.timing(bannerAnimation, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(3000),
      Animated.timing(bannerAnimation, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setBanner(null));
  };

  const fetchUsers = async () => {
    try {
      setLoading(true);

      const params = new URLSearchParams({
        page: page.toString(),
        per_page: '20'
      });

      // Apply filters to API call
      Object.entries(appliedFilters).forEach(([key, value]) => {
        if (value.trim()) {
          params.append(key, value.trim());
        }
      });

      const response = await apiCall<UserPage>(`/auth/users?${params.toString()}`);

      if (response.status === 200 && response.data) {
        setUsers(response.data.users);
        setTotalPages(response.data.pages);
      } else {
        if (response.status === 0) {
          Alert.alert('Network Error', 'Unable to connect to the backend server.');
        } else {
          Alert.alert('Error', `Failed to load users: ${response.error || 'Unknown error'}`);
        }
        setUsers([]);
        setTotalPages(0);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      Alert.alert('Error', 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (field: keyof FilterState, value: string) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const applyFilters = () => {
    setAppliedFilters({ ...filters });
    setPage(1);
    setShowFilters(false);
    setShowPermissionDropdown(false);
  };

  const clearFilters = () => {
    const emptyFilters = {
      uuid: '',
      permission_scope: '',
      email: '',
      username: '',
      first_name: '',
      last_name: '',
      phone_number: '',
    };
    setFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
    setPage(1);
    setShowFilters(false);
    setShowPermissionDropdown(false);
  };

  const hasActiveFilters = useMemo(() => {
    return Object.values(appliedFilters).some(value => value.trim() !== '');
  }, [appliedFilters]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const getPermissionColor = (permission: string | null) => {
    const colors: Record<string, string> = {
      superuser: '#dc2626',
      admin: '#ea580c',
      operation_manager: '#d97706',
      accountant: '#059669',
      operator: '#0891b2',
      driver: '#7c3aed',
      sales: '#db2777',
    };
    return colors[permission || ''] || '#6b7280';
  };

  const getPermissionLabel = (permission: string | null) => {
    const labels: Record<string, string> = {
      superuser: 'Super Admin',
      admin: 'Admin',
      operation_manager: 'Operation Manager',
      accountant: 'Accountant',
      operator: 'Operator',
      driver: 'Driver',
      sales: 'Sales',
    };
    return labels[permission || ''] || 'Unknown';
  };

  const UserCard = ({ user }: { user: User }) => (
    <TouchableOpacity
      style={styles.userCard}
      onPress={() => onUserPress(user)}
    >
      <View style={styles.userHeader}>
        <ThemedText style={styles.userName}>{user.first_name} {user.last_name}</ThemedText>
        <View style={[styles.permissionBadge, { backgroundColor: getPermissionColor(user.permission_scope) }]}>
          <ThemedText style={styles.permissionText}>
            {getPermissionLabel(user.permission_scope)}
          </ThemedText>
        </View>
      </View>
      <ThemedText style={styles.userDetail}>
        Username: @{user.username}
      </ThemedText>
      <ThemedText style={styles.userDetail}>
        Email: {user.email || 'No email provided'}
      </ThemedText>
      <ThemedText style={styles.userDetail}>
        Phone: {user.phone_number || 'No phone provided'}
      </ThemedText>
      <ThemedText style={styles.userDetail}>
        UUID: {user.uuid}
      </ThemedText>
      <View style={styles.createdContainer}>
        <ThemedText style={styles.createdText}>
          Created: {formatDate(user.created_at)}
        </ThemedText>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#5469D4" />
          <ThemedText style={styles.loadingText}>Loading users...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {/* Banner */}
      {banner && (
        <Animated.View style={[
          styles.banner,
          banner.type === 'success' ? styles.successBanner : styles.errorBanner,
          { opacity: bannerAnimation, transform: [{ translateY: bannerAnimation.interpolate({ inputRange: [0,1], outputRange: [-100,0] }) }] }
        ]}>
          <ThemedText style={styles.bannerText}>{banner.message}</ThemedText>
        </Animated.View>
      )}

      {/* Header */}
      <View style={styles.header}>
        <ThemedText style={styles.title}>Users</ThemedText>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[styles.filterToggle, hasActiveFilters && styles.filterToggleActive]}
            onPress={() => setShowFilters(true)}
          >
            <ThemedText style={[styles.filterToggleText, hasActiveFilters && styles.filterToggleTextActive]}>
              🔍 Filters {hasActiveFilters && `(${Object.values(appliedFilters).filter(v => v.trim()).length})`}
            </ThemedText>
          </TouchableOpacity>

          <TouchableOpacity onPress={onCreateUser}>
            <LinearGradient colors={['#5469D4', '#4F46E5']} style={styles.createButton}>
              <ThemedText style={styles.createButtonText}>+ Add User</ThemedText>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>

      {/* Content */}
      <View style={styles.contentContainer}>
        <View style={{ flex: 1 }}>
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.listContainer}
            showsVerticalScrollIndicator={false}
          >
            {users.length === 0 ? (
              <View style={styles.emptyContainer}>
                <ThemedText style={styles.emptyText}>
                  {hasActiveFilters ? 'No users match your filters' : 'No users found'}
                </ThemedText>
              </View>
            ) : (
              users.map((user) => (
                <UserCard key={user.uuid} user={user} />
              ))
            )}
          </ScrollView>

          {/* Pagination */}
          {totalPages > 1 && (
            <View style={styles.pagination}>
              <TouchableOpacity
                style={[styles.pageButton, page === 1 && styles.pageButtonDisabled]}
                onPress={() => page > 1 && setPage(page - 1)}
                disabled={page === 1}
              >
                <ThemedText style={[styles.pageButtonText, page === 1 && styles.pageButtonTextDisabled]}>
                  Previous
                </ThemedText>
              </TouchableOpacity>

              <ThemedText style={styles.pageInfo}>
                Page {page} of {totalPages}
              </ThemedText>

              <TouchableOpacity
                style={[styles.pageButton, page === totalPages && styles.pageButtonDisabled]}
                onPress={() => page < totalPages && setPage(page + 1)}
                disabled={page === totalPages}
              >
                <ThemedText style={[styles.pageButtonText, page === totalPages && styles.pageButtonTextDisabled]}>
                  Next
                </ThemedText>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {/* Filter Modal */}
      {showFilters && (
        <Modal
          visible={showFilters}
          transparent={true}
          animationType="fade"
          onRequestClose={() => {
            setShowFilters(false);
            setShowPermissionDropdown(false);
          }}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalBackdrop} />
            <View style={styles.filterModal}>
              <View style={styles.filterHeader}>
                <ThemedText style={styles.filterTitle}>Filter Users</ThemedText>
                <TouchableOpacity 
                  onPress={() => {
                    setShowFilters(false);
                    setShowPermissionDropdown(false);
                  }}
                  style={styles.closeButtonContainer}
                >
                  <ThemedText style={styles.closeButton}>✕</ThemedText>
                </TouchableOpacity>
              </View>

              <ScrollView 
                style={styles.filterContent} 
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="always"
                nestedScrollEnabled={true}
              >
                {/* UUID Filter */}
                <View style={styles.filterGroup}>
                  <ThemedText style={styles.filterLabel}>UUID</ThemedText>
                  <TextInput
                    style={styles.filterInput}
                    value={filters.uuid}
                    onChangeText={(value) => handleFilterChange('uuid', value)}
                    placeholder="Enter UUID"
                    placeholderTextColor="#9ca3af"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>

                {/* Permission Filter */}
                <View style={styles.filterGroup}>
                  <ThemedText style={styles.filterLabel}>Permission</ThemedText>
                  <TouchableOpacity 
                    style={styles.dropdown}
                    onPress={() => setShowPermissionDropdown(!showPermissionDropdown)}
                    activeOpacity={0.7}
                  >
                    <ThemedText style={[styles.dropdownText, !filters.permission_scope && styles.placeholderText]}>
                      {filters.permission_scope ? 
                        filters.permission_scope.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') : 
                        'Select permission'}
                    </ThemedText>
                    <ThemedText style={styles.dropdownArrow}>
                      {showPermissionDropdown ? '▲' : '▼'}
                    </ThemedText>
                  </TouchableOpacity>
                  {showPermissionDropdown && (
                    <View style={styles.dropdownOptions}>
                      <TouchableOpacity 
                        style={styles.dropdownOption}
                        onPress={() => {
                          handleFilterChange('permission_scope', '');
                          setShowPermissionDropdown(false);
                        }}
                        activeOpacity={0.7}
                      >
                        <ThemedText style={styles.dropdownOptionText}>All Permissions</ThemedText>
                      </TouchableOpacity>
                      {permissions.map((permission) => (
                        <TouchableOpacity
                          key={permission}
                          style={styles.dropdownOption}
                          onPress={() => {
                            handleFilterChange('permission_scope', permission);
                            setShowPermissionDropdown(false);
                          }}
                          activeOpacity={0.7}
                        >
                          <ThemedText style={styles.dropdownOptionText}>
                            {permission.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                          </ThemedText>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>

                {/* Email Filter */}
                <View style={styles.filterGroup}>
                  <ThemedText style={styles.filterLabel}>Email Address</ThemedText>
                  <TextInput
                    style={styles.filterInput}
                    value={filters.email}
                    onChangeText={(value) => handleFilterChange('email', value)}
                    placeholder="Enter email address"
                    placeholderTextColor="#9ca3af"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>

                {/* Username Filter */}
                <View style={styles.filterGroup}>
                  <ThemedText style={styles.filterLabel}>Username</ThemedText>
                  <TextInput
                    style={styles.filterInput}
                    value={filters.username}
                    onChangeText={(value) => handleFilterChange('username', value)}
                    placeholder="Enter username"
                    placeholderTextColor="#9ca3af"
                    autoCorrect={false}
                  />
                </View>

                {/* First Name Filter */}
                <View style={styles.filterGroup}>
                  <ThemedText style={styles.filterLabel}>First Name</ThemedText>
                  <TextInput
                    style={styles.filterInput}
                    value={filters.first_name}
                    onChangeText={(value) => handleFilterChange('first_name', value)}
                    placeholder="Enter first name"
                    placeholderTextColor="#9ca3af"
                    autoCorrect={false}
                  />
                </View>

                {/* Last Name Filter */}
                <View style={styles.filterGroup}>
                  <ThemedText style={styles.filterLabel}>Last Name</ThemedText>
                  <TextInput
                    style={styles.filterInput}
                    value={filters.last_name}
                    onChangeText={(value) => handleFilterChange('last_name', value)}
                    placeholder="Enter last name"
                    placeholderTextColor="#9ca3af"
                    autoCorrect={false}
                  />
                </View>

                {/* Phone Number Filter */}
                <View style={styles.filterGroup}>
                  <ThemedText style={styles.filterLabel}>Phone Number</ThemedText>
                  <TextInput
                    style={styles.filterInput}
                    value={filters.phone_number}
                    onChangeText={(value) => handleFilterChange('phone_number', value)}
                    placeholder="Enter phone number"
                    placeholderTextColor="#9ca3af"
                    keyboardType="phone-pad"
                    autoCorrect={false}
                  />
                </View>
              </ScrollView>

              <View style={styles.filterActions}>
                <TouchableOpacity 
                  style={styles.clearButton} 
                  onPress={clearFilters}
                  activeOpacity={0.7}
                >
                  <ThemedText style={styles.clearButtonText}>Clear All</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity 
                  onPress={applyFilters}
                  activeOpacity={0.7}
                >
                  <LinearGradient colors={['#5469D4', '#4F46E5']} style={styles.applyButton}>
                    <ThemedText style={styles.applyButtonText}>Apply Filters</ThemedText>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 32,
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 16,
  },
  filterToggle: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
  },
  filterToggleActive: {
    backgroundColor: '#5469D4',
    borderColor: '#5469D4',
  },
  filterToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  filterToggleTextActive: {
    color: '#fff',
  },
  createButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  createButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  contentContainer: {
    flex: 1,
    marginTop: 16,
  },
  scrollView: {
    flex: 1,
  },
  listContainer: {
    paddingHorizontal: 32,
    paddingBottom: 32,
  },
  userCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  userHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  userName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    flex: 1,
  },
  permissionBadge: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  permissionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  userDetail: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 4,
  },
  createdContainer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  createdText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    gap: 24,
  },
  pageButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    backgroundColor: '#5469D4',
  },
  pageButtonDisabled: {
    backgroundColor: '#d1d5db',
  },
  pageButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  pageButtonTextDisabled: {
    color: '#9ca3af',
  },
  pageInfo: {
    fontSize: 14,
    color: '#6b7280',
  },
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingVertical: 16,
    paddingHorizontal: 20,
    zIndex: 1000,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  successBanner: {
    backgroundColor: '#10b981',
  },
  errorBanner: {
    backgroundColor: '#ef4444',
  },
  bannerText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  // Filter Modal Styles
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  filterModal: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: '90%',
    maxWidth: 600,
    maxHeight: '80%',
    overflow: 'hidden',
    zIndex: 1,
  },
  closeButtonContainer: {
    padding: 4,
  },
  filterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  filterTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f2937',
  },
  closeButton: {
    fontSize: 20,
    color: '#6b7280',
    padding: 4,
  },
  filterContent: {
    flex: 1,
    padding: 24,
  },
  filterGroup: {
    marginBottom: 20,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  filterInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 14,
    backgroundColor: '#fff',
    color: '#1f2937',
  },
  dropdown: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dropdownText: {
    fontSize: 14,
    color: '#1f2937',
    flex: 1,
  },
  placeholderText: {
    color: '#9ca3af',
  },
  dropdownArrow: {
    fontSize: 12,
    color: '#6b7280',
    marginLeft: 8,
  },
  dropdownOptions: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    marginTop: 4,
    maxHeight: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  dropdownOption: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  dropdownOptionText: {
    fontSize: 14,
    color: '#374151',
  },
  filterActions: {
    flexDirection: 'row',
    gap: 12,
    padding: 24,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  clearButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  clearButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  applyButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  applyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
});
