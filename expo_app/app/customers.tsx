import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, Platform, Dimensions, Animated, Modal, RefreshControl, Pressable, KeyboardAvoidingView } from 'react-native';
import { View } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Stack, useRouter, useFocusEffect } from 'expo-router';
import { apiCall } from '@/utils/api';
import { LinearGradient } from 'expo-linear-gradient';
import { MapViewComponent } from '@/components/MapView';
import { BottomNavigation } from '@/components/layout/BottomNavigation';
import { DesktopCustomersLayout } from '@/components/layouts/DesktopCustomersLayout';
import { Colors } from '@/constants/Colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';
import { takeListFlash, takeListStale } from '@/utils/listRefresh';

interface Customer {
  uuid: string;
  email_address: string | null;
  company_name: string;
  full_name: string;
  phone_number: string;
  full_address: string;
  business_cards: string | null;
  notes: string | null;
  category: 'roastery' | 'restaurant' | 'minimarket' | 'supermarket' | 'distributer' | 'school' | 'university' | 'hospital';
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
  const { t, tef } = useLanguage();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  // Only the FIRST load takes over the screen. Every later fetch (a page, a
  // filter, a search keystroke) used to swap the whole screen for a spinner,
  // which would unmount the search box mid-typing and reset the map.
  const [hasLoaded, setHasLoaded] = useState(false);
  // what is typed, and the debounced term that is actually searched
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [screenData, setScreenData] = useState(Dimensions.get('window'));
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [banner, setBanner] = useState<{type: 'success' | 'error', message: string} | null>(null);
  const bannerAnimation = useState(new Animated.Value(0))[0];
  const [showFilters, setShowFilters] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);

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

  // The list itself loads from the effect below; fetching here as well sent
  // the same first request twice.
  useEffect(() => {
    fetchCategories();
  }, []);

  // search as you type, without a request per keystroke
  useEffect(() => {
    const term = searchInput.trim();
    if (term === searchTerm) return;
    const timer = setTimeout(() => {
      setSearchTerm(term);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput, searchTerm]);

  const fetchCategories = async () => {
    try {
      const response = await apiCall<string[]>('/customer/categories');

      if (response.status === 200 && response.data) {
        setCategories(response.data);
      } else {
        console.error('Error fetching categories:', response.error);
        // Fallback to static categories
        setCategories(['roastery', 'restaurant', 'minimarket', 'supermarket', 'distributer', 'school', 'university', 'hospital']);
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
      // Fallback to static categories
      setCategories(['roastery', 'restaurant', 'minimarket', 'supermarket', 'distributer', 'school', 'university', 'hospital']);
    }
  };

  const showBanner = (type: 'success' | 'error', message: string) => {
    setBanner({ type, message });
    Animated.sequence([
      Animated.timing(bannerAnimation, { toValue: 1, duration: 300, useNativeDriver: true }),
      // long enough to read after the screen transition that brings you here
      Animated.delay(4000),
      Animated.timing(bannerAnimation, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setBanner(null));
  };

  useEffect(() => {
    fetchCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, searchTerm, appliedFilters]);

  // Coming back from create, edit or delete: this screen stayed mounted, so
  // without this it showed the customer as it was (or still listed a deleted
  // one). Those screens mark the list stale and leave a confirmation for it.
  const fetchRef = useRef<() => void>(() => {});
  // the map keeps its own pins, so a stale list means a stale map too
  const [mapReloadKey, setMapReloadKey] = useState(0);
  useFocusEffect(
    useCallback(() => {
      if (takeListStale('/customer/')) {
        fetchRef.current();
        setMapReloadKey((k) => k + 1);
      }
      const flash = takeListFlash('/customer/');
      if (flash) showBanner('success', flash);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  // Requests overlap now that the screen stays usable while one is in flight
  // (search as you type, a quick second Next): only the latest may land, or an
  // older page's rows show under the newer page number or search term.
  const requestSeqRef = useRef(0);
  const listScrollRef = useRef<ScrollView>(null);

  const fetchCustomers = async () => {
    const seq = ++requestSeqRef.current;
    const isLatest = () => seq === requestSeqRef.current;
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

      // name, company or phone — one box, matched server-side
      if (searchTerm) {
        params.append('search', searchTerm);
      }

      console.log('Making API call to:', `/customer/?${params.toString()}`);
      const response = await apiCall<CustomerPage>(`/customer/?${params.toString()}`);

      if (!isLatest()) return;

      if (response.status === 200 && response.data) {
        const pages = response.data.pages;
        setTotalPages(pages);
        // the page we were on emptied (its last row was just deleted): step
        // back to the new last page, which the page effect then fetches
        if (pages > 0 && page > pages) {
          setPage(pages);
          return;
        }
        setCustomers(response.data.customers);
      } else {
        console.error('Failed to load customers from backend:', response);
        // Show error message instead of mock data
        if (response.status === 0) {
          Alert.alert(t('customers.networkError'), t('customers.networkErrorMessage'));
        } else if (response.status === 401) {
          Alert.alert(t('customers.authenticationError'), t('customers.sessionExpired'));
        } else {
          Alert.alert(t('customers.error'), t('customers.failedToLoadCustomersDetail', { error: response.error || t('customers.unknownError') }));
        }
        // Set empty arrays instead of mock data
        // setCustomers([]);  // Modified to only set customers
        // setFilteredCustomers([]);   // Removed filteredCustomers
        setTotalPages(0);
      }
    } catch (error) {
      if (!isLatest()) return;
      console.error('Error fetching customers:', error);
      Alert.alert(t('customers.error'), t('customers.failedToLoadCustomers'));
    } finally {
      // a superseded request must not end the newer one's loading state
      if (isLatest()) {
        setLoading(false);
        setHasLoaded(true);
      }
    }
  };
  fetchRef.current = fetchCustomers;

  // a new page, search or filter opens at its first row; the list stays
  // mounted across fetches now, so it would otherwise keep the old offset
  useEffect(() => {
    listScrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [page, searchTerm, appliedFilters]);

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
  };

  // The sheet edits a draft. Closing it without applying throws the draft away
  // — it used to survive, so text never applied reappeared next time while the
  // badge counted only what was applied.
  const openFilters = () => {
    setFilters({ ...appliedFilters });
    setShowFilters(true);
  };
  const closeFilters = () => {
    setFilters({ ...appliedFilters });
    setShowFilters(false);
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
  };

  const hasActiveFilters = Object.values(appliedFilters).some(value => value.trim() !== '');

  // the map shows exactly what the list shows: the same params, blanks omitted
  const mapFilters = useMemo(() => {
    const out: Record<string, string> = {};
    Object.entries(appliedFilters).forEach(([key, value]) => {
      if (value.trim()) out[key] = value.trim();
    });
    if (searchTerm) out.search = searchTerm;
    return out;
  }, [appliedFilters, searchTerm]);

  const handleRefresh = async () => {
    console.log('Pull to refresh triggered');
    setRefreshing(true);

    try {
      // Reload what is on screen. This used to reset the page and the search
      // AND fetch with the old page at the same time, so two requests raced
      // and the older page's rows could land under "Page 1 of N".
      await fetchCustomers();

      console.log('Refresh completed successfully');
    } catch (error) {
      console.error('Error refreshing customers:', error);
      Alert.alert(t('customers.error'), t('customers.failedToRefresh'));
    } finally {
      setRefreshing(false);
    }
  };

  const TableHeader = () => (
    <View style={styles.tableHeader}>
      <ThemedText style={[styles.tableHeaderText, styles.nameHeaderColumn]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{t('customers.nameAndCompany')}</ThemedText>
      <ThemedText style={[styles.tableHeaderText, styles.categoryHeaderColumn]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{t('customers.category')}</ThemedText>
      <ThemedText style={[styles.tableHeaderText, styles.contactHeaderColumn]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{t('customers.contact')}</ThemedText>
      <ThemedText style={[styles.tableHeaderText, styles.balanceHeaderColumn]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{t('customers.balance')}</ThemedText>
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
            <ThemedText style={styles.categoryText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
              {tef(customer.category)}
            </ThemedText>
          </View>
        </View>

        {/* Contact Column */}
        <View style={styles.contactColumn}>
          <ThemedText style={styles.contactText} numberOfLines={1}>
            {customer.phone_number}
          </ThemedText>
          <ThemedText style={styles.contactText} numberOfLines={1}>
            {customer.email_address || t('customers.noEmail')}
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

  if (loading && !hasLoaded) {
    return (
      <ThemedView style={styles.container}>
        {/* the screen draws its own header; without this the native one, titled
            "customers", flashed over the spinner */}
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#5469D4" />
          <ThemedText style={styles.loadingText}>{t('customers.loadingCustomers')}</ThemedText>
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

  const isFiltered = hasActiveFilters || !!searchTerm;


  return (
    <ThemedView style={[
      styles.container,
      // The status-bar inset, which this screen never applied — it computed `insets`
      // and used it nowhere, relying on the native header for that space. With the
      // native header gone (it was the source of the "(tabs)" back label) the top row
      // would sit under the status bar and its buttons would be unreachable.
      { paddingTop: insets.top },
      isNative && {
        paddingBottom: 0 // Let BottomNavigation handle bottom padding
      }
    ]}>
      {/* No native header: its back button carries the previous route's title, which
          reads "(tabs)". This screen draws its own chevron below, like every other. */}
      <Stack.Screen options={{ headerShown: false }} />

      {/* Banner */}
      {banner && (
        <Animated.View style={[
          styles.banner,
          banner.type === 'success' ? styles.successBanner : styles.errorBanner,
          // below the status bar: at top 0 it sat behind the clock and notch
          { top: insets.top },
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
        {/* This screen predates the shared scaffolds and draws its own header, so it
            never picked up the back chevron the scaffolds provide. Same glyph, same
            colour, same fallback as everywhere else. */}
        <TouchableOpacity
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)?tab=menu'))}
          hitSlop={12}
          testID="customers-back"
        >
          <ThemedText style={styles.backChevron}>‹</ThemedText>
        </TouchableOpacity>

        {/* No spacer and no title: styles.header is already justifyContent:
            'space-between', so with just these two children the chevron sits left and
            the actions sit right on their own. The menu tile tapped to get here
            already said "Customers". */}
        <View style={styles.headerActions}>
          {/* Filters Button for Mobile */}
          {(isMobileWeb || isNative) && (
            <TouchableOpacity
              style={[styles.filterToggle, hasActiveFilters && styles.filterToggleActive]}
              onPress={openFilters}
            >
              <ThemedText style={[styles.filterToggleText, hasActiveFilters && styles.filterToggleTextActive]}>
                🔍 {t('customers.filters')} {hasActiveFilters && `(${Object.values(appliedFilters).filter(v => v.trim()).length})`}
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
              <ThemedText style={styles.createButtonText}>+ {t('customers.addCustomer')}</ThemedText>
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
              📋 {t('customers.listView')}
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
              🗺️ {t('customers.mapView')}
            </ThemedText>
          </TouchableOpacity>
        </View>
      )}

      {/* Search: name, company or phone. Applies to the list and the map. */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchBox}
          value={searchInput}
          onChangeText={setSearchInput}
          placeholder={t('customers.searchByCustomerName')}
          placeholderTextColor="#9ca3af"
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          clearButtonMode="never"
          testID="customers-search"
        />
        {loading ? (
          <ActivityIndicator size="small" color="#5469D4" style={styles.searchAccessory} />
        ) : searchInput ? (
          <TouchableOpacity
            onPress={() => setSearchInput('')}
            hitSlop={10}
            style={styles.searchAccessory}
            testID="customers-search-clear"
          >
            <ThemedText style={styles.searchClear}>✕</ThemedText>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Content */}
      <View style={styles.contentContainer}>
        {viewMode === 'list' ? (
          <View style={{ flex: 1 }}>
            <ScrollView
              ref={listScrollRef}
              style={styles.scrollView}
              contentContainerStyle={[
                styles.listContainer,
                isDesktop && styles.desktopList,
                (isMobileWeb || isNative) && styles.mobileList,
                isMobileWeb && { paddingBottom: 100 }, // Extra padding for mobile web to clear bottom nav
                isNative && { paddingBottom: 100 } // Extra padding for native to clear bottom nav
              ]}
              showsVerticalScrollIndicator={false}
              refreshControl={
                isNative ? (
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={handleRefresh}
                    tintColor="#5469D4"
                    colors={['#5469D4']}
                    titleColor="#5469D4"
                    title={t('customers.pullToRefresh')}
                    progressBackgroundColor="#ffffff"
                  />
                ) : undefined
              }
              bounces={true}
              alwaysBounceVertical={isNative}
            >
              {customers.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <ThemedText style={styles.emptyText}>
                    {isFiltered ? t('customers.noCustomersMatchFilters') : t('customers.noCustomersFound')}
                  </ThemedText>
                </View>
              ) : (
                <>
                  <TableHeader />
                  {customers.map((customer) => (
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
                    {t('customers.previous')}
                  </ThemedText>
                </TouchableOpacity>

                <View style={styles.pageInfo}>
                  <ThemedText style={styles.pageInfoText}>
                    {t('customers.pageOf', { page, total: totalPages })}
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
                    {t('customers.next')}
                  </ThemedText>
                </TouchableOpacity>
                </View>
            )}
          </View>
        ) : (
          <View style={[{ flex: 1 }, (isMobileWeb || isNative) && { marginBottom: 0 }]}>
            <MapViewComponent
              onCustomerPress={handleCustomerPress}
              filters={mapFilters}
              reloadKey={mapReloadKey}
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
          onRequestClose={closeFilters}
        >
          <KeyboardAvoidingView
            style={styles.modalContainer}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            {/* tapping the dimmed area closes the sheet, as on every other sheet */}
            <Pressable style={styles.modalBackdrop} onPress={closeFilters} testID="customers-filter-backdrop" />
            <View style={[
              styles.filterModal,
              (isMobileWeb || isNative) && styles.mobileFilterModal
            ]}>
              <View style={styles.filterHeader}>
                <ThemedText style={styles.filterTitle}>{t('customers.filterCustomers')}</ThemedText>
                <TouchableOpacity
                  onPress={closeFilters}
                  style={styles.closeButtonContainer}
                  hitSlop={10}
                >
                  <ThemedText style={styles.closeButton}>✕</ThemedText>
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.filterContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
              >
                {/* UUID Filter */}
                <View style={styles.filterGroup}>
                  <ThemedText style={styles.filterLabel}>{t('customers.uuid')}</ThemedText>
                  <TextInput
                    style={styles.filterInput}
                    value={filters.uuid}
                    onChangeText={(value) => handleFilterChange('uuid', value)}
                    placeholder={t('customers.enterUuid')}
                    placeholderTextColor="#9ca3af"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>

                {/* Category Filter */}
                <View style={styles.filterGroup}>
                  <ThemedText style={styles.filterLabel}>{t('customers.category')}</ThemedText>
                  <View style={styles.chipRow}>
                    {['', ...categories].map((category) => {
                      const selected = filters.category === category;
                      return (
                        <TouchableOpacity
                          key={category || 'all'}
                          style={[styles.chip, selected && styles.chipSelected]}
                          onPress={() => handleFilterChange('category', category)}
                          activeOpacity={0.7}
                          testID={`customers-filter-category-${category || 'all'}`}
                        >
                          <ThemedText style={[styles.chipText, selected && styles.chipTextSelected]}>
                            {category ? tef(category) : t('customers.allCategories')}
                          </ThemedText>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Email Filter */}
                <View style={styles.filterGroup}>
                  <ThemedText style={styles.filterLabel}>{t('customers.emailAddress')}</ThemedText>
                  <TextInput
                    style={styles.filterInput}
                    value={filters.email_address}
                    onChangeText={(value) => handleFilterChange('email_address', value)}
                    placeholder={t('customers.enterEmailAddress')}
                    placeholderTextColor="#9ca3af"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>

                {/* Company Name Filter */}
                <View style={styles.filterGroup}>
                  <ThemedText style={styles.filterLabel}>{t('customers.companyName')}</ThemedText>
                  <TextInput
                    style={styles.filterInput}
                    value={filters.company_name}
                    onChangeText={(value) => handleFilterChange('company_name', value)}
                    placeholder={t('customers.enterCompanyName')}
                    placeholderTextColor="#9ca3af"
                    autoCorrect={false}
                  />
                </View>

                {/* Full Name Filter */}
                <View style={styles.filterGroup}>
                  <ThemedText style={styles.filterLabel}>{t('customers.fullName')}</ThemedText>
                  <TextInput
                    style={styles.filterInput}
                    value={filters.full_name}
                    onChangeText={(value) => handleFilterChange('full_name', value)}
                    placeholder={t('customers.enterCustomerName')}
                    placeholderTextColor="#9ca3af"
                    autoCorrect={false}
                  />
                </View>

                {/* Phone Number Filter */}
                <View style={styles.filterGroup}>
                  <ThemedText style={styles.filterLabel}>{t('customers.phoneNumber')}</ThemedText>
                  <TextInput
                    style={styles.filterInput}
                    value={filters.phone_number}
                    onChangeText={(value) => handleFilterChange('phone_number', value)}
                    placeholder={t('customers.enterPhoneNumber')}
                    placeholderTextColor="#9ca3af"
                    keyboardType="phone-pad"
                    autoCorrect={false}
                  />
                </View>
              </ScrollView>

              <View style={[styles.filterActions, { paddingBottom: Math.max(insets.bottom, 12) }]}>
                <TouchableOpacity
                  style={styles.clearButton}
                  onPress={clearFilters}
                  activeOpacity={0.7}
                >
                  <ThemedText style={styles.clearButtonText}>{t('customers.clearAll')}</ThemedText>
                </TouchableOpacity>
                {/* flex on the touchable, not just the gradient inside it, or the
                    two buttons come out lopsided */}
                <TouchableOpacity
                  style={styles.applyTouchable}
                  onPress={applyFilters}
                  activeOpacity={0.7}
                >
                  <LinearGradient colors={['#5469D4', '#4F46E5']} style={styles.applyButton}>
                    <ThemedText style={styles.applyButtonText}>{t('customers.applyFilters')}</ThemedText>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}

      {/* The reason the footer never showed: this was imported and mentioned in a
          comment above, but never rendered. The scroll area already reserves 100pt
          for it, and the bar is absolutely positioned, so nothing else moves. */}
      <BottomNavigation activeTab="menu" onTabPress={() => router.replace('/(tabs)?tab=menu')} />
      </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    // no height: '100vh' — a web unit, invalid as a native DimensionValue, and it
    // defeated StyleSheet.create's type inference for this entire file. flex: 1
    // already fills the screen.
    flex: 1,
    backgroundColor: '#f8fafc',
    position: 'relative',
    width: '100%',
    overflow: 'hidden',
  },
  backChevron: { fontSize: 30, lineHeight: 34, color: '#5469D4', fontWeight: '700', marginRight: 4 },
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
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: 8,
    alignItems: 'center',
    minWidth: 50,
    maxWidth: '100%',
    backgroundColor: '#5469D4',
  },
  categoryText: {
    fontSize: 9,
    // ThemedText's default lineHeight is 24, which made an 8pt pill ~28pt tall
    lineHeight: 12,
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
  filterActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 16,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    gap: 12,
    backgroundColor: '#fff',
  },
  applyTouchable: {
    flex: 1,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
  },
  chipSelected: {
    backgroundColor: '#5469D4',
    borderColor: '#5469D4',
  },
  chipText: {
    fontSize: 14,
    lineHeight: 18,
    color: '#374151',
  },
  chipTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    backgroundColor: '#fff',
  },
  searchBox: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 15,
    color: '#1f2937',
  },
  searchAccessory: {
    marginLeft: 8,
  },
  searchClear: {
    fontSize: 15,
    lineHeight: 18,
    color: '#9ca3af',
  },
  clearButton: {
    flex: 1,
    paddingVertical: 12,
    // no horizontal padding: Yoga adds it on top of the flex share, which made
    // Clear All wider than Apply (the label is centred anyway)
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