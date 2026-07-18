import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { MaterialFormData } from "@/lib/types";
import { useLanguage } from "@/contexts/LanguageContext";

export function AddMaterialDialog() {
  const { t, te } = useLanguage();
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState<MaterialFormData>({
    name: "",
    sku: "",
    type: "",
    description: null,
    measure_unit: null,
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch material categories and units
  const { data: materialTypes } = useQuery<string[]>({
    queryKey: ["/material/material-type"],
    queryFn: async () => {
      return await apiRequest("/material/material-type");
    },
  });

  const { data: unitOfMeasures } = useQuery<string[]>({
    queryKey: ["/material/unit-of-measure"],
    queryFn: async () => {
      return await apiRequest("/material/unit-of-measure");
    },
  });

  const createMaterialMutation = useMutation({
    mutationFn: async (data: MaterialFormData) => {
      return await apiRequest("/material/", { method: "POST", body: data });
    },
    onSuccess: () => {
      // Invalidate and refetch all material-related queries
      queryClient.invalidateQueries({ queryKey: ["/material/"] });
      queryClient.invalidateQueries({ queryKey: ["/material/list"] });
      queryClient.refetchQueries({ queryKey: ["/material/"] });
      queryClient.refetchQueries({ queryKey: ["/material/list"] });
    },
  });

  const handleInputChange = (field: keyof MaterialFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      toast({
        title: t('common.error'),
        description: t('materials.nameRequired'),
        variant: "destructive",
      });
      return;
    }

    if (!formData.sku.trim()) {
      toast({
        title: t('common.error'),
        description: t('materials.skuRequired'),
        variant: "destructive",
      });
      return;
    }

    if (!formData.type.trim()) {
      toast({
        title: t('common.error'),
        description: t('materials.typeRequired'),
        variant: "destructive",
      });
      return;
    }

    createMaterialMutation.mutate(formData, {
      onSuccess: () => {
        setOpen(false);
        setFormData({
          name: "",
          sku: "",
          type: "",
          description: null,
          measure_unit: null,
        });
        toast({
          title: t('common.success'),
          description: t('materials.createSuccess'),
        });
      },
      onError: (error: any) => {
        toast({
          title: t('common.error'),
          description: error.message || t('materials.createFailed'),
          variant: "destructive",
        });
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 me-2" />
          {t('materials.addMaterial')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('materials.addNewMaterial')}</DialogTitle>
          <DialogDescription>
            {t('materials.addDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t('materials.materialName')}*</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => handleInputChange("name", e.target.value)}
              placeholder={t('materials.enterName')}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sku">{t('materials.sku')}*</Label>
            <Input
              id="sku"
              value={formData.sku}
              onChange={(e) => handleInputChange("sku", e.target.value)}
              placeholder={t('materials.enterSkuCode')}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">{t('materials.materialType')}*</Label>
            <Select
              value={formData.type || ""}
              onValueChange={(value: string) => handleInputChange("type", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('materials.selectType')} />
              </SelectTrigger>
              <SelectContent>
                {materialTypes?.map(type => (
                  <SelectItem key={type} value={type}>
                    {te(type)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="measure_unit">{t('materials.unitOfMeasure')}</Label>
            <Select
              value={formData.measure_unit || "none"}
              onValueChange={(value: string) => handleInputChange("measure_unit", value === "none" ? null : value)}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('materials.selectUnitShort')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('materials.noUnit')}</SelectItem>
                {unitOfMeasures?.map(unit => (
                  <SelectItem key={unit} value={unit}>
                    {te(unit)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{t('common.description')}</Label>
            <Textarea
              id="description"
              value={formData.description || ""}
              onChange={(e) => handleInputChange("description", e.target.value || null)}
              placeholder={t('materials.enterDescription')}
              rows={2}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={createMaterialMutation.isPending}
          >
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createMaterialMutation.isPending}
          >
            {createMaterialMutation.isPending ? t('common.creating') : t('materials.createMaterial')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}