import React, { useState, useEffect, useMemo } from 'react';
import { StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, View, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { apiCall } from '@/utils/api';
import { LinearGradient } from 'expo-linear-gradient';

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

interface FilterState {
  uuid: string;
  currency: string;
  account_name: string;
  notes: string;
}

type ViewMode = 'list';

interface DesktopFinancialAccountsLayoutProps {
  onAccountPress: (account: FinancialAccount) => void;
  onCreateAccount: () => void;
}

export const DesktopFinancialAccountsLayout: React.FC<DesktopFinancialAccountsLayoutProps> = ({
  onAccountPress,
  onCreateAccount,
}) => {
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [showFilters, setShowFilters] = useState(false);
  const [showCurrencyDropdown, setShowCurrencyDropdown] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [currencies, setCurrencies] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState<'all' | string>('all');

  const [filters, setFilters] = useState<FilterState>({
    uuid: '',
    currency: '',
    account_name: '',
    notes: '',
  });

  const [appliedFilters, setAppliedFilters] = useState<FilterState>({
    uuid: '',
    currency: '',
    account_name: '',
    notes: '',
  });

  useEffect(() => {
    fetchCurrencies();
    fetchAccounts();
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [page, appliedFilters, searchTerm, currencyFilter]);

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

      // Add filters to query params
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

  const applyFilters = () => {
    setAppliedFilters({ ...filters });
    setPage(1);
    setShowFilters(false);
  };

  const clearFilters = () => {
    const emptyFilters = { uuid: '', currency: '', account_name: '', notes: '' };
    setFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
    setCurrencyFilter('all');
    setSearchTerm('');
    setPage(1);
    setShowFilters(false);
  };

  const hasActiveFilters = useMemo(() => {
    return Object.values(appliedFilters).some(value => value.trim() !== '') || 
           currencyFilter !== 'all' || 
           searchTerm.trim() !== '';
  }, [appliedFilters, currencyFilter, searchTerm]);

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

  const AccountCard = ({ account }: { account: FinancialAccount }) => (
    <TouchableOpacity
      style={styles.accountCard}
      onPress={() => onAccountPress(account)}
      activeOpacity={0.7}
    >
      <View style={styles.accountHeader}>
        <ThemedText style={styles.accountName}>{account.account_name}</ThemedText>
        <View style={styles.currencyBadge}>
          <ThemedText style={styles.currencyText}>{account.currency.toUpperCase()}</ThemedText>
        </View>
      </View>
      <ThemedText style={styles.accountDetail}>
        Balance: <ThemedText style={[styles.balanceAmount, { color: getBalanceColor(account.balance) }]}>
          {account.balance.toFixed(2)} {account.currency.toUpperCase()}
        </ThemedText>
      </ThemedText>
      <ThemedText style={styles.accountDetail}>
        Notes: {account.notes || 'No notes provided'}
      </ThemedText>
      <ThemedText style={styles.accountDetail}>
        UUID: {account.uuid}
      </ThemedText>
      <View style={styles.createdContainer}>
        <ThemedText style={styles.createdText}>
          Created: {formatDate(account.created_at)}
        </ThemedText>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#5469D4" />
          <ThemedText style={styles.loadingText}>Loading accounts...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <ThemedText style={styles.title}>Financial Accounts</ThemedText>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[styles.filterToggle, hasActiveFilters && styles.filterToggleActive]}
            onPress={() => setShowFilters(true)}
          >
            <ThemedText style={[styles.filterToggleText, hasActiveFilters && styles.filterToggleTextActive]}>
              🔍 Filters {hasActiveFilters && `(${Object.values(appliedFilters).filter(v => v.trim()).length + (currencyFilter !== 'all' ? 1 : 0) + (searchTerm.trim() ? 1 : 0)})`}
            </ThemedText>
          </TouchableOpacity>

          <TouchableOpacity onPress={onCreateAccount}>
            <LinearGradient colors={['#5469D4', '#4F46E5']} style={styles.createButton}>
              <ThemedText style={styles.createButtonText}>+ New Account</ThemedText>
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
            {accounts.length === 0 ? (
              <View style={styles.emptyContainer}>
                <ThemedText style={styles.emptyText}>
                  {hasActiveFilters 
                    ? 'No accounts match your filters'
                    : 'No accounts found'
                  }
                </ThemedText>
                {!hasActiveFilters && (
                  <TouchableOpacity onPress={onCreateAccount} style={styles.emptyStateButton}>
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
              accounts.map((account) => (
                <AccountCard key={account.uuid} account={account} />
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
            setShowCurrencyDropdown(false);
          }}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalBackdrop} />
            <View style={styles.filterModal}>
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
                    onChangeText={(value) => setFilters(prev => ({ ...prev, uuid: value }))}
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
                          setFilters(prev => ({ ...prev, currency: '' }));
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
                            setFilters(prev => ({ ...prev, currency }));
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
                    onChangeText={(value) => setFilters(prev => ({ ...prev, account_name: value }))}
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
                    onChangeText={(value) => setFilters(prev => ({ ...prev, notes: value }))}
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
    </ThemedView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
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
  accountCard: {
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
  accountHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  accountName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    flex: 1,
  },
  currencyBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: '#e0e7ff',
  },
  currencyText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3730a3',
  },
  accountDetail: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 4,
  },
  balanceAmount: {
    fontWeight: '700',
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
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