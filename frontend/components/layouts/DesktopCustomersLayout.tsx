import React, { useState, useEffect, useMemo } from 'react';
import { StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, View, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { apiCall } from '@/utils/api';
import { LinearGradient } from 'expo-linear-gradient';
import { MapViewComponent } from '@/components/MapView';

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

interface FilterState {
  uuid: string;
  category: string;
  email_address: string;
  company_name: string;
  full_name: string;
  phone_number: string;
}

type ViewMode = 'list' | 'map';

interface DesktopCustomersLayoutProps {
  onCustomerPress: (customer: Customer) => void;
  onCreateCustomer: () => void;
}

export const DesktopCustomersLayout: React.FC<DesktopCustomersLayoutProps> = ({
  onCustomerPress,
  onCreateCustomer,
}) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [showFilters, setShowFilters] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [categories, setCategories] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'roastery' | 'restaurant' | 'minimarket' | 'supermarket' | 'distributer'>('all');

  const [filters, setFilters] = useState<FilterState>({
    uuid: '',
    category: '',
    email_address: '',
    company_name: '',
    full_name: '',
    phone_number: '',
  });

  const [appliedFilters, setAppliedFilters] = useState<FilterState>({
    uuid: '',
    category: '',
    email_address: '',
    company_name: '',
    full_name: '',
    phone_number: '',
  });

  useEffect(() => {
    fetchCategories();
    fetchCustomers();
  }, []);

  useEffect(() => {
    fetchCustomers();
  }, [page, appliedFilters, searchTerm, categoryFilter]);

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

  const fetchCustomers = async () => {
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

      // Add searchTerm and categoryFilter for map view
      if (searchTerm.trim()) {
        params.append('full_name', searchTerm.trim());
      }

      if (categoryFilter && categoryFilter !== 'all') {
        params.append('category', categoryFilter);
      }

      const response = await apiCall<CustomerPage>(`/customer/?${params.toString()}`);

      if (response.status === 200 && response.data) {
        setCustomers(response.data.customers);
        setTotalPages(response.data.pages);
      } else {
        if (response.status === 0) {
          Alert.alert('Network Error', 'Unable to connect to the backend server.');
        } else {
          Alert.alert('Error', `Failed to load customers: ${response.error || 'Unknown error'}`);
        }
        setCustomers([]);
        setTotalPages(0);
      }
    } catch (error) {
      console.error('Error fetching customers:', error);
      Alert.alert('Error', 'Failed to load customers');
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

  const hasActiveFilters = useMemo(() => {
    return Object.values(appliedFilters).some(value => value.trim() !== '');
  }, [appliedFilters]);

  const CustomerCard = ({ customer }: { customer: Customer }) => {
    const totalBalance = Object.values(customer.balance_per_currency).reduce((sum, amount) => sum + amount, 0);

    const getBalanceColor = (balance: number) => {
      if (balance > 0) return '#10b981';
      if (balance < 0) return '#ef4444';
      return '#6b7280';
    };

    return (
      <TouchableOpacity
        style={styles.customerCard}
        onPress={() => onCustomerPress(customer)}
      >
        <View style={styles.customerHeader}>
          <ThemedText style={styles.customerName}>{customer.full_name}</ThemedText>
          <View style={styles.categoryBadge}>
            <ThemedText style={styles.categoryText}>
              {customer.category.toUpperCase()}
            </ThemedText>
          </View>
        </View>
        <ThemedText style={styles.customerDetail}>
          Company: {customer.company_name}
        </ThemedText>
        <ThemedText style={styles.customerDetail}>
          Email: {customer.email_address || 'No email provided'}
        </ThemedText>
        <ThemedText style={styles.customerDetail}>
          Phone: {customer.phone_number}
        </ThemedText>
        <ThemedText style={styles.customerDetail}>
          UUID: {customer.uuid}
        </ThemedText>
        <View style={styles.balanceContainer}>
          <ThemedText style={[styles.balanceText, { color: getBalanceColor(totalBalance) }]}>
            Balance: ${totalBalance.toFixed(2)}
          </ThemedText>
        </View>
      </TouchableOpacity>
    );
  };

  

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

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <ThemedText style={styles.title}>Customers</ThemedText>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[styles.filterToggle, hasActiveFilters && styles.filterToggleActive]}
            onPress={() => setShowFilters(true)}
          >
            <ThemedText style={[styles.filterToggleText, hasActiveFilters && styles.filterToggleTextActive]}>
              🔍 Filters {hasActiveFilters && `(${Object.values(appliedFilters).filter(v => v.trim()).length})`}
            </ThemedText>
          </TouchableOpacity>

          <TouchableOpacity onPress={onCreateCustomer}>
            <LinearGradient colors={['#5469D4', '#4F46E5']} style={styles.createButton}>
              <ThemedText style={styles.createButtonText}>+ Add Customer</ThemedText>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>

      {/* View Toggle */}
      <View style={styles.viewToggleContainer}>
        <TouchableOpacity
          style={[styles.viewToggleTab, viewMode === 'list' && styles.activeViewToggleTab]}
          onPress={() => setViewMode('list')}
        >
          <ThemedText style={[styles.viewToggleText, viewMode === 'list' && styles.activeViewToggleText]}>
            📋 List View
          </ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.viewToggleTab, viewMode === 'map' && styles.activeViewToggleTab]}
          onPress={() => setViewMode('map')}
        >
          <ThemedText style={[styles.viewToggleText, viewMode === 'map' && styles.activeViewToggleText]}>
            🗺️ Map View
          </ThemedText>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <View style={styles.contentContainer}>
        {viewMode === 'list' ? (
          <View style={{ flex: 1 }}>
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.listContainer}
              showsVerticalScrollIndicator={false}
            >
              {customers.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <ThemedText style={styles.emptyText}>
                    {hasActiveFilters ? 'No customers match your filters' : 'No customers found'}
                  </ThemedText>
                </View>
              ) : (
                customers.map((customer) => (
                  <CustomerCard key={customer.uuid} customer={customer} />
                ))
              )}
            </ScrollView>

            {/* Pagination - Only for list view */}
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
        ) : (
          <MapViewComponent 
            onCustomerPress={onCustomerPress} 
            searchTerm={searchTerm}
            categoryFilter={categoryFilter}
          />
        )}
      </View>

      {/* Filter Modal */}
      {showFilters && (
        <Modal
          visible={showFilters}
          transparent={true}
          animationType="fade"
          onRequestClose={() => {
            setShowFilters(false);
            setShowCategoryDropdown(false);
          }}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalBackdrop} />
            <View style={styles.filterModal}>
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
};

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
  viewToggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    marginHorizontal: 32,
    marginTop: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
  },
  viewToggleTab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#fff',
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
  customerCard: {
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
  customerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  customerName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    flex: 1,
  },
  categoryBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: '#5469D4',
  },
  categoryText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#fff',
  },
  customerDetail: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 4,
  },
  balanceContainer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  balanceText: {
    fontSize: 14,
    fontWeight: '600',
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