import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { Plus } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { VendorFormData, VendorCategory } from "@/lib/types";

const VENDOR_CATEGORIES = ["raw_materials", "equipment", "services", "other"] as const;

export function AddVendorDialog() {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState<VendorFormData>({
    company_name: "",
    full_name: "",
    phone_number: "",
    email_address: null,
    full_address: null,
    business_cards: null,
    notes: null,
    category: undefined,
    coordinates: null,
  });

  const { toast } = useToast();
  const { t, te } = useLanguage();
  const queryClient = useQueryClient();

  const createVendorMutation = useMutation({
    mutationFn: async (data: VendorFormData) => {
      return await apiRequest("/vendor/", { method: "POST", body: data });
    },
    onSuccess: () => {
      // Invalidate all vendor queries to refresh the list
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const queryKey = query.queryKey[0] as string;
          return queryKey.includes("/vendor");
        }
      });
      
      // Also refetch any active queries immediately
      queryClient.refetchQueries({
        predicate: (query) => {
          const queryKey = query.queryKey[0] as string;
          return queryKey.includes("/vendor");
        }
      });
      
      setOpen(false);
      setFormData({
        company_name: "",
        full_name: "",
        phone_number: "",
        email_address: "",
        full_address: "",
        business_cards: "",
        notes: "",
        category: undefined,
        coordinates: "",
      });
      toast({
        title: t('common.success'),
        description: t('vendors.createdSuccess'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('vendors.createFailed'),
        variant: "destructive",
      });
    },
  });

  const handleInputChange = (field: keyof VendorFormData, value: string | VendorCategory | undefined) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Basic validation
    if (!formData.company_name || !formData.full_name || !formData.phone_number) {
      toast({
        title: t('vendors.validationError'),
        description: t('vendors.requiredFieldsError'),
        variant: "destructive",
      });
      return;
    }

    // Convert empty strings to null for optional fields
    const cleanedData: VendorFormData = {
      ...formData,
      email_address: formData.email_address?.trim() || null,
      full_address: formData.full_address?.trim() || null,
      business_cards: formData.business_cards?.trim() || null,
      notes: formData.notes?.trim() || null,
      coordinates: formData.coordinates?.trim() || null,
    };

    createVendorMutation.mutate(cleanedData);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          {t('vendors.addVendor')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('vendors.addNewVendor')}</DialogTitle>
          <DialogDescription>
            {t('vendors.addVendorDesc')}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="company_name">{t('common.companyName')} *</Label>
            <Input
              id="company_name"
              value={formData.company_name}
              onChange={(e) => handleInputChange("company_name", e.target.value)}
              placeholder={t('vendors.enterCompanyName')}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="full_name">{t('common.fullName')} *</Label>
            <Input
              id="full_name"
              value={formData.full_name}
              onChange={(e) => handleInputChange("full_name", e.target.value)}
              placeholder={t('vendors.enterFullName')}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone_number">{t('vendors.phoneNumber')} *</Label>
            <Input
              id="phone_number"
              value={formData.phone_number}
              onChange={(e) => handleInputChange("phone_number", e.target.value)}
              placeholder={t('vendors.enterPhoneNumber')}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email_address">{t('vendors.emailAddress')}</Label>
            <Input
              id="email_address"
              type="email"
              value={formData.email_address || ""}
              onChange={(e) => handleInputChange("email_address", e.target.value)}
              placeholder={t('vendors.enterEmailAddress')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">{t('common.category')}</Label>
            <Select
              value={formData.category || "none"}
              onValueChange={(value: string) => handleInputChange("category", value === "none" ? undefined : value as VendorCategory)}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('vendors.selectCategory')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('vendors.noCategory')}</SelectItem>
                {VENDOR_CATEGORIES.map(category => (
                  <SelectItem key={category} value={category}>
                    {te(category)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="full_address">{t('vendors.fullAddress')}</Label>
            <Textarea
              id="full_address"
              value={formData.full_address || ""}
              onChange={(e) => handleInputChange("full_address", e.target.value)}
              placeholder={t('vendors.enterFullAddress')}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="business_cards">{t('vendors.businessCards')}</Label>
            <Textarea
              id="business_cards"
              value={formData.business_cards || ""}
              onChange={(e) => handleInputChange("business_cards", e.target.value)}
              placeholder={t('vendors.businessCardsPlaceholder')}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">{t('common.notes')}</Label>
            <Textarea
              id="notes"
              value={formData.notes || ""}
              onChange={(e) => handleInputChange("notes", e.target.value)}
              placeholder={t('vendors.notesPlaceholder')}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="coordinates">{t('vendors.coordinates')}</Label>
            <Input
              id="coordinates"
              value={formData.coordinates || ""}
              onChange={(e) => handleInputChange("coordinates", e.target.value)}
              placeholder={t('vendors.coordinatesPlaceholder')}
            />
          </div>

          <div className="flex gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              className="flex-1"
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={createVendorMutation.isPending}
              className="flex-1"
            >
              {createVendorMutation.isPending ? t('common.creating') : t('vendors.createVendor')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}