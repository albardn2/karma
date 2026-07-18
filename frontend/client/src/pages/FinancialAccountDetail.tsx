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

const accountUpdateSchema = z.object({
  account_name: z.string().min(1, "Account name is required").optional(),
  currency: z.string().min(1, "Currency is required").optional(),
  notes: z.string().optional(),
  is_external: z.boolean().optional(),
});

type AccountUpdateFormValues = z.infer<typeof accountUpdateSchema>;

export default function FinancialAccountDetail() {
  const [, params] = useRoute("/financial-accounts/:uuid");
  const uuid = params?.uuid;
  const [isEditing, setIsEditing] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

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
        title: "Success",
        description: "Financial account updated successfully",
      });
      setIsEditing(false);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update account",
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
        title: "Success",
        description: "Financial account deleted successfully",
      });
      // Navigate back to the list page
      history.back();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete account",
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
        title: "Copied!",
        description: `${label} copied to clipboard`,
      });
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to copy to clipboard",
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
                Back
              </Button>
            </div>
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
              <p className="text-gray-600 mt-4">Loading account details...</p>
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
                Back
              </Button>
            </div>
            <div className="text-center py-12">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Account not found</h3>
              <p className="text-gray-600">The financial account you're looking for doesn't exist or has been deleted.</p>
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
                Back
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{account.account_name}</h1>
                <p className="text-gray-600">Financial Account Details</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!isEditing ? (
                <>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm">
                        <Trash2 className="h-4 w-4 me-2" />
                        Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Financial Account</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete "{account.account_name}"? This action cannot be undone and will permanently remove the account and all associated data.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteAccountMutation.mutate()}
                          disabled={deleteAccountMutation.isPending}
                          className="bg-red-600 hover:bg-red-700"
                        >
                          {deleteAccountMutation.isPending ? "Deleting..." : "Delete Account"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  <Button onClick={() => setIsEditing(true)}>
                    <Edit className="h-4 w-4 me-2" />
                    Edit
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
                    Cancel
                  </Button>
                  <Button
                    onClick={form.handleSubmit(onSubmit)}
                    disabled={updateAccountMutation.isPending}
                  >
                    <Save className="h-4 w-4 me-2" />
                    {updateAccountMutation.isPending ? "Saving..." : "Save"}
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
                  Account Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {!isEditing ? (
                  <>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium text-gray-600">Account Name</Label>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(account.account_name, "Account name")}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                      <p className="text-sm text-gray-900">{account.account_name}</p>
                    </div>
                    <Separator />
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium text-gray-600">Currency</Label>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(account.currency, "Currency")}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                      <Badge variant="secondary">{account.currency}</Badge>
                    </div>
                    <Separator />
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium text-gray-600">External Account</Label>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(account.is_external ? "Yes" : "No", "External account status")}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                      <Badge variant={account.is_external ? "default" : "secondary"}>
                        {account.is_external ? "External" : "Internal"}
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
                            <FormLabel>Account Name</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Enter account name" />
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
                            <FormLabel>Currency</FormLabel>
                            <Select
                              onValueChange={(value: Currency) => field.onChange(value)}
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select currency" />
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
                                External Account
                              </FormLabel>
                              <div className="text-sm text-muted-foreground">
                                Mark this as an external account (e.g., bank, client account)
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
                  System Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium text-gray-600">Account ID</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(account.uuid, "Account ID")}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                  <p className="text-sm text-gray-900 font-mono">{account.uuid}</p>
                </div>
                <Separator />
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium text-gray-600">Created</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(formatDate(account.created_at), "Created date")}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                  <p className="text-sm text-gray-900">{formatDate(account.created_at)}</p>
                </div>
                <Separator />
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium text-gray-600">Balance</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(account.balance.toString(), "Balance")}
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
                Notes
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!isEditing ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium text-gray-600">Account Notes</Label>
                    {account.notes && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(account.notes || "", "Notes")}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <p className="text-sm text-gray-900">
                    {account.notes || "No notes available"}
                  </p>
                </div>
              ) : (
                <Form {...form}>
                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notes</FormLabel>
                        <FormControl>
                          <Textarea 
                            {...field} 
                            placeholder="Add any notes about this financial account..."
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