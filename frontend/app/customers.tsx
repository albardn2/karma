import React, { useState, useEffect } from 'react';
import { StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, Platform, Dimensions, Animated, Modal } from 'react-native';
import { View } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { apiCall } from '@/utils/api';
import { LinearGradient } from 'expo-linear-gradient';
import { MapViewComponent } from '@/components/MapView';
import { BottomNavigation } from '@/components/layout/BottomNavigation';
import { DesktopCustomersLayout } from '@/components/layouts/DesktopCustomersLayout';
import { Colors } from '@/constants/Colors';
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
  category: 'roastery' | 'restaurant' | 'minimarket' | 'supermarket' | 'distributer';
  coordinates: string | null;
  created_at: string;
  is_deleted: boolean;
  balance_per_currency: Record<string, number>;
}

interface CustomerPage {
  customers: Customer[];
  total_count: number;
  page: number;
  per_page: number;
  pages: number;
}

type ViewMode = 'list' | 'map';

export default function CustomersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { deleted, message } = useLocalSearchParams<{ deleted?: string; message?: string }>();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'roastery' | 'restaurant' | 'minimarket' | 'supermarket' | 'distributer'>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [screenData, setScreenData] = useState(Dimensions.get('window'));
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [banner, setBanner] = useState<{type: 'success' | 'error', message: string} | null>(null);
  const bannerAnimation = useState(new Animated.Value(0))[0];
  const [showFilters, setShowFilters] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);

  const [filters, setFilters] = useState<{
    uuid: string;
    category: string;
    email_address: string;
    company_name: string;
    full_name: string;
    phone_number: string;
  }>({
    uuid: '',
    category: '',
    email_address: '',
    company_name: '',
    full_name: '',
    phone_number: '',
  });

  const [appliedFilters, setAppliedFilters] = useState<{
    uuid: string;
    category: string;
    email_address: string;
    company_name: string;
    full_name: string;
    phone_number: string;
  }>({
    uuid: '',
    category: '',
    email_address: '',
    company_name: '',
    full_name: '',
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
    fetchCategories();
    fetchCustomers();

    // Show banner if customer was deleted
    if (deleted === 'true' && message) {
      showBanner('success', message);
      // Clear the URL parameters
      router.replace('/customers');
    }
  }, [deleted, message]);

  const fetchCategories = async () => {
    try {
      const response = await apiCall<string[]>('/customer/categories');

      if (response.status === 200 && response.data) {
        setCategories(response.data);
      } else {
        console.error('Error fetching categories:', response.error);
        // Fallback to static categories
        setCategories(['roastery', 'restaurant', 'minimarket', 'supermarket', 'distributer']);
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
      // Fallback to static categories
      setCategories(['roastery', 'restaurant', 'minimarket', 'supermarket', 'distributer']);
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
    // Test backend connectivity first
    testBackendConnection();
    fetchCustomers();
  }, []);

  useEffect(() => {
    fetchCustomers();
  }, [page, searchTerm, categoryFilter, appliedFilters]);

  const testBackendConnection = async () => {
    try {
      console.log('Testing backend connection...');
      // Test 1: Simple GET request to root
      try {
        const simpleResponse = await fetch('https://9145-2605-cb80-1009-1-91cf-e2f4-2b75-754a.ngrok-free.app/', {
          method: 'GET',
          headers: {
            'ngrok-skip-browser-warning': 'true',
          },
          mode: 'cors',
        });
        console.log('Simple GET response:', simpleResponse.status);
      } catch (simpleError) {
        console.log('Simple GET failed:', simpleError);
      }

      // Test 2: Health check
      const response = await fetch('https://9145-2605-cb80-1009-1-91cf-e2f4-2b75-754a.ngrok-free.app/health', {
        method: 'GET',
        headers: {
          'ngrok-skip-browser-warning': 'true',
        },
      });
      console.log('Backend health check response:', response.status);
      if (response.ok) {
        console.log('✅ Backend is accessible');
      } else {
        console.log('❌ Backend returned error:', response.status);
      }
    } catch (error) {
      console.log('❌ Backend connection failed:', error);
      Alert.alert(
        'Backend Connection Error', 
        'Cannot connect to the backend server. Please check if:\n\n1. Your backend is running\n2. The ngrok URL is correct and active\n3. Your network connection is stable'
      );
    }
  };

  const fetchCustomers = async () => {
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
        params.append('full_name', searchTerm);
      }

      if (categoryFilter !== 'all') {
        params.append('category', categoryFilter);
      }

      console.log('Making API call to:', `/customer/?${params.toString()}`);
      const response = await apiCall<CustomerPage>(`/customer/?${params.toString()}`);

      console.log('API Response:', response);

      if (response.status === 200 && response.data) {
        console.log('Successfully loaded customers from backend:', response.data);
        setCustomers(response.data.customers);
        setTotalPages(response.data.pages);
        // setFilteredCustomers(response.data.customers);  // Removed filteredCustomers
      } else {
        console.error('Failed to load customers from backend:', response);
        // Show error message instead of mock data
        if (response.status === 0) {
          Alert.alert('Network Error', 'Unable to connect to the backend server. Please check your connection.');
        } else if (response.status === 401) {
          Alert.alert('Authentication Error', 'Your session has expired. Please log in again.');
        } else {
          Alert.alert('Error', `Failed to load customers: ${response.error || 'Unknown error'}`);
        }
        // Set empty arrays instead of mock data
        // setCustomers([]);  // Modified to only set customers
        // setFilteredCustomers([]);   // Removed filteredCustomers
        setTotalPages(0);
      }
    } catch (error) {
      console.error('Error fetching customers:', error);
      Alert.alert('Error', 'Failed to load customers');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCustomer = () => {
    router.push('/customers/create');
  };

  const handleCustomerPress = (customer: Customer) => {
    router.push(`/customers/${customer.uuid}`);
  };

  const handleFilterChange = (field: keyof typeof filters, value: string) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const applyFilters = () => {
    setAppliedFilters({ ...filters });
    setPage(1);
    setShowFilters(false);
    setShowCategoryDropdown(false);
  };

  const clearFilters = () => {
    const emptyFilters = {
      uuid: '',
      category: '',
      email_address: '',
      company_name: '',
      full_name: '',
      phone_number: '',
    };
    setFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
    setPage(1);
    setShowFilters(false);
    setShowCategoryDropdown(false);
  };

  const hasActiveFilters = Object.values(appliedFilters).some(value => value.trim() !== '');

  const parseCoordinates = (coordinatesString: string | null): { lat: number; lng: number } | null => {
    if (!coordinatesString) return null;

    try {
      // Assuming coordinates are stored as "lat,lng" or similar format
      const coords = coordinatesString.split(',');
      if (coords.length === 2) {
        const lat = parseFloat(coords[0].trim());
        const lng = parseFloat(coords[1].trim());
        if (!isNaN(lat) && !isNaN(lng)) {
          return { lat, lng };
        }
      }
    } catch (error) {
      console.error('Error parsing coordinates:', error);
    }
    return null;
  };

  const TableHeader = () => (
    <View style={styles.tableHeader}>
      <ThemedText style={[styles.tableHeaderText, styles.nameHeaderColumn]}>Name & Company</ThemedText>
      <ThemedText style={[styles.tableHeaderText, styles.categoryHeaderColumn]}>Category</ThemedText>
      <ThemedText style={[styles.tableHeaderText, styles.contactHeaderColumn]}>Contact</ThemedText>
      <ThemedText style={[styles.tableHeaderText, styles.balanceHeaderColumn]}>Balance</ThemedText>
      <View style={styles.arrowHeaderColumn} />
    </View>
  );

  const CustomerCard = ({ customer }: { customer: Customer }) => {
    const formatBalances = () => {
      const balances = Object.entries(customer.balance_per_currency || {})
        .filter(([_, amount]) => amount !== 0)
        .map(([currency, amount]) => `${amount.toFixed(2)} ${currency}`)
        .slice(0, 1); // Show max 1 currency to save space

      if (balances.length === 0) return '0.00';
      return balances[0];
    };

    const getTotalBalance = () => {
      return Object.values(customer.balance_per_currency || {}).reduce((sum, amount) => sum + amount, 0);
    };

    const getBalanceColor = (balance: number) => {
      if (balance > 0) return '#059669';
      if (balance < 0) return '#dc2626';
      return '#6b7280';
    };

    const categoryColors = Colors.categories;

    return (
      <TouchableOpacity
        style={styles.tableRow}
        onPress={() => handleCustomerPress(customer)}
      >
        {/* Name & Company Column */}
        <View style={styles.nameColumn}>
          <ThemedText style={styles.customerName} numberOfLines={1}>{customer.full_name}</ThemedText>
          <ThemedText style={styles.companyName} numberOfLines={1}>{customer.company_name}</ThemedText>
        </View>

        {/* Category Column */}
        <View style={styles.categoryColumn}>
          <View style={[styles.categoryBadge, { backgroundColor: '#5469D4' }]}>
            <ThemedText style={styles.categoryText}>
              {customer.category.charAt(0).toUpperCase() + customer.category.slice(1)}
            </ThemedText>
          </View>
        </View>

        {/* Contact Column */}
        <View style={styles.contactColumn}>
          <ThemedText style={styles.contactText} numberOfLines={1}>
            {customer.phone_number}
          </ThemedText>
          <ThemedText style={styles.contactText} numberOfLines={1}>
            {customer.email_address || 'No email'}
          </ThemedText>
        </View>

        {/* Balance Column */}
        <View style={styles.balanceColumn}>
          <ThemedText style={[styles.balanceValue, { color: getBalanceColor(getTotalBalance()) }]}>
            {formatBalances()}
          </ThemedText>
        </View>

        {/* Arrow */}
        <View style={styles.arrowColumn}>
          <ThemedText style={styles.arrow}>›</ThemedText>
        </View>
      </TouchableOpacity>
    );
  };

  const MapMarker = ({ customer, onPress }: { customer: Customer; onPress: () => void }) => {
    const coords = parseCoordinates(customer.coordinates);
    if (!coords) return null;

    const totalBalance = Object.values(customer.balance_per_currency).reduce((sum, amount) => sum + amount, 0);
    const getMarkerColor = () => {
      if (totalBalance > 0) return '#10b981';
      if (totalBalance < 0) return '#ef4444';
      return '#5469D4';
    };

    return (
      <TouchableOpacity
        style={[styles.mapMarker, { backgroundColor: getMarkerColor() }]}
        onPress={onPress}
      >
        <ThemedText style={styles.markerText}>{customer.full_name.charAt(0)}</ThemedText>
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
        placeholder="Search by customer name..."
        value={searchTerm}
        onChangeText={setSearchTerm}
        placeholderTextColor="#666"
      />

      <View style={styles.categoryFilterContainer}>
        {(['all', 'roastery', 'restaurant', 'minimarket', 'supermarket', 'distributer'] as const).map((category) => (
          <TouchableOpacity
            key={category}
            style={[
              styles.filterButton,
              categoryFilter === category && styles.activeFilterButton
            ]}
            onPress={() => setCategoryFilter(category)}
          >
            <ThemedText style={[
              styles.filterButtonText,
              categoryFilter === category && styles.activeFilterButtonText
            ]}>
              {category.charAt(0).toUpperCase() + category.slice(1)}
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
          <ThemedText style={styles.loadingText}>Loading customers...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  // Use desktop layout for desktop users
  if (isDesktop) {
    return (
      <DesktopCustomersLayout
        onCustomerPress={handleCustomerPress}
        onCreateCustomer={handleCreateCustomer}
      />
    );
  }

  const filteredCustomers = customers.filter(customer => {
    // For desktop, use search term; for mobile, skip search filtering
    if (isDesktop) {
      const searchTermLower = searchTerm.toLowerCase();
      const fullNameLower = customer.full_name.toLowerCase();
      const companyNameLower = customer.company_name.toLowerCase();
      const matchesSearchTerm = fullNameLower.includes(searchTermLower) || companyNameLower.includes(searchTermLower);
      const matchesCategory = categoryFilter === 'all' || customer.category === categoryFilter;
      return matchesSearchTerm && matchesCategory;
    } else {
      // Mobile: only filter by category
      const matchesCategory = categoryFilter === 'all' || customer.category === categoryFilter;
      return matchesCategory;
    }
  });


  return (
    <ThemedView style={[
      styles.container,
      isNative && { 
        paddingTop: insets.top,
        paddingBottom: 0 // Let BottomNavigation handle bottom padding
      }
    ]}>
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
          Customers
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

          <TouchableOpacity onPress={handleCreateCustomer}>
            <LinearGradient
              colors={['#5469D4', '#4F46E5']}
              style={[
                styles.createButton,
                isDesktop && styles.desktopCreateButton,
                (isMobileWeb || isNative) && styles.mobileCreateButton
              ]}
            >
              <ThemedText style={styles.createButtonText}>+ Add Customer</ThemedText>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>

      {/* View Toggle Tabs for Mobile - Now at top */}
      {(isMobileWeb || isNative) && (
        <View style={styles.mobileViewToggleContainer}>
          <TouchableOpacity
            style={[
              styles.mobileViewToggleTab,
              styles.mobileViewToggleTabLeft,
              viewMode === 'list' && styles.activeMobileViewToggleTab
            ]}
            onPress={() => setViewMode('list')}
          >
            <ThemedText style={[
              styles.mobileViewToggleText,
              viewMode === 'list' && styles.activeMobileViewToggleText
            ]}>
              📋 List View
            </ThemedText>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.mobileViewToggleTab,
              styles.mobileViewToggleTabRight,
              viewMode === 'map' && styles.activeMobileViewToggleTab
            ]}
            onPress={() => setViewMode('map')}
          >
            <ThemedText style={[
              styles.mobileViewToggleText,
              viewMode === 'map' && styles.activeMobileViewToggleText
            ]}>
              🗺️ Map View
            </ThemedText>
          </TouchableOpacity>
        </View>
      )}

      {/* Filters - Only show for desktop */}
      {isDesktop && <FilterSection />}

      {/* Content */}
      <View style={styles.contentContainer}>
        {viewMode === 'list' ? (
          <View style={{ flex: 1 }}>
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={[
                styles.listContainer,
                isDesktop && styles.desktopList,
                (isMobileWeb || isNative) && styles.mobileList,
                isMobileWeb && { paddingBottom: 20 }, // Minimal padding for mobile web list view
                isNative && { paddingBottom: 20 }
              ]}
              showsVerticalScrollIndicator={false}
            >
              {filteredCustomers.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <ThemedText style={styles.emptyText}>
                    {customers.length === 0 ? 'No customers found' : 'No customers match your filters'}
                  </ThemedText>
                </View>
              ) : (
                <>
                  <TableHeader />
                  {filteredCustomers.map((customer) => (
                    <CustomerCard key={customer.uuid} customer={customer} />
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
        ) : (
          <View style={[{ flex: 1 }, (isMobileWeb || isNative) && { marginBottom: 0 }]}>
            <MapViewComponent 
              onCustomerPress={handleCustomerPress} 
              searchTerm={isDesktop ? searchTerm : ''}
              categoryFilter={categoryFilter}
            />
          </View>
        )}
      </View>




      {/* Filter Modal */}
      {showFilters && (
        <Modal
          visible={showFilters}
          transparent={true}
          animationType="slide"
          onRequestClose={() => {
            setShowFilters(false);
            setShowCategoryDropdown(false);
          }}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalBackdrop} />
            <View style={[
              styles.filterModal,
              (isMobileWeb || isNative) && styles.mobileFilterModal
            ]}>
              <View style={styles.filterHeader}>
                <ThemedText style={styles.filterTitle}>Filter Customers</ThemedText>
                <TouchableOpacity 
                  onPress={() => {
                    setShowFilters(false);
                    setShowCategoryDropdown(false);
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

                {/* Category Filter */}
                <View style={styles.filterGroup}>
                  <ThemedText style={styles.filterLabel}>Category</ThemedText>
                  <TouchableOpacity 
                    style={styles.dropdown}
                    onPress={() => setShowCategoryDropdown(!showCategoryDropdown)}
                    activeOpacity={0.7}
                  >
                    <ThemedText style={[styles.dropdownText, !filters.category && styles.placeholderText]}>
                      {filters.category ? filters.category.charAt(0).toUpperCase() + filters.category.slice(1) : 'Select category'}
                    </ThemedText>
                    <ThemedText style={styles.dropdownArrow}>
                      {showCategoryDropdown ? '▲' : '▼'}
                    </ThemedText>
                  </TouchableOpacity>
                  {showCategoryDropdown && (
                    <View style={styles.dropdownOptions}>
                      <TouchableOpacity 
                        style={styles.dropdownOption}
                        onPress={() => {
                          handleFilterChange('category', '');
                          setShowCategoryDropdown(false);
                        }}
                        activeOpacity={0.7}
                      >
                        <ThemedText style={styles.dropdownOptionText}>All Categories</ThemedText>
                      </TouchableOpacity>
                      {categories.map((category) => (
                        <TouchableOpacity
                          key={category}
                          style={styles.dropdownOption}
                          onPress={() => {
                            handleFilterChange('category', category);
                            setShowCategoryDropdown(false);
                          }}
                          activeOpacity={0.7}
                        >
                          <ThemedText style={styles.dropdownOptionText}>
                            {category.charAt(0).toUpperCase() + category.slice(1)}
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
                    value={filters.email_address}
                    onChangeText={(value) => handleFilterChange('email_address', value)}
                    placeholder="Enter email address"
                    placeholderTextColor="#9ca3af"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>

                {/* Company Name Filter */}
                <View style={styles.filterGroup}>
                  <ThemedText style={styles.filterLabel}>Company Name</ThemedText>
                  <TextInput
                    style={styles.filterInput}
                    value={filters.company_name}
                    onChangeText={(value) => handleFilterChange('company_name', value)}
                    placeholder="Enter company name"
                    placeholderTextColor="#9ca3af"
                    autoCorrect={false}
                  />
                </View>

                {/* Full Name Filter */}
                <View style={styles.filterGroup}>
                  <ThemedText style={styles.filterLabel}>Full Name</ThemedText>
                  <TextInput
                    style={styles.filterInput}
                    value={filters.full_name}
                    onChangeText={(value) => handleFilterChange('full_name', value)}
                    placeholder="Enter customer name"
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
    fontSize: 16,backgroundColor: '#fff',marginBottom: 16,
  },
  desktopSearchInput: {
    fontSize: 16,
  },
  mobileSearchInput: {
    fontSize: 14,
  },
  categoryFilterContainer: {
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
  mobileViewToggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  mobileViewToggleTab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  mobileViewToggleTabLeft: {
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
    borderRightWidth: 0.5,
  },
  mobileViewToggleTabRight: {
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
    borderLeftWidth: 0.5,
  },
  activeMobileViewToggleTab: {
    backgroundColor: '#5469D4',
    borderColor: '#5469D4',
  },
  mobileViewToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  activeMobileViewToggleText: {
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
    paddingBottom: 0, // Remove bottom padding to extend to toolbar
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
  categoryHeaderColumn: {
    flex: 1.5,
    textAlign: 'center',
    marginRight: 8,
  },
  contactHeaderColumn: {
    flex: 2.2,
    marginRight: 8,
  },
  balanceHeaderColumn: {
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
  customerName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 1,
  },
  companyName: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '400',
  },
  categoryColumn: {
    flex: 1.5,
    alignItems: 'center',
    marginRight: 8,
  },
  categoryBadge: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 8,
    alignItems: 'center',
    minWidth: 50,
    backgroundColor: '#5469D4',
  },
  categoryText: {
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
  balanceColumn: {
    flex: 1.3,
    alignItems: 'flex-end',
    marginRight: 4,
  },
  balanceValue: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'right',
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
  // View Toggle Tabs Styles
  viewToggleContainer: {
    position: 'absolute',
    left: '50%',
    transform: [{ translateX: -100 }],
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 25,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    zIndex: 1000,
  },
  viewToggleTab: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    minWidth: 100,
    alignItems: 'center',
  },
  viewToggleTabLeft: {
    borderTopLeftRadius: 25,
    borderBottomLeftRadius: 25,
  },
  viewToggleTabRight: {
    borderTopRightRadius: 25,
    borderBottomRightRadius: 25,
  },
  activeViewToggleTab: {
    backgroundColor: '#5469D4',
  },
  viewToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  activeViewToggleText: {
    color: '#fff',
  },
  // Map View Styles
  mapContainer: {
    flex: 1,
  },
  map: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  mapOverlay: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  mapOverlayText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
  },
  emptyMapContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyMapText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyMapSubtext: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
  },
  // Pagination Styles
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