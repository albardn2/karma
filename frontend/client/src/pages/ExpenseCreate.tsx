import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArrowLeft, Save, Receipt } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface ExpenseCreateData {
  amount: number;
  currency: string;
  category: string;
  vendor_uuid?: string;
  description?: string;
  should_pay?: boolean;
}

export default function ExpenseCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t, te } = useLanguage();
  const [formData, setFormData] = useState<ExpenseCreateData>({
    amount: 0,
    currency: '',
    category: '',
    should_pay: false,
  });

  // Get the referrer from URL params or localStorage, default to expenses list
  const urlParams = new URLSearchParams(window.location.search);
  const referrer = urlParams.get('referrer') || localStorage.getItem('expense_create_referrer') || '/expenses';
  
  // Store referrer in localStorage for form persistence
  if (urlParams.get('referrer')) {
    localStorage.setItem('expense_create_referrer', urlParams.get('referrer')!);
  }

  // Fetch currencies
  const { data: currencies = [], isLoading: currenciesLoading, error: currenciesError } = useQuery({
    queryKey: ["/payment/currencies"],
    queryFn: () => apiRequest("/payment/currencies"),
  });

  // Fetch expense categories
  const { data: categories = [], isLoading: categoriesLoading, error: categoriesError } = useQuery({
    queryKey: ["/expense/categories"],
    queryFn: () => apiRequest("/expense/categories"),
  });

  const createMutation = useMutation({
    mutationFn: (data: ExpenseCreateData) =>
      apiRequest("/expense/", {
        method: "POST",
        body: data,
      }),
    onSuccess: () => {
      // Invalidate relevant caches to refresh data
      queryClient.invalidateQueries({ queryKey: ["/expense/"] });
      
      toast({
        title: t('common.success'),
        description: t('expenses.createSuccess'),
      });
      // Clear the referrer and redirect back
      localStorage.removeItem('expense_create_referrer');
      setLocation(referrer);
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('expenses.createFailed'),
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    // Validation
    if (!formData.amount || formData.amount <= 0) {
      toast({
        title: t('expenses.validationError'),
        description: t('expenses.amountInvalid'),
        variant: "destructive",
      });
      return;
    }

    if (!formData.currency) {
      toast({
        title: t('expenses.validationError'),
        description: t('expenses.currencyRequired'),
        variant: "destructive",
      });
      return;
    }

    if (!formData.category) {
      toast({
        title: t('expenses.validationError'),
        description: t('expenses.categoryRequired'),
        variant: "destructive",
      });
      return;
    }

    // Create the payload, filtering out empty strings and converting them to undefined
    const payload = Object.fromEntries(
      Object.entries(formData).filter(([_, value]) => value !== "" && value !== undefined)
    ) as ExpenseCreateData;

    createMutation.mutate(payload);
  };

  const handleCancel = () => {
    localStorage.removeItem('expense_create_referrer');
    setLocation(referrer);
  };

  // Set default currency if available
  useEffect(() => {
    if (currencies.length > 0 && !formData.currency) {
      const defaultCurrency = currencies.find((c: string) => c === 'USD') || currencies[0];
      setFormData(prev => ({ ...prev, currency: defaultCurrency }));
    }
  }, [currencies, formData.currency]);

  return (
    <AppLayout>
      <div className="p-8 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              onClick={handleCancel}
              variant="ghost"
              size="sm"
            >
              <ArrowLeft className="h-4 w-4 me-2" />
              {t('common.back')}
            </Button>
            <div>
              <h1 className="text-3xl font-medium text-gray-900 dark:text-gray-100">
                {t('expenses.create')}
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                {t('expenses.createSubtitle')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={handleCancel} variant="outline">
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending} className="bg-[#5469D4] hover:bg-[#4356C7] text-white">
              <Save className="h-4 w-4 me-2" />
              {createMutation.isPending ? t('common.creating') : t('expenses.create')}
            </Button>
          </div>
        </div>

        {/* Form */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              {t('expenses.information')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Amount */}
              <div className="space-y-2">
                <Label htmlFor="amount">{t('expenses.amountLabel')}</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.amount || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))}
                  placeholder={t('expenses.amountPlaceholder')}
                  required
                />
              </div>

              {/* Currency */}
              <div className="space-y-2">
                <Label htmlFor="currency">{t('expenses.currencyLabel')}</Label>
                <Select value={formData.currency} onValueChange={(value) => setFormData(prev => ({ ...prev, currency: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder={currenciesLoading ? t('expenses.loadingCurrencies') : t('expenses.selectCurrency')} />
                  </SelectTrigger>
                  <SelectContent>
                    {currenciesLoading ? (
                      <SelectItem value="loading" disabled>{t('expenses.loadingCurrencies')}</SelectItem>
                    ) : currenciesError ? (
                      <SelectItem value="error" disabled>{t('expenses.errorLoadingCurrencies')}</SelectItem>
                    ) : currencies && currencies.length > 0 ? (
                      currencies.map((currency: string) => (
                        <SelectItem key={currency} value={currency}>
                          {currency}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="empty" disabled>{t('expenses.noCurrencies')}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {currenciesError && (
                  <p className="text-xs text-red-500">{t('expenses.errorLoadingCurrenciesMsg', { message: currenciesError.message })}</p>
                )}
              </div>

              {/* Category */}
              <div className="space-y-2">
                <Label htmlFor="category">{t('expenses.categoryLabel')}</Label>
                <Select value={formData.category} onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder={categoriesLoading ? t('expenses.loadingCategories') : t('expenses.selectCategory')} />
                  </SelectTrigger>
                  <SelectContent>
                    {categoriesLoading ? (
                      <SelectItem value="loading" disabled>{t('expenses.loadingCategories')}</SelectItem>
                    ) : categoriesError ? (
                      <SelectItem value="error" disabled>{t('expenses.errorLoadingCategories')}</SelectItem>
                    ) : categories && categories.length > 0 ? (
                      categories.map((category: string) => (
                        <SelectItem key={category} value={category}>
                          {te(category)}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="empty" disabled>{t('expenses.noCategories')}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {categoriesError && (
                  <p className="text-xs text-red-500">{t('expenses.errorLoadingCategoriesMsg', { message: categoriesError.message })}</p>
                )}
              </div>

              {/* Vendor UUID */}
              <div className="space-y-2">
                <Label htmlFor="vendor_uuid">{t('expenses.vendorUuid')}</Label>
                <Input
                  id="vendor_uuid"
                  value={formData.vendor_uuid || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, vendor_uuid: e.target.value }))}
                  placeholder={t('expenses.vendorUuidOptionalPlaceholder')}
                />
              </div>

              {/* Auto Pay */}
              <div className="space-y-2">
                <div className="flex items-center space-x-2 rtl:space-x-reverse">
                  <Switch
                    id="should_pay"
                    checked={formData.should_pay || false}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, should_pay: checked }))}
                  />
                  <Label htmlFor="should_pay">{t('expenses.autoPay')}</Label>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t('expenses.autoPayHelp')}
                </p>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2 mt-6">
              <Label htmlFor="description">{t('common.description')}</Label>
              <Textarea
                id="description"
                value={formData.description || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder={t('expenses.descriptionPlaceholder')}
                rows={3}
              />
            </div>

            {/* Required Fields Info */}
            <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                <strong>{t('expenses.noteLabel')}</strong> {t('expenses.requiredFieldsNote')}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}