import React, { useState, useEffect } from 'react';
import { StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, Platform, Dimensions, Animated, Modal } from 'react-native';
import { View } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { apiCall } from '@/utils/api';
import { LinearGradient } from 'expo-linear-gradient';
import { BottomNavigation } from '@/components/layout/BottomNavigation';
import { DesktopUsersLayout } from '@/components/layouts/DesktopUsersLayout';
import { Colors } from '@/constants/Colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

export default function UsersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { deleted, message } = useLocalSearchParams<{ deleted?: string; message?: string }>();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [permissionFilter, setPermissionFilter] = useState<'all' | 'superuser' | 'admin' | 'operation_manager' | 'accountant' | 'operator' | 'driver' | 'sales'>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [screenData, setScreenData] = useState(Dimensions.get('window'));
  const [banner, setBanner] = useState<{type: 'success' | 'error', message: string} | null>(null);
  const bannerAnimation = useState(new Animated.Value(0))[0];
  const [showFilters, setShowFilters] = useState(false);
  const [showPermissionDropdown, setShowPermissionDropdown] = useState(false);
  const [permissions, setPermissions] = useState<string[]>([]);

  const [filters, setFilters] = useState<{
    uuid: string;
    permission_scope: string;
    email: string;
    username: string;
    first_name: string;
    last_name: string;
    phone_number: string;
  }>({
    uuid: '',
    permission_scope: '',
    email: '',
    username: '',
    first_name: '',
    last_name: '',
    phone_number: '',
  });

  const [appliedFilters, setAppliedFilters] = useState<{
    uuid: string;
    permission_scope: string;
    email: string;
    username: string;
    first_name: string;
    last_name: string;
    phone_number: string;
  }>({
    uuid: '',
    permission_scope: '',
    email: '',
    username: '',
    first_name: '',
    last_name: '',
    phone_number: '',
  });

  // Platform detection
  const isWeb = Platform.OS === 'web';
  const isNative = Platform.OS === 'ios' || Platform.OS === 'android';
  const isMobileWeb = isWeb && screenData.width < 768;
  const isDesktop = isWeb && screenData.width >= 768;

  useEffect(() => {
    const onChange = (result: any) => {
      setScreenData(result.window);
    };
    const subscription = Dimensions.addEventListener('change', onChange);
    return () => subscription?.remove();
  }, []);

  useEffect(() => {
    fetchPermissions();
    fetchUsers();

    // Show banner if user was deleted
    if (deleted === 'true' && message) {
      showBanner('success', message);
      // Clear the URL parameters
      router.replace('/users');
    }
  }, [deleted, message]);

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

  useEffect(() => {
    fetchUsers();
    fetchPermissions();
  }, [page, searchTerm, permissionFilter, appliedFilters]);

  const fetchUsers = async () => {
    try {
      setLoading(true);

      // Build query parameters
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

      if (searchTerm) {
        params.append('username', searchTerm);
      }

      if (permissionFilter !== 'all') {
        params.append('permission_scope', permissionFilter);
      }

      console.log('Making API call to:', `/user/?${params.toString()}`);
      const response = await apiCall<UserPage>(`/auth/users?${params.toString()}`);

      console.log('API Response:', response);

      if (response.status === 200 && response.data) {
        console.log('Successfully loaded users from backend:', response.data);
        setUsers(response.data.users);
        setTotalPages(response.data.pages);
      } else {
        console.error('Failed to load users from backend:', response);
        if (response.status === 0) {
          Alert.alert('Network Error', 'Unable to connect to the backend server. Please check your connection.');
        } else if (response.status === 401) {
          Alert.alert('Authentication Error', 'Your session has expired. Please log in again.');
        } else {
          Alert.alert('Error', `Failed to load users: ${response.error || 'Unknown error'}`);
        }
        setTotalPages(0);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      Alert.alert('Error', 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = () => {
    router.push('/users/create');
  };

  const handleUserPress = (user: User) => {
    router.push(`/users/${user.uuid}`);
  };

  const handleFilterChange = (field: keyof typeof filters, value: string) => {
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

  const hasActiveFilters = Object.values(appliedFilters).some(value => value.trim() !== '');

  const TableHeader = () => (
    <View style={styles.tableHeader}>
      <ThemedText style={[styles.tableHeaderText, styles.nameHeaderColumn]}>Name & Username</ThemedText>
      <ThemedText style={[styles.tableHeaderText, styles.permissionHeaderColumn]}>Permission</ThemedText>
      <ThemedText style={[styles.tableHeaderText, styles.contactHeaderColumn]}>Contact</ThemedText>
      <ThemedText style={[styles.tableHeaderText, styles.createdHeaderColumn]}>Created</ThemedText>
      <View style={styles.arrowHeaderColumn} />
    </View>
  );

  const UserCard = ({ user }: { user: User }) => {
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

    return (
      <TouchableOpacity
        style={styles.tableRow}
        onPress={() => handleUserPress(user)}
      >
        {/* Name & Username Column */}
        <View style={styles.nameColumn}>
          <ThemedText style={styles.userName} numberOfLines={1}>
            {user.first_name} {user.last_name}
          </ThemedText>
          <ThemedText style={styles.username} numberOfLines={1}>@{user.username}</ThemedText>
        </View>

        {/* Permission Column */}
        <View style={styles.permissionColumn}>
          <View style={[styles.permissionBadge, { backgroundColor: getPermissionColor(user.permission_scope) }]}>
            <ThemedText style={styles.permissionText}>
              {getPermissionLabel(user.permission_scope)}
            </ThemedText>
          </View>
        </View>

        {/* Contact Column */}
        <View style={styles.contactColumn}>
          <ThemedText style={styles.contactText} numberOfLines={1}>
            {user.email || 'No email'}
          </ThemedText>
          <ThemedText style={styles.contactText} numberOfLines={1}>
            {user.phone_number || 'No phone'}
          </ThemedText>
        </View>

        {/* Created Column */}
        <View style={styles.createdColumn}>
          <ThemedText style={styles.createdText}>
            {formatDate(user.created_at)}
          </ThemedText>
        </View>

        {/* Arrow */}
        <View style={styles.arrowColumn}>
          <ThemedText style={styles.arrow}>›</ThemedText>
        </View>
      </TouchableOpacity>
    );
  };

  const FilterSection = () => (
    <View style={[
      styles.filterSection,
      isDesktop && styles.desktopFilter,
      (isMobileWeb || isNative) && styles.mobileFilter
    ]}>
      <TextInput
        style={[
          styles.searchInput,
          isDesktop && styles.desktopSearchInput,
          (isMobileWeb || isNative) && styles.mobileSearchInput
        ]}
        placeholder="Search by username..."
        value={searchTerm}
        onChangeText={setSearchTerm}
        placeholderTextColor="#666"
      />

      <View style={styles.permissionFilterContainer}>
        {(['all', 'superuser', 'admin', 'operation_manager', 'accountant', 'operator', 'driver', 'sales'] as const).map((permission) => (
          <TouchableOpacity
            key={permission}
            style={[
              styles.filterButton,
              permissionFilter === permission && styles.activeFilterButton
            ]}
            onPress={() => setPermissionFilter(permission)}
          >
            <ThemedText style={[
              styles.filterButtonText,
              permissionFilter === permission && styles.activeFilterButtonText
            ]}>
              {permission === 'all' ? 'All' : 
               permission === 'operation_manager' ? 'Op. Manager' :
               permission.charAt(0).toUpperCase() + permission.slice(1)}
            </ThemedText>
          </TouchableOpacity>
        ))}
      </View>
    </View>
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

  // Use desktop layout for desktop users
  if (isDesktop) {
    return (
      <DesktopUsersLayout
        onUserPress={handleUserPress}
        onCreateUser={handleCreateUser}
      />
    );
  }

  const filteredUsers = users.filter(user => {
    // For desktop, use search term; for mobile, skip search filtering
    if (isDesktop) {
      const searchTermLower = searchTerm.toLowerCase();
      const usernameLower = user.username.toLowerCase();
      const firstNameLower = user.first_name.toLowerCase();
      const lastNameLower = user.last_name.toLowerCase();
      const matchesSearchTerm = usernameLower.includes(searchTermLower) || 
                               firstNameLower.includes(searchTermLower) || 
                               lastNameLower.includes(searchTermLower);
      const matchesPermission = permissionFilter === 'all' || user.permission_scope === permissionFilter;
      return matchesSearchTerm && matchesPermission;
    } else {
      // Mobile: only filter by permission
      const matchesPermission = permissionFilter === 'all' || user.permission_scope === permissionFilter;
      return matchesPermission;
    }
  });

  return (
    <ThemedView style={[styles.container, isNative && { paddingTop: insets.top }]}>
      {/* Banner */}
      {banner && (
        <Animated.View style={[
          styles.banner,
          banner.type === 'success' ? styles.successBanner : styles.errorBanner,
          { 
            opacity: bannerAnimation, 
            transform: [{ translateY: bannerAnimation.interpolate({ inputRange: [0,1], outputRange: [-100,0] }) }],
            top: isNative ? insets.top : 0,
            paddingTop: isNative ? 0 : 8
          }
        ]}>
          <ThemedText style={styles.bannerText}>{banner.message}</ThemedText>
        </Animated.View>
      )}

      {/* Header */}
      <View style={[
        styles.header,
        isDesktop && styles.desktopHeader,
        (isMobileWeb || isNative) && styles.mobileHeader
      ]}>
        <ThemedText style={[
          styles.title,
          isDesktop && styles.desktopTitle,
          (isMobileWeb || isNative) && styles.mobileTitle
        ]}>
          Users
        </ThemedText>

        <View style={styles.headerActions}>
          {/* Filters Button for Mobile */}
          {(isMobileWeb || isNative) && (
            <TouchableOpacity
              style={[styles.filterToggle, hasActiveFilters && styles.filterToggleActive]}
              onPress={() => setShowFilters(true)}
            >
              <ThemedText style={[styles.filterToggleText, hasActiveFilters && styles.filterToggleTextActive]}>
                🔍 Filters {hasActiveFilters && `(${Object.values(appliedFilters).filter(v => v.trim()).length})`}
              </ThemedText>
            </TouchableOpacity>
          )}

          <TouchableOpacity onPress={handleCreateUser}>
            <LinearGradient
              colors={['#5469D4', '#4F46E5']}
              style={[
                styles.createButton,
                isDesktop && styles.desktopCreateButton,
                (isMobileWeb || isNative) && styles.mobileCreateButton
              ]}
            >
              <ThemedText style={styles.createButtonText}>+ Add User</ThemedText>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>

      {/* Filters - Only show for desktop */}
      {isDesktop && <FilterSection />}

      {/* Content */}
      <View style={styles.contentContainer}>
        <View style={{ flex: 1 }}>
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={[
              styles.listContainer,
              isDesktop && styles.desktopList,
              (isMobileWeb || isNative) && styles.mobileList,
              isMobileWeb && { paddingBottom: 20 },
              isNative && { paddingBottom: 20 }
            ]}
            showsVerticalScrollIndicator={false}
          >
            {filteredUsers.length === 0 ? (
              <View style={styles.emptyContainer}>
                <ThemedText style={styles.emptyText}>
                  {users.length === 0 ? 'No users found' : 'No users match your filters'}
                </ThemedText>
              </View>
            ) : (
              <>
                <TableHeader />
                {filteredUsers.map((user) => (
                  <UserCard key={user.uuid} user={user} />
                ))}
              </>
            )}
          </ScrollView>

          {/* Pagination Controls - Show for all platforms when there are multiple pages */}
          {totalPages > 1 && (
            <View style={[
              styles.pagination,
              isDesktop && styles.desktopPagination,
              (isMobileWeb || isNative) && styles.mobilePagination
            ]}>
              <TouchableOpacity
                style={[
                  styles.pageButton,
                  page === 1 && styles.pageButtonDisabled
                ]}
                onPress={() => page > 1 && setPage(page - 1)}
                disabled={page === 1}
              >
                <ThemedText style={[
                  styles.pageButtonText,
                  page === 1 && styles.pageButtonTextDisabled
                ]}>
                  Previous
                </ThemedText>
              </TouchableOpacity>

              <View style={styles.pageInfo}>
                <ThemedText style={styles.pageInfoText}>
                  Page {page} of {totalPages}
                </ThemedText>
              </View>

              <TouchableOpacity
                style={[
                  styles.pageButton,
                  page === totalPages && styles.pageButtonDisabled
                ]}
                onPress={() => page < totalPages && setPage(page + 1)}
                disabled={page === totalPages}
              >
                <ThemedText style={[
                  styles.pageButtonText,
                  page === totalPages && styles.pageButtonTextDisabled
                ]}>
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
          animationType="slide"
          onRequestClose={() => {
            setShowFilters(false);
            setShowPermissionDropdown(false);
          }}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalBackdrop} />
            <View style={[
              styles.filterModal,
              (isMobileWeb || isNative) && styles.mobileFilterModal
            ]}>
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
    position: 'relative',
    width: '100%',
    height: '100vh',
    overflow: 'hidden',
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
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  desktopHeader: {
    paddingHorizontal: 32,
    paddingVertical: 24,
  },
  mobileHeader: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  title: {
    fontWeight: 'bold',
    color: '#1f2937',
    flex: 1,
  },
  desktopTitle: {
    fontSize: 32,
  },
  mobileTitle: {
    fontSize: 24,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  filterToggle: {
    paddingVertical: 10,
    paddingHorizontal: 16,
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
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  filterToggleTextActive: {
    color: '#fff',
  },
  createButton: {
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  desktopCreateButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  mobileCreateButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  createButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  filterSection: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  desktopFilter: {
    paddingHorizontal: 32,
    paddingVertical: 20,
  },
  mobileFilter: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    backgroundColor: '#fff',
    marginBottom: 16,
  },
  desktopSearchInput: {
    fontSize: 16,
  },
  mobileSearchInput: {
    fontSize: 14,
  },
  permissionFilterContainer: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  filterButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
  },
  activeFilterButton: {
    backgroundColor: '#5469D4',
    borderColor: '#5469D4',
  },
  filterButtonText: {
    fontSize: 14,
    color: '#6b7280',
  },
  activeFilterButtonText: {
    color: '#fff',
  },
  contentContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  scrollView: {
    flex: 1,
    height: '100%',
  },
  listContainer: {
    paddingBottom: 20,
  },
  desktopList: {
    paddingHorizontal: 32,
    paddingTop: 24,
  },
  mobileList: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 0,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    borderBottomWidth: 2,
    borderBottomColor: '#e2e8f0',
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 1,
  },
  tableHeaderText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    lineHeight: 12,
  },
  nameHeaderColumn: {
    flex: 2.8,
    marginRight: 8,
  },
  permissionHeaderColumn: {
    flex: 1.8,
    textAlign: 'center',
    marginRight: 8,
  },
  contactHeaderColumn: {
    flex: 2.2,
    marginRight: 8,
  },
  createdHeaderColumn: {
    flex: 1.3,
    textAlign: 'right',
    marginRight: 4,
  },
  arrowHeaderColumn: {
    width: 16,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingVertical: 8,
    paddingHorizontal: 12,
    minHeight: 48,
  },
  nameColumn: {
    flex: 2.8,
    marginRight: 8,
  },
  userName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 1,
  },
  username: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '400',
  },
  permissionColumn: {
    flex: 1.8,
    alignItems: 'center',
    marginRight: 8,
  },
  permissionBadge: {    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 8,
    alignItems: 'center',
    minWidth: 60,
  },
  permissionText: {
    fontSize: 8,
    fontWeight: '600',
    color: '#fff',
    textTransform: 'capitalize',
  },
  contactColumn: {
    flex: 2.2,
    marginRight: 8,
  },
  contactText: {
    fontSize: 10,
    color: '#475569',
    marginBottom: 1,
  },
  createdColumn: {
    flex: 1.3,
    alignItems: 'flex-end',
    marginRight: 4,
  },
  createdText: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'right',
    color: '#64748b',
  },
  arrowColumn: {
    width: 16,
    alignItems: 'center',
  },
  arrow: {
    fontSize: 14,
    color: '#9ca3af',
    fontWeight: '300',
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
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  desktopPagination: {
    paddingHorizontal: 32,
    paddingVertical: 16,
  },
  mobilePagination: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 90, // Ensure visibility above bottom navigation
    backgroundColor: '#fff',
  },
  pageButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    backgroundColor: '#5469D4',
    minWidth: 80,
    alignItems: 'center',
  },
  pageButtonDisabled: {
    backgroundColor: '#d1d5db',
  },
  pageButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  pageButtonTextDisabled: {
    color: '#9ca3af',
  },
  pageInfo: {
    flex: 1,
    alignItems: 'center',
  },
  pageInfoText: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingVertical: 16,
    paddingHorizontal: 20,
    zIndex: 9999,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 10,
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
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
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
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: '90%',
    minHeight: '90%',
    overflow: 'hidden',
    zIndex: 1,
  },
  mobileFilterModal: {
    borderRadius: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  closeButtonContainer: {
    padding: 4,
  },
  filterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
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
    padding: 20,
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
    justifyContent: 'space-between',
    paddingTop: 20,
    paddingBottom: 10,
    marginTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    gap: 12,
    backgroundColor: '#fff',
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