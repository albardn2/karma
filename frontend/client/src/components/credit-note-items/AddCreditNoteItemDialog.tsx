import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface CreditNoteItemFormData {
  amount: string;
  currency: string;
  notes: string;
  invoice_item_uuid: string;
  customer_uuid: string;
  vendor_uuid: string;
  purchase_order_item_uuid: string;
  inventory_change: string;
  create_payout: boolean;
}

interface Currency {
  code: string;
  name: string;
}

interface AddCreditNoteItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddCreditNoteItemDialog({ open, onOpenChange }: AddCreditNoteItemDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState<CreditNoteItemFormData>({
    amount: "",
    currency: "",
    notes: "",
    invoice_item_uuid: "",
    customer_uuid: "",
    vendor_uuid: "",
    purchase_order_item_uuid: "",
    inventory_change: "",
    create_payout: false
  });

  const [referenceType, setReferenceType] = useState<'invoice_item' | 'customer' | 'vendor' | 'purchase_order_item'>('invoice_item');

  // Fetch currencies
  const { data: currencies } = useQuery({
    queryKey: ["/payment/currencies"],
    enabled: open
  });

  const createCreditNoteItemMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("/credit-note-item/", { method: "POST", body: data });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/credit-note-item/"] });
      onOpenChange(false);
      resetForm();
      toast({
        title: "Success",
        description: "Credit note item has been created successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create credit note item.",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      amount: "",
      currency: "",
      notes: "",
      invoice_item_uuid: "",
      customer_uuid: "",
      vendor_uuid: "",
      purchase_order_item_uuid: "",
      inventory_change: "",
      create_payout: false
    });
    setReferenceType('invoice_item');
  };

  const handleInputChange = (field: keyof CreditNoteItemFormData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.amount || !formData.currency) {
      toast({
        title: "Validation Error",
        description: "Amount and currency are required.",
        variant: "destructive",
      });
      return;
    }

    // Ensure only one reference type is set
    const cleanedData: any = {
      amount: parseFloat(formData.amount),
      currency: formData.currency,
      notes: formData.notes?.trim() || null,
      inventory_change: formData.inventory_change ? parseFloat(formData.inventory_change) : null,
      create_payout: formData.create_payout
    };

    // Set the appropriate reference based on selected type
    switch (referenceType) {
      case 'invoice_item':
        if (formData.invoice_item_uuid?.trim()) {
          cleanedData.invoice_item_uuid = formData.invoice_item_uuid.trim();
        }
        break;
      case 'customer':
        if (formData.customer_uuid?.trim()) {
          cleanedData.customer_uuid = formData.customer_uuid.trim();
        }
        break;
      case 'vendor':
        if (formData.vendor_uuid?.trim()) {
          cleanedData.vendor_uuid = formData.vendor_uuid.trim();
        }
        break;
      case 'purchase_order_item':
        if (formData.purchase_order_item_uuid?.trim()) {
          cleanedData.purchase_order_item_uuid = formData.purchase_order_item_uuid.trim();
        }
        break;
    }

    createCreditNoteItemMutation.mutate(cleanedData);
  };

  const getCurrentReferenceValue = () => {
    switch (referenceType) {
      case 'invoice_item':
        return formData.invoice_item_uuid;
      case 'customer':
        return formData.customer_uuid;
      case 'vendor':
        return formData.vendor_uuid;
      case 'purchase_order_item':
        return formData.purchase_order_item_uuid;
      default:
        return "";
    }
  };

  const setCurrentReferenceValue = (value: string) => {
    switch (referenceType) {
      case 'invoice_item':
        handleInputChange('invoice_item_uuid', value);
        break;
      case 'customer':
        handleInputChange('customer_uuid', value);
        break;
      case 'vendor':
        handleInputChange('vendor_uuid', value);
        break;
      case 'purchase_order_item':
        handleInputChange('purchase_order_item_uuid', value);
        break;
    }
  };

  const getReferenceLabel = () => {
    switch (referenceType) {
      case 'invoice_item':
        return 'Invoice Item UUID';
      case 'customer':
        return 'Customer UUID';
      case 'vendor':
        return 'Vendor UUID';
      case 'purchase_order_item':
        return 'Purchase Order Item UUID';
      default:
        return 'Reference UUID';
    }
  };

  const canHaveInventoryChange = referenceType === 'invoice_item' || referenceType === 'purchase_order_item';

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto z-[9999]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-purple-600" />
            Create Credit Note Item
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount *</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={formData.amount}
                onChange={(e) => handleInputChange("amount", e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="currency">Currency *</Label>
              <Select value={formData.currency} onValueChange={(value) => handleInputChange("currency", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select currency..." />
                </SelectTrigger>
                <SelectContent>
                  {(currencies as Currency[])?.map((currency: Currency) => (
                    <SelectItem key={currency.code} value={currency.code}>
                      {currency.code} - {currency.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3">
            <Label>Reference Type *</Label>
            <div className="flex flex-wrap gap-2">
              {[
                { key: 'invoice_item', label: 'Invoice Item' },
                { key: 'customer', label: 'Customer' },
                { key: 'vendor', label: 'Vendor' },
                { key: 'purchase_order_item', label: 'Purchase Order Item' }
              ].map((type) => (
                <Button
                  key={type.key}
                  type="button"
                  variant={referenceType === type.key ? "default" : "outline"}
                  size="sm"
                  onClick={() => setReferenceType(type.key as any)}
                  className={referenceType === type.key ? "bg-purple-600 hover:bg-purple-700" : ""}
                >
                  {type.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reference_uuid">{getReferenceLabel()} *</Label>
            <Input
              id="reference_uuid"
              placeholder={`Enter ${getReferenceLabel().toLowerCase()}...`}
              value={getCurrentReferenceValue()}
              onChange={(e) => setCurrentReferenceValue(e.target.value)}
              required
            />
          </div>

          {canHaveInventoryChange && (
            <div className="space-y-2">
              <Label htmlFor="inventory_change">Inventory Change</Label>
              <Input
                id="inventory_change"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={formData.inventory_change}
                onChange={(e) => handleInputChange("inventory_change", e.target.value)}
              />
              <p className="text-sm text-muted-foreground">
                Optional: Specify inventory quantity change (positive for increase, negative for decrease)
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => handleInputChange("notes", e.target.value)}
              placeholder="Add any additional notes about this credit note item..."
              rows={3}
            />
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="create_payout"
              checked={formData.create_payout}
              onCheckedChange={(checked) => handleInputChange("create_payout", checked)}
            />
            <Label htmlFor="create_payout">Create automatic payout</Label>
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={createCreditNoteItemMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createCreditNoteItemMutation.isPending}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {createCreditNoteItemMutation.isPending ? "Creating..." : "Create Credit Note Item"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}