import React, { useState, useEffect } from 'react';
import { StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, Platform, Dimensions, Animated, Modal } from 'react-native';
import { View } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { apiCall } from '@/utils/api';
import { LinearGradient } from 'expo-linear-gradient';
import { BottomNavigation } from '@/components/layout/BottomNavigation';
import { DesktopFinancialAccountsLayout } from '@/components/layouts/DesktopFinancialAccountsLayout';
import { Colors } from '@/constants/Colors';
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

interface FinancialAccountPage {
  accounts: FinancialAccount[];
  total_count: number;
  page: number;
  per_page: number;
  pages: number;
}

type ViewMode = 'list';

export default function FinancialAccountsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { deleted, message } = useLocalSearchParams<{ deleted?: string; message?: string }>();
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState<'all' | string>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [screenData, setScreenData] = useState(Dimensions.get('window'));
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [banner, setBanner] = useState<{type: 'success' | 'error', message: string} | null>(null);
  const bannerAnimation = useState(new Animated.Value(0))[0];
  const [showFilters, setShowFilters] = useState(false);
  const [showCurrencyDropdown, setShowCurrencyDropdown] = useState(false);
  const [currencies, setCurrencies] = useState<string[]>([]);

  const [filters, setFilters] = useState<{
    uuid: string;
    currency: string;
    account_name: string;
    notes: string;
  }>({
    uuid: '',
    currency: '',
    account_name: '',
    notes: '',
  });

  const [appliedFilters, setAppliedFilters] = useState<{
    uuid: string;
    currency: string;
    account_name: string;
    notes: string;
  }>({
    uuid: '',
    currency: '',
    account_name: '',
    notes: '',
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
    fetchCurrencies();
    fetchAccounts();
  }, []);

  useEffect(() => {
    if (deleted === 'true' && message) {
      showBanner('success', message);
    }
  }, [deleted, message]);

  const showBanner = (type: 'success' | 'error', message: string) => {
    setBanner({ type, message });
    Animated.sequence([
      Animated.timing(bannerAnimation, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(3000),
      Animated.timing(bannerAnimation, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setBanner(null));
  };

  const fetchCurrencies = async () => {
    try {
      const response = await apiCall<string[]>('/payment/currencies');
      if (response.status === 200 && response.data) {
        setCurrencies(response.data);
      } else {
        console.error('Error fetching currencies:', response.error);
      }
    } catch (error) {
      console.error('Error fetching currencies:', error);
    }
  };

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const queryParams = new URLSearchParams({
        page: page.toString(),
        per_page: '20',
      });

      // Apply filters to API call
      Object.entries(appliedFilters).forEach(([key, value]) => {
        if (value.trim()) {
          queryParams.append(key, value.trim());
        }
      });

      if (searchTerm) queryParams.append('search', searchTerm);
      if (currencyFilter !== 'all') queryParams.append('currency', currencyFilter);

      const response = await apiCall<FinancialAccountPage>(`/financial-account/?${queryParams}`);

      if (response.status === 200 && response.data) {
        setAccounts(response.data.accounts);
        setTotalPages(response.data.pages);
      } else {
        Alert.alert('Error', 'Failed to load financial accounts');
      }
    } catch (error) {
      console.error('Error fetching accounts:', error);
      Alert.alert('Error', 'Failed to load financial accounts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, [page, appliedFilters, searchTerm, currencyFilter]);

  useEffect(() => {
    fetchAccounts();
  }, [page]);

  const handleFilterChange = (field: keyof typeof filters, value: string) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const applyFilters = () => {
    setAppliedFilters({ ...filters });
    setPage(1);
    setShowFilters(false);
    setShowCurrencyDropdown(false);
  };

  const clearFilters = () => {
    const emptyFilters = {
      uuid: '',
      currency: '',
      account_name: '',
      notes: '',
    };
    setFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
    setPage(1);
    setShowFilters(false);
    setShowCurrencyDropdown(false);
  };

  const hasActiveFilters = Object.values(appliedFilters).some(value => value.trim() !== '');

  const handleAccountPress = (account: FinancialAccount) => {
    if (isNative) {
      router.push(`/financial-accounts/${account.uuid}`);
    } else {
      router.push(`/financial-accounts/${account.uuid}`);
    }
  };

  const handleCreateAccount = () => {
    if (isNative) {
      router.push('/financial-accounts/create');
    } else {
      router.push('/financial-accounts/create');
    }
  };

  const formatCurrency = (amount: number, currency: string) => {
    return `${currency.toUpperCase()} ${amount.toFixed(2)}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getBalanceColor = (balance: number) => {
    if (balance > 0) return '#10b981';
    if (balance < 0) return '#ef4444';
    return '#6b7280';
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
        placeholder="Search by account name..."
        value={searchTerm}
        onChangeText={setSearchTerm}
        placeholderTextColor="#666"
      />

      <View style={styles.currencyFilterContainer}>
        {(['all', ...currencies] as const).map((currency) => (
          <TouchableOpacity
            key={currency}
            style={[
              styles.filterButton,
              currencyFilter === currency && styles.activeFilterButton
            ]}
            onPress={() => setCurrencyFilter(currency)}
          >
            <ThemedText style={[
              styles.filterButtonText,
              currencyFilter === currency && styles.activeFilterButtonText
            ]}>
              {currency === 'all' ? 'All' : currency.toUpperCase()}
            </ThemedText>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  // Desktop Layout
  if (isDesktop) {
    return (
      <DesktopFinancialAccountsLayout
        onAccountPress={handleAccountPress}
        onCreateAccount={handleCreateAccount}
      />
    );
  }

  // Mobile and Mobile Web Layout
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
            position: isNative ? 'absolute' : 'fixed'
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
          Financial Accounts
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

          <TouchableOpacity onPress={handleCreateAccount}>
            <LinearGradient
              colors={['#5469D4', '#4F46E5']}
              style={[
                styles.createButton,
                isDesktop && styles.desktopCreateButton,
                (isMobileWeb || isNative) && styles.mobileCreateButton
              ]}
            >
              <ThemedText style={styles.createButtonText}>+ Add Account</ThemedText>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>

      {/* Filters - Only show for desktop */}
      {isDesktop && <FilterSection />}

      {/* Content */}
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#5469D4" />
            <ThemedText style={styles.loadingText}>Loading accounts...</ThemedText>
          </View>
        ) : accounts.length === 0 ? (
          <View style={styles.emptyState}>
            <ThemedText style={styles.emptyStateIcon}>💰</ThemedText>
            <ThemedText style={styles.emptyStateTitle}>No accounts found</ThemedText>
            <ThemedText style={styles.emptyStateSubtitle}>
              {searchTerm || currencyFilter !== 'all' 
                ? 'Try adjusting your search or filters'
                : 'Create your first financial account to get started'
              }
            </ThemedText>
            {!searchTerm && currencyFilter === 'all' && (
              <TouchableOpacity onPress={handleCreateAccount} style={styles.emptyStateButton}>
                <LinearGradient
                  colors={['#5469D4', '#4F46E5']}
                  style={styles.emptyStateButtonGradient}
                >
                  <ThemedText style={styles.emptyStateButtonText}>Create Account</ThemedText>
                </LinearGradient>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <>
            {accounts.map((account) => (
              <TouchableOpacity
                key={account.uuid}
                style={styles.accountCard}
                onPress={() => handleAccountPress(account)}
                activeOpacity={0.7}
              >
                <View style={styles.accountHeader}>
                  <View style={styles.accountInfo}>
                    <ThemedText style={styles.accountName}>{account.account_name}</ThemedText>
                    <ThemedText style={styles.accountCurrency}>{account.currency.toUpperCase()}</ThemedText>
                  </View>
                  <View style={styles.accountBalance}>
                    <ThemedText style={[
                      styles.balanceAmount,
                      { color: getBalanceColor(account.balance) }
                    ]}>
                      {formatCurrency(account.balance, account.currency)}
                    </ThemedText>
                  </View>
                  <View style={styles.arrowColumn}>
                    <ThemedText style={styles.arrow}>›</ThemedText>
                  </View>
                </View>
                {account.notes && (
                  <ThemedText style={styles.accountNotes} numberOfLines={2}>
                    {account.notes}
                  </ThemedText>
                )}
                <View style={styles.accountFooter}>
                  <ThemedText style={styles.accountDate}>
                    Created {formatDate(account.created_at)}
                  </ThemedText>
                </View>
              </TouchableOpacity>
            ))}

            {/* Pagination */}
            {totalPages > 1 && (
              <View style={styles.pagination}>
                <TouchableOpacity
                  style={[styles.pageButton, page === 1 && styles.pageButtonDisabled]}
                  onPress={() => setPage(p => Math.max(1, p - 1))}
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
                  onPress={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  <ThemedText style={[styles.pageButtonText, page === totalPages && styles.pageButtonTextDisabled]}>
                    Next
                  </ThemedText>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Filter Modal */}
      {showFilters && (
        <Modal
          visible={showFilters}
          transparent={true}
          animationType="fade"
          onRequestClose={() => {
            setShowFilters(false);
            setShowCurrencyDropdown(false);
          }}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalBackdrop} />
            <View style={[
              styles.filterModal,
              (isMobileWeb || isNative) && styles.mobileFilterModal
            ]}>
              <View style={styles.filterHeader}>
                <ThemedText style={styles.filterTitle}>Filter Financial Accounts</ThemedText>
                <TouchableOpacity 
                  onPress={() => {
                    setShowFilters(false);
                    setShowCurrencyDropdown(false);
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

                {/* Currency Filter */}
                <View style={styles.filterGroup}>
                  <ThemedText style={styles.filterLabel}>Currency</ThemedText>
                  <TouchableOpacity 
                    style={styles.dropdown}
                    onPress={() => setShowCurrencyDropdown(!showCurrencyDropdown)}
                    activeOpacity={0.7}
                  >
                    <ThemedText style={[styles.dropdownText, !filters.currency && styles.placeholderText]}>
                      {filters.currency ? filters.currency.toUpperCase() : 'Select currency'}
                    </ThemedText>
                    <ThemedText style={styles.dropdownArrow}>
                      {showCurrencyDropdown ? '▲' : '▼'}
                    </ThemedText>
                  </TouchableOpacity>
                  {showCurrencyDropdown && (
                    <View style={styles.dropdownOptions}>
                      <TouchableOpacity 
                        style={styles.dropdownOption}
                        onPress={() => {
                          handleFilterChange('currency', '');
                          setShowCurrencyDropdown(false);
                        }}
                        activeOpacity={0.7}
                      >
                        <ThemedText style={styles.dropdownOptionText}>All Currencies</ThemedText>
                      </TouchableOpacity>
                      {currencies.map((currency) => (
                        <TouchableOpacity
                          key={currency}
                          style={styles.dropdownOption}
                          onPress={() => {
                            handleFilterChange('currency', currency);
                            setShowCurrencyDropdown(false);
                          }}
                          activeOpacity={0.7}
                        >
                          <ThemedText style={styles.dropdownOptionText}>
                            {currency.toUpperCase()}
                          </ThemedText>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>

                {/* Account Name Filter */}
                <View style={styles.filterGroup}>
                  <ThemedText style={styles.filterLabel}>Account Name</ThemedText>
                  <TextInput
                    style={styles.filterInput}
                    value={filters.account_name}
                    onChangeText={(value) => handleFilterChange('account_name', value)}
                    placeholder="Enter account name"
                    placeholderTextColor="#9ca3af"
                    autoCorrect={false}
                  />
                </View>

                {/* Notes Filter */}
                <View style={styles.filterGroup}>
                  <ThemedText style={styles.filterLabel}>Notes</ThemedText>
                  <TextInput
                    style={styles.filterInput}
                    value={filters.notes}
                    onChangeText={(value) => handleFilterChange('notes', value)}
                    placeholder="Enter notes"
                    placeholderTextColor="#9ca3af"
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

      {/* Bottom Navigation for Native */}
      {isNative && <BottomNavigation />}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingVertical: 16,
    paddingHorizontal: 20,
    zIndex: 99999,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 20,
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
  currencyFilterContainer: {
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
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 12,
    paddingBottom: Platform.OS === 'ios' || Platform.OS === 'android' ? 100 : 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  emptyStateIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyStateSubtitle: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  emptyStateButton: {
    marginTop: 8,
  },
  emptyStateButtonGradient: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  emptyStateButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  accountCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  accountHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  accountInfo: {
    flex: 1,
  },
  accountName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  accountCurrency: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  accountBalance: {
    alignItems: 'flex-end',
  },
  balanceAmount: {
    fontSize: 18,
    fontWeight: '700',
  },
  arrowColumn: {
    width: 16,
    alignItems: 'center',
    marginLeft: 8,
  },
  arrow: {
    fontSize: 20,
    color: '#9ca3af',
    fontWeight: '300',
  },
  accountNotes: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
    marginBottom: 8,
  },
  accountFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  accountDate: {
    fontSize: 12,
    color: '#9ca3af',
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  pageButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
  },
  pageButtonDisabled: {
    opacity: 0.5,
  },
  pageButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  pageButtonTextDisabled: {
    color: '#9ca3af',
  },
  pageInfo: {
    fontSize: 14,
    color: '#6b7280',
  },
  // Filter Modal Styles
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
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
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: '90%',
    minHeight: '90%',
    width: '100%',
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
    padding: 24,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    gap: 12,
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