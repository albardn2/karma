import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { FinancialAccountCreate, Currency } from "@/lib/types";

export function AddFinancialAccountDialog() {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState<FinancialAccountCreate>({
    account_name: "",
    currency: "",
    notes: "",
    is_external: false,
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch currencies
  const { data: currencies } = useQuery<string[]>({
    queryKey: ["/payment/currencies"],
    queryFn: async () => {
      return await apiRequest("/payment/currencies");
    },
  });

  // Set default currency when currencies are loaded
  if (currencies && currencies.length > 0 && !formData.currency) {
    setFormData(prev => ({ ...prev, currency: currencies[0] }));
  }

  const createAccountMutation = useMutation({
    mutationFn: async (data: FinancialAccountCreate) => {
      const response = await apiRequest("/financial-account/", { method: "POST", body: data });
      return response;
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
        description: "Financial account created successfully",
      });
      setOpen(false);
      setFormData({
        account_name: "",
        currency: "USD",
        notes: "",
        is_external: false,
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create account",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.account_name.trim()) {
      toast({
        title: "Validation Error",
        description: "Account name is required",
        variant: "destructive",
      });
      return;
    }

    createAccountMutation.mutate(formData);
  };

  const handleInputChange = (field: keyof FinancialAccountCreate, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 me-2" />
          Add Account
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add Financial Account</DialogTitle>
          <DialogDescription>
            Create a new financial account to track balances and transactions.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="account_name">Account Name *</Label>
            <Input
              id="account_name"
              value={formData.account_name}
              onChange={(e) => handleInputChange("account_name", e.target.value)}
              placeholder="e.g. Main Business Account"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="currency">Currency *</Label>
            <Select
              value={formData.currency}
              onValueChange={(value: Currency) => handleInputChange("currency", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select currency" />
              </SelectTrigger>
              <SelectContent>
                {currencies?.map((currency: string) => (
                  <SelectItem key={currency} value={currency}>
                    {currency}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => handleInputChange("notes", e.target.value)}
              placeholder="Optional notes about this account..."
              rows={3}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label className="text-base">External Account</Label>
              <p className="text-sm text-muted-foreground">
                Mark this as an external account (e.g., bank, client account)
              </p>
            </div>
            <Switch
              checked={formData.is_external || false}
              onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_external: checked }))}
            />
          </div>

          <div className="flex justify-end space-x-2 rtl:space-x-reverse pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={createAccountMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createAccountMutation.isPending}
            >
              {createAccountMutation.isPending ? "Creating..." : "Create Account"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}