import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";
import type { Customer, CustomerFormData } from "@/lib/types";

interface EditCustomerDialogProps {
  customer: Customer;
  categories: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditCustomerDialog({
  customer,
  categories,
  open,
  onOpenChange,
}: EditCustomerDialogProps) {
  const { t, te } = useLanguage();
  const [formData, setFormData] = useState<CustomerFormData>({
    company_name: customer.company_name,
    full_name: customer.full_name,
    phone_number: customer.phone_number,
    email_address: customer.email_address || "",
    full_address: customer.full_address,
    category: customer.category,
    notes: customer.notes || "",
    coordinates: customer.coordinates || "",
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Reset form when customer changes
  useEffect(() => {
    setFormData({
      company_name: customer.company_name,
      full_name: customer.full_name,
      phone_number: customer.phone_number,
      email_address: customer.email_address || null,
      full_address: customer.full_address,
      category: customer.category,
      notes: customer.notes || null,
      coordinates: customer.coordinates || null,
    });
  }, [customer]);

  const updateCustomerMutation = useMutation({
    mutationFn: async (data: CustomerFormData) => {
      const response = await apiRequest(`/customer/${customer.uuid}`, { method: "PUT", body: data });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/customer"] });
      queryClient.invalidateQueries({ queryKey: ["/customer", customer.uuid] });
      onOpenChange(false);
      toast({
        title: t('common.success'),
        description: t('customers.updateSuccess'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('customers.updateFailed'),
        variant: "destructive",
      });
    },
  });

  const handleInputChange = (field: keyof CustomerFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Basic validation
    if (!formData.company_name.trim() || !formData.full_name.trim() || !formData.phone_number.trim()) {
      toast({
        title: t('customers.validationError'),
        description: t('customers.requiredFieldsError'),
        variant: "destructive",
      });
      return;
    }

    // Convert empty strings to null for optional fields
    const cleanedData = {
      ...formData,
      email_address: formData.email_address?.trim() || null,
      notes: formData.notes?.trim() || null,
      coordinates: formData.coordinates?.trim() || null,
    };

    updateCustomerMutation.mutate(cleanedData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('customers.editCustomer')}</DialogTitle>
          <DialogDescription>
            {t('customers.editDialogDesc')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="company_name">{t('common.companyName')} *</Label>
              <Input
                id="company_name"
                value={formData.company_name}
                onChange={(e) => handleInputChange("company_name", e.target.value)}
                placeholder={t('customers.enterCompanyName')}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="full_name">{t('customers.contactPerson')} *</Label>
              <Input
                id="full_name"
                value={formData.full_name}
                onChange={(e) => handleInputChange("full_name", e.target.value)}
                placeholder={t('customers.enterContactPerson')}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone_number">{t('customers.phoneNumber')} *</Label>
              <Input
                id="phone_number"
                type="tel"
                value={formData.phone_number}
                onChange={(e) => handleInputChange("phone_number", e.target.value)}
                placeholder={t('customers.enterPhoneNumber')}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email_address">{t('customers.emailAddress')}</Label>
              <Input
                id="email_address"
                type="email"
                value={formData.email_address || ""}
                onChange={(e) => handleInputChange("email_address", e.target.value)}
                placeholder={t('customers.enterEmailAddress')}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="full_address">{t('common.address')}</Label>
            <Input
              id="full_address"
              value={formData.full_address}
              onChange={(e) => handleInputChange("full_address", e.target.value)}
              placeholder={t('customers.enterFullAddress')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">{t('common.category')}</Label>
            <Select value={formData.category} onValueChange={(value) => handleInputChange("category", value)}>
              <SelectTrigger>
                <SelectValue placeholder={t('customers.selectCustomerCategory')} />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category} value={category} className="capitalize">
                    {te(category)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="coordinates">{t('customers.coordinates')}</Label>
            <Input
              id="coordinates"
              value={formData.coordinates || ""}
              onChange={(e) => handleInputChange("coordinates", e.target.value)}
              placeholder={t('customers.coordinatesPlaceholder')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">{t('common.notes')}</Label>
            <Textarea
              id="notes"
              value={formData.notes || ""}
              onChange={(e) => handleInputChange("notes", e.target.value)}
              placeholder={t('customers.editNotesPlaceholder')}
              rows={3}
            />
          </div>

          <div className="flex justify-end space-x-2 rtl:space-x-reverse pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={updateCustomerMutation.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={updateCustomerMutation.isPending}
              className="brand-gradient hover:opacity-90"
            >
              {updateCustomerMutation.isPending ? t('common.updating') : t('customers.updateCustomer')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}