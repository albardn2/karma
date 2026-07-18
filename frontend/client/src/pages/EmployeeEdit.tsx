import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Save } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { AppLayout } from "@/components/layout/AppLayout";
import { useLanguage } from "@/contexts/LanguageContext";
import type { Employee, EmployeeRole } from "@/lib/types";

const EMPLOYEE_ROLES = [
  { value: "admin", labelKey: "employees.roleAdmin" },
  { value: "manager", labelKey: "employees.roleManager" },
  { value: "employee", labelKey: "employees.roleOperator" },
  { value: "accountant", labelKey: "employees.roleAccountant" },
  { value: "driver", labelKey: "employees.roleDriver" },
  { value: "sales", labelKey: "employees.roleSales" }
];

interface EmployeeFormData {
  full_name: string;
  phone_number: string;
  email_address?: string | null;
  full_address?: string | null;
  identification?: string | null;
  notes?: string | null;
  role?: EmployeeRole;
  image?: string | null;
}

export default function EmployeeEdit() {
  const [, params] = useRoute("/employees/:id/edit");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const id = params?.id;

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

  // Fetch employee data
  const { data: employee, isLoading } = useQuery<Employee>({
    queryKey: [`/employee/${id}`],
    queryFn: async () => {
      return await apiRequest(`/employee/${id}`);
    },
    enabled: !!id,
  });

  // Update form data when employee data is loaded
  useEffect(() => {
    if (employee) {
      setFormData({
        full_name: employee.full_name || "",
        phone_number: employee.phone_number || "",
        email_address: employee.email_address || null,
        full_address: employee.full_address || null,
        identification: employee.identification || null,
        notes: employee.notes || null,
        role: employee.role,
        image: employee.image || null,
      });
    }
  }, [employee]);

  const updateEmployeeMutation = useMutation({
    mutationFn: async (data: EmployeeFormData) => {
      return await apiRequest(`/employee/${id}`, { method: "PUT", body: data });
    },
    onSuccess: () => {
      // Invalidate all employee queries to refresh cached data
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const queryKey = query.queryKey[0] as string;
          return queryKey.includes("/employee");
        }
      });
      
      toast({
        title: t('common.success'),
        description: t('employees.updateSuccess'),
      });

      // Navigate back to employee detail page
      setLocation(`/employees/${id}`);
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('employees.updateFailed'),
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Convert empty strings to null for optional fields
    const cleanedData = {
      ...formData,
      email_address: formData.email_address?.trim() || null,
      full_address: formData.full_address?.trim() || null,
      identification: formData.identification?.trim() || null,
      notes: formData.notes?.trim() || null,
      image: formData.image?.trim() || null,
    };
    
    updateEmployeeMutation.mutate(cleanedData);
  };

  const handleInputChange = (field: keyof EmployeeFormData, value: string | EmployeeRole | undefined) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-4 lg:p-6">
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <Link href={`/employees/${id}`}>
                <Button variant="outline" size="sm">
                  <ArrowLeft className="h-4 w-4 me-2" />
                  {t('common.back')}
                </Button>
              </Link>
            </div>
            <div className="animate-pulse space-y-6">
              <div className="h-8 bg-gray-200 rounded w-1/3"></div>
              <div className="h-96 bg-gray-200 rounded"></div>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!employee) {
    return (
      <AppLayout>
        <div className="p-4 lg:p-6">
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <Link href="/employees">
                <Button variant="outline" size="sm">
                  <ArrowLeft className="h-4 w-4 me-2" />
                  {t('employees.backToList')}
                </Button>
              </Link>
            </div>
            <Card>
              <CardContent className="p-6">
                <p className="text-center text-muted-foreground">{t('employees.notFound')}</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-4 lg:p-6">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center gap-4">
            <Link href={`/employees/${id}`}>
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 me-2" />
                {t('common.back')}
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">{t('employees.editTitle')}</h1>
              <p className="text-muted-foreground">{t('employees.editSubtitle')}</p>
            </div>
          </div>

          {/* Edit Form */}
          <Card>
            <CardHeader>
              <CardTitle>{t('employees.employeeInfo')}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid gap-6 md:grid-cols-2">
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
                </div>

                <div className="grid gap-6 md:grid-cols-2">
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

                <div className="grid gap-6 md:grid-cols-2">
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
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">{t('common.notes')}</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes || ""}
                    onChange={(e) => handleInputChange("notes", e.target.value)}
                    placeholder={t('employees.notesPlaceholder')}
                    rows={4}
                  />
                </div>

                <div className="flex gap-2 pt-4">
                  <Button
                    type="submit"
                    disabled={updateEmployeeMutation.isPending}
                  >
                    <Save className="h-4 w-4 me-2" />
                    {updateEmployeeMutation.isPending ? t('common.saving') : t('employees.saveChanges')}
                  </Button>
                  <Link href={`/employees/${id}`}>
                    <Button variant="outline" type="button">
                      {t('common.cancel')}
                    </Button>
                  </Link>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}