import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { 
  ArrowLeft, 
  Edit, 
  Save, 
  X, 
  Wallet, 
  DollarSign, 
  Calendar, 
  Key, 
  Copy,
  FileText,
  Trash2
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { apiRequest } from "@/lib/queryClient";
import type { FinancialAccount, FinancialAccountUpdate, Currency } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

type AccountUpdateFormValues = {
  account_name?: string;
  currency?: string;
  notes?: string;
  is_external?: boolean;
};

export default function FinancialAccountDetail() {
  const { t } = useLanguage();
  const [, params] = useRoute("/financial-accounts/:uuid");
  const uuid = params?.uuid;
  const [isEditing, setIsEditing] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const accountUpdateSchema = z.object({
    account_name: z.string().min(1, t('financial.accountNameRequired')).optional(),
    currency: z.string().min(1, t('financial.currencyRequired')).optional(),
    notes: z.string().optional(),
    is_external: z.boolean().optional(),
  });

  // Fetch account details
  const { data: account, isLoading } = useQuery<FinancialAccount>({
    queryKey: ["/financial-account", uuid],
    queryFn: async () => {
      if (!uuid) throw new Error("Account UUID is required");
      return await apiRequest(`/financial-account/${uuid}`);
    },
    enabled: !!uuid,
  });

  // Fetch currencies
  const { data: currencies } = useQuery<string[]>({
    queryKey: ["/payment/currencies"],
    queryFn: async () => {
      return await apiRequest("/payment/currencies");
    },
  });

  const form = useForm<AccountUpdateFormValues>({
    resolver: zodResolver(accountUpdateSchema),
    defaultValues: {
      account_name: "",
      currency: "USD",
      notes: "",
      is_external: false,
    },
  });

  // Update form when account data loads
  useEffect(() => {
    if (account) {
      form.reset({
        account_name: account.account_name || "",
        currency: account.currency || "USD",
        notes: account.notes || "",
        is_external: account.is_external || false,
      });
    }
  }, [account, form]);

  const updateAccountMutation = useMutation({
    mutationFn: async (data: FinancialAccountUpdate) => {
      if (!uuid) throw new Error("Account UUID is required");
      return await apiRequest(`/financial-account/${uuid}`, { method: "PUT", body: data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/financial-account", uuid] });
      queryClient.invalidateQueries({ queryKey: ["/financial-account"] });
      toast({
        title: t('common.success'),
        description: t('financial.accountUpdated'),
      });
      setIsEditing(false);
    },
    onError: (error) => {
      toast({
        title: t('common.error'),
        description: error.message || t('financial.failedUpdateAccount'),
        variant: "destructive",
      });
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      if (!uuid) throw new Error("Account UUID is required");
      return await apiRequest(`/financial-account/${uuid}`, { method: "DELETE" });
    },
    onSuccess: () => {
      // Invalidate all financial account queries to refresh the list
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const queryKey = query.queryKey[0] as string;
          return queryKey.includes("/financial-account");
        }
      });
      
      // Also refetch any active queries immediately
      queryClient.refetchQueries({
        predicate: (query) => {
          const queryKey = query.queryKey[0] as string;
          return queryKey.includes("/financial-account");
        }
      });
      
      toast({
        title: t('common.success'),
        description: t('financial.accountDeleted'),
      });
      // Navigate back to the list page
      history.back();
    },
    onError: (error) => {
      toast({
        title: t('common.error'),
        description: error.message || t('financial.failedDeleteAccount'),
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: AccountUpdateFormValues) => {
    // Convert empty strings to null for optional fields
    const updateData: FinancialAccountUpdate = {};
    if (data.account_name) updateData.account_name = data.account_name;
    if (data.currency) updateData.currency = data.currency as Currency;
    updateData.notes = data.notes?.trim() || null;
    updateData.is_external = data.is_external;
    
    updateAccountMutation.mutate(updateData);
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: t('financial.copiedTitle'),
        description: t('financial.copiedToClipboard', { label }),
      });
    } catch (err) {
      toast({
        title: t('common.error'),
        description: t('financial.failedCopy'),
        variant: "destructive",
      });
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    if (account) {
      form.reset({
        account_name: account.account_name || "",
        currency: account.currency || "USD",
        notes: account.notes || "",
        is_external: account.is_external || false,
      });
    }
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex-1 overflow-auto p-4 lg:p-6">
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={() => history.back()}>
                <ArrowLeft className="h-4 w-4 me-2" />
                {t('common.back')}
              </Button>
            </div>
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
              <p className="text-gray-600 mt-4">{t('financial.loadingAccountDetails')}</p>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!account) {
    return (
      <AppLayout>
        <div className="flex-1 overflow-auto p-4 lg:p-6">
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={() => history.back()}>
                <ArrowLeft className="h-4 w-4 me-2" />
                {t('common.back')}
              </Button>
            </div>
            <div className="text-center py-12">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{t('financial.accountNotFound')}</h3>
              <p className="text-gray-600">{t('financial.accountNotFoundDesc')}</p>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex-1 overflow-auto p-4 lg:p-6">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={() => history.back()}>
                <ArrowLeft className="h-4 w-4 me-2" />
                {t('common.back')}
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{account.account_name}</h1>
                <p className="text-gray-600">{t('financial.accountDetails')}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!isEditing ? (
                <>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm">
                        <Trash2 className="h-4 w-4 me-2" />
                        {t('common.delete')}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t('financial.deleteAccountTitle')}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {t('financial.deleteAccountConfirm', { name: account.account_name })}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteAccountMutation.mutate()}
                          disabled={deleteAccountMutation.isPending}
                          className="bg-red-600 hover:bg-red-700"
                        >
                          {deleteAccountMutation.isPending ? t('common.deleting') : t('financial.deleteAccount')}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  <Button onClick={() => setIsEditing(true)}>
                    <Edit className="h-4 w-4 me-2" />
                    {t('common.edit')}
                  </Button>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={handleCancel}
                    disabled={updateAccountMutation.isPending}
                  >
                    <X className="h-4 w-4 me-2" />
                    {t('common.cancel')}
                  </Button>
                  <Button
                    onClick={form.handleSubmit(onSubmit)}
                    disabled={updateAccountMutation.isPending}
                  >
                    <Save className="h-4 w-4 me-2" />
                    {updateAccountMutation.isPending ? t('common.saving') : t('common.save')}
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Account Details */}
          <div className="grid gap-6 md:grid-cols-2">
            {/* Basic Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="h-5 w-5" />
                  {t('financial.accountInformation')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {!isEditing ? (
                  <>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium text-gray-600">{t('financial.accountName')}</Label>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(account.account_name, t('financial.accountName'))}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                      <p className="text-sm text-gray-900">{account.account_name}</p>
                    </div>
                    <Separator />
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium text-gray-600">{t('common.currency')}</Label>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(account.currency, t('common.currency'))}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                      <Badge variant="secondary">{account.currency}</Badge>
                    </div>
                    <Separator />
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium text-gray-600">{t('financial.externalAccount')}</Label>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(account.is_external ? t('common.yes') : t('common.no'), t('financial.externalAccountStatus'))}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                      <Badge variant={account.is_external ? "default" : "secondary"}>
                        {account.is_external ? t('financial.external') : t('financial.internal')}
                      </Badge>
                    </div>
                  </>
                ) : (
                  <Form {...form}>
                    <form className="space-y-4">
                      <FormField
                        control={form.control}
                        name="account_name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('financial.accountName')}</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder={t('financial.enterAccountName')} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="currency"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('common.currency')}</FormLabel>
                            <Select
                              onValueChange={(value: Currency) => field.onChange(value)}
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder={t('financial.selectCurrency')} />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {currencies?.map((currency: string) => (
                                  <SelectItem key={currency} value={currency}>
                                    {currency}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="is_external"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                            <div className="space-y-0.5">
                              <FormLabel className="text-base">
                                {t('financial.externalAccount')}
                              </FormLabel>
                              <div className="text-sm text-muted-foreground">
                                {t('financial.externalAccountDesc')}
                              </div>
                            </div>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </form>
                  </Form>
                )}
              </CardContent>
            </Card>

            {/* System Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  {t('financial.systemInformation')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium text-gray-600">{t('financial.accountId')}</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(account.uuid, t('financial.accountId'))}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                  <p className="text-sm text-gray-900 font-mono">{account.uuid}</p>
                </div>
                <Separator />
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium text-gray-600">{t('financial.created')}</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(formatDate(account.created_at), t('financial.createdDate'))}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                  <p className="text-sm text-gray-900">{formatDate(account.created_at)}</p>
                </div>
                <Separator />
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium text-gray-600">{t('financial.balance')}</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(account.balance.toString(), t('financial.balance'))}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                  <p className="text-sm text-gray-900">{account.currency} {account.balance.toFixed(2)}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Notes Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                {t('common.notes')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!isEditing ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium text-gray-600">{t('financial.accountNotes')}</Label>
                    {account.notes && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(account.notes || "", t('common.notes'))}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <p className="text-sm text-gray-900">
                    {account.notes || t('financial.noNotesAvailable')}
                  </p>
                </div>
              ) : (
                <Form {...form}>
                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('common.notes')}</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            placeholder={t('financial.accountNotesPlaceholder')}
                            rows={4}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </Form>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}