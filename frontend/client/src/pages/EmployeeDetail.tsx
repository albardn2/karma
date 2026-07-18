import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ArrowLeft, User, Mail, Phone, Calendar, MapPin, Copy, Edit, Trash2, StickyNote, Image as ImageIcon, IdCard, DollarSign } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";
import type { Employee } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { Link } from "wouter";

const EMPLOYEE_ROLE_LABEL_KEYS = {
  admin: "employees.roleAdmin",
  manager: "employees.roleManager",
  employee: "employees.roleOperator",
  accountant: "employees.roleAccountant",
  driver: "employees.roleDriver",
  sales: "employees.roleSales"
};

const EMPLOYEE_ROLE_COLORS = {
  admin: "bg-red-100 text-red-800",
  manager: "bg-blue-100 text-blue-800",
  employee: "bg-green-100 text-green-800",
  accountant: "bg-purple-100 text-purple-800",
  driver: "bg-orange-100 text-orange-800",
  sales: "bg-indigo-100 text-indigo-800"
};

export default function EmployeeDetail() {
  const { uuid } = useParams<{ uuid: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t } = useLanguage();
  const queryClient = useQueryClient();

  // Fetch employee details
  const { data: employee, isLoading, error } = useQuery<Employee>({
    queryKey: ["/employee", uuid],
    queryFn: async () => {
      return await apiRequest(`/employee/${uuid}`);
    },
    enabled: !!uuid,
  });

  // Delete employee mutation
  const deleteEmployeeMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/employee/${uuid}`, { method: "DELETE" });
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
        description: t('employees.deleteSuccess'),
      });

      // Navigate back to employees list
      setLocation("/employees");
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('employees.deleteFailed'),
        variant: "destructive",
      });
    },
  });

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: t('employees.copied'),
        description: t('employees.copiedDescription', { label }),
      });
    } catch (err) {
      toast({
        title: t('common.error'),
        description: t('employees.copyFailed'),
        variant: "destructive",
      });
    }
  };

  const handleDelete = () => {
    deleteEmployeeMutation.mutate();
  };

  if (isLoading) {
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
            <div className="animate-pulse space-y-6">
              <div className="h-8 bg-gray-200 rounded w-1/3"></div>
              <div className="grid gap-6 md:grid-cols-2">
                <div className="h-64 bg-gray-200 rounded"></div>
                <div className="h-64 bg-gray-200 rounded"></div>
              </div>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (error || !employee) {
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
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/employees">
                <Button variant="outline" size="sm">
                  <ArrowLeft className="h-4 w-4 me-2" />
                  {t('employees.backToList')}
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  <User className="h-6 w-6" />
                  {employee.full_name}
                </h1>
                <p className="text-muted-foreground">{t('employees.detailSubtitle')}</p>
              </div>
            </div>
            
            <div className="flex gap-2">
              <Button 
                onClick={() => setLocation(`/payouts/create?employee_uuid=${employee.uuid}&referrer=/employees/${employee.uuid}`)}
                className="bg-green-600 hover:bg-green-700 text-white"
                size="sm"
              >
                <DollarSign className="h-4 w-4 me-2" />
                {t('employees.createSalary')}
              </Button>

              <Link href={`/employees/${uuid}/edit`}>
                <Button variant="outline" size="sm">
                  <Edit className="h-4 w-4 me-2" />
                  {t('common.edit')}
                </Button>
              </Link>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                    <Trash2 className="h-4 w-4 me-2" />
                    {t('common.delete')}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t('employees.deleteTitle')}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t('employees.deleteDialogDescription', { name: employee.full_name })}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDelete}
                      disabled={deleteEmployeeMutation.isPending}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      {deleteEmployeeMutation.isPending ? t('common.deleting') : t('common.delete')}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>

          {/* Employee Information */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t('employees.basicInfo')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between group">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">{t('common.fullName')}</p>
                      <p className="font-medium">{employee.full_name}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => copyToClipboard(employee.full_name, t('common.fullName'))}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <Separator />
                <div className="space-y-2">
                  <div className="flex items-center justify-between group">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">{t('employees.phoneNumber')}</p>
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <span>{employee.phone_number}</span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => copyToClipboard(employee.phone_number, t('employees.phoneNumber'))}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <Separator />
                <div className="space-y-2">
                  <div className="flex items-center justify-between group">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">{t('employees.emailAddress')}</p>
                      {employee.email_address ? (
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          <span>{employee.email_address}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">{t('employees.noEmail')}</span>
                      )}
                    </div>
                    {employee.email_address && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => copyToClipboard(employee.email_address!, t('employees.emailAddress'))}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
                <Separator />
                <div className="space-y-2">
                  <div className="flex items-center justify-between group">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">{t('employees.role')}</p>
                      {employee.role ? (
                        <Badge
                          variant="secondary"
                          className={EMPLOYEE_ROLE_COLORS[employee.role]}
                        >
                          {t(EMPLOYEE_ROLE_LABEL_KEYS[employee.role])}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">{t('employees.noRole')}</span>
                      )}
                    </div>
                    {employee.role && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => copyToClipboard(t(EMPLOYEE_ROLE_LABEL_KEYS[employee.role!]), t('employees.role'))}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
                <Separator />
                <div className="space-y-2">
                  <div className="flex items-center justify-between group">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">{t('employees.uuid')}</p>
                      <span className="font-mono text-sm">{employee.uuid}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => copyToClipboard(employee.uuid, t('employees.uuid'))}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('employees.additionalInfo')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between group">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">{t('employees.fullAddress')}</p>
                      {employee.full_address ? (
                        <div className="flex items-start gap-2">
                          <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                          <span className="text-sm">{employee.full_address}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">{t('employees.noAddress')}</span>
                      )}
                    </div>
                    {employee.full_address && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => copyToClipboard(employee.full_address!, t('common.address'))}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
                <Separator />
                <div className="space-y-2">
                  <div className="flex items-center justify-between group">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">{t('employees.identification')}</p>
                      {employee.identification ? (
                        <div className="flex items-center gap-2">
                          <IdCard className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">{employee.identification}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">{t('employees.noIdentification')}</span>
                      )}
                    </div>
                    {employee.identification && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => copyToClipboard(employee.identification!, t('employees.identification'))}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
                <Separator />
                <div className="space-y-2">
                  <div className="flex items-center justify-between group">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">{t('employees.image')}</p>
                      {employee.image ? (
                        <div className="flex items-center gap-2">
                          <ImageIcon className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">{employee.image}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">{t('employees.noImage')}</span>
                      )}
                    </div>
                    {employee.image && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => copyToClipboard(employee.image!, t('employees.image'))}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
                <Separator />
                <div className="space-y-2">
                  <div className="flex items-start justify-between group">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">{t('common.notes')}</p>
                      {employee.notes ? (
                        <div className="flex items-start gap-2">
                          <StickyNote className="h-4 w-4 text-muted-foreground mt-0.5" />
                          <span className="text-sm">{employee.notes}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">{t('employees.noNotes')}</span>
                      )}
                    </div>
                    {employee.notes && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => copyToClipboard(employee.notes!, t('common.notes'))}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
                <Separator />
                <div className="space-y-2">
                  <div className="flex items-center justify-between group">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">{t('employees.created')}</p>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{formatDate(employee.created_at)}</span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => copyToClipboard(formatDate(employee.created_at), t('employees.createdDate'))}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}