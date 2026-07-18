import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";
import type { EmployeeFormData, EmployeeRole } from "@/lib/types";

const EMPLOYEE_ROLES = [
  { value: "admin", labelKey: "employees.roleAdmin" },
  { value: "manager", labelKey: "employees.roleManager" },
  { value: "employee", labelKey: "employees.roleOperator" },
  { value: "accountant", labelKey: "employees.roleAccountant" },
  { value: "driver", labelKey: "employees.roleDriver" },
  { value: "sales", labelKey: "employees.roleSales" }
];

export function AddEmployeeDialog() {
  const [open, setOpen] = useState(false);
  const { t } = useLanguage();
  const [formData, setFormData] = useState<EmployeeFormData>({
    full_name: "",
    phone_number: "",
    email_address: null,
    full_address: null,
    identification: null,
    notes: null,
    role: undefined,
    image: null,
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createEmployeeMutation = useMutation({
    mutationFn: async (data: EmployeeFormData) => {
      const response = await apiRequest("/employee/", { method: "POST", body: data });
      return response;
    },
    onSuccess: () => {
      // Invalidate all employee queries to refresh the list
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const queryKey = query.queryKey[0] as string;
          return queryKey.includes("/employee");
        }
      });
      
      // Also refetch any active queries immediately
      queryClient.refetchQueries({
        predicate: (query) => {
          const queryKey = query.queryKey[0] as string;
          return queryKey.includes("/employee");
        }
      });

      setOpen(false);
      setFormData({
        full_name: "",
        phone_number: "",
        email_address: null,
        full_address: null,
        identification: null,
        notes: null,
        role: undefined,
        image: null,
      });
      toast({
        title: t('common.success'),
        description: t('employees.createSuccess'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('employees.createFailed'),
        variant: "destructive",
      });
    },
  });

  const handleInputChange = (field: keyof EmployeeFormData, value: string | EmployeeRole | undefined) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Basic validation
    if (!formData.full_name || !formData.phone_number) {
      toast({
        title: t('employees.validationError'),
        description: t('employees.validationRequired'),
        variant: "destructive",
      });
      return;
    }

    // Convert empty strings to null for optional fields
    const cleanedData: EmployeeFormData = {
      ...formData,
      email_address: formData.email_address?.trim() || null,
      full_address: formData.full_address?.trim() || null,
      identification: formData.identification?.trim() || null,
      notes: formData.notes?.trim() || null,
      image: formData.image?.trim() || null,
    };

    createEmployeeMutation.mutate(cleanedData);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          {t('employees.addEmployee')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('employees.addTitle')}</DialogTitle>
          <DialogDescription>
            {t('employees.addDescription')}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="full_name">{t('common.fullName')} *</Label>
            <Input
              id="full_name"
              value={formData.full_name}
              onChange={(e) => handleInputChange("full_name", e.target.value)}
              placeholder={t('employees.fullNamePlaceholder')}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone_number">{t('employees.phoneNumber')} *</Label>
            <Input
              id="phone_number"
              value={formData.phone_number}
              onChange={(e) => handleInputChange("phone_number", e.target.value)}
              placeholder={t('employees.phonePlaceholder')}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email_address">{t('employees.emailAddress')}</Label>
            <Input
              id="email_address"
              type="email"
              value={formData.email_address || ""}
              onChange={(e) => handleInputChange("email_address", e.target.value)}
              placeholder={t('employees.emailPlaceholder')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">{t('employees.role')}</Label>
            <Select
              value={formData.role || "none"}
              onValueChange={(value: string) => handleInputChange("role", value === "none" ? undefined : value as EmployeeRole)}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('employees.selectRole')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('employees.noRoleOption')}</SelectItem>
                {EMPLOYEE_ROLES.map(role => (
                  <SelectItem key={role.value} value={role.value}>
                    {t(role.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="full_address">{t('employees.fullAddress')}</Label>
            <Textarea
              id="full_address"
              value={formData.full_address || ""}
              onChange={(e) => handleInputChange("full_address", e.target.value)}
              placeholder={t('employees.addressPlaceholder')}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="identification">{t('employees.identification')}</Label>
            <Input
              id="identification"
              value={formData.identification || ""}
              onChange={(e) => handleInputChange("identification", e.target.value)}
              placeholder={t('employees.identificationPlaceholder')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="image">{t('employees.image')}</Label>
            <Input
              id="image"
              value={formData.image || ""}
              onChange={(e) => handleInputChange("image", e.target.value)}
              placeholder={t('employees.imagePlaceholder')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">{t('common.notes')}</Label>
            <Textarea
              id="notes"
              value={formData.notes || ""}
              onChange={(e) => handleInputChange("notes", e.target.value)}
              placeholder={t('employees.notesPlaceholderAdd')}
              rows={2}
            />
          </div>

          <div className="flex gap-2 pt-4">
            <Button
              type="submit"
              disabled={createEmployeeMutation.isPending}
              className="flex-1"
            >
              {createEmployeeMutation.isPending ? t('common.creating') : t('employees.createEmployee')}
            </Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}