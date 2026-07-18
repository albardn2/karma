import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";

interface WarehouseFormData {
  name: string;
  address: string;
  coordinates?: string | null;
  notes?: string | null;
}

export function AddWarehouseDialog() {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState<WarehouseFormData>({
    name: "",
    address: "",
    coordinates: null,
    notes: null,
  });

  const { toast } = useToast();
  const { t } = useLanguage();
  const queryClient = useQueryClient();

  const createWarehouseMutation = useMutation({
    mutationFn: async (data: WarehouseFormData) => {
      return await apiRequest("/warehouse/", { method: "POST", body: data });
    },
    onSuccess: () => {
      // Invalidate all warehouse queries to refresh the list
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const queryKey = query.queryKey[0] as string;
          return queryKey.includes("/warehouse");
        }
      });
      
      // Also refetch any active queries immediately
      queryClient.refetchQueries({
        predicate: (query) => {
          const queryKey = query.queryKey[0] as string;
          return queryKey.includes("/warehouse");
        }
      });
      
      setOpen(false);
      setFormData({
        name: "",
        address: "",
        coordinates: "",
        notes: "",
      });
      toast({
        title: t('common.success'),
        description: t('warehouses.createSuccess'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('warehouses.createFailed'),
        variant: "destructive",
      });
    },
  });

  const handleInputChange = (field: keyof WarehouseFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value || undefined }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Basic validation
    if (!formData.name || !formData.address) {
      toast({
        title: t('warehouses.validationError'),
        description: t('warehouses.nameAddressRequired'),
        variant: "destructive",
      });
      return;
    }

    // Convert empty strings to null for optional fields
    const cleanedData = {
      ...formData,
      coordinates: formData.coordinates?.trim() || null,
      notes: formData.notes?.trim() || null,
    };

    createWarehouseMutation.mutate(cleanedData);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          {t('warehouses.addWarehouse')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('warehouses.addNewWarehouse')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t('warehouses.warehouseName')} *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => handleInputChange("name", e.target.value)}
              placeholder={t('warehouses.enterName')}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">{t('common.address')} *</Label>
            <Textarea
              id="address"
              value={formData.address}
              onChange={(e) => handleInputChange("address", e.target.value)}
              placeholder={t('warehouses.enterAddress')}
              required
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="coordinates">{t('warehouses.coordinatesLatLng')}</Label>
            <Input
              id="coordinates"
              value={formData.coordinates || ""}
              onChange={(e) => handleInputChange("coordinates", e.target.value)}
              placeholder={t('warehouses.coordinatesExample')}
            />
            <p className="text-xs text-muted-foreground">
              {t('warehouses.coordinatesHintMap')}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">{t('common.notes')}</Label>
            <Textarea
              id="notes"
              value={formData.notes || ""}
              onChange={(e) => handleInputChange("notes", e.target.value)}
              placeholder={t('warehouses.notesPlaceholder')}
              rows={3}
            />
          </div>

          <div className="flex justify-end space-x-2 rtl:space-x-reverse pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={createWarehouseMutation.isPending}>
              {createWarehouseMutation.isPending ? t('common.creating') : t('warehouses.createWarehouse')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}