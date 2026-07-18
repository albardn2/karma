import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { 
  ArrowLeft, 
  Edit, 
  Trash2, 
  Copy, 
  Check, 
  Factory, 
  Package, 
  ArrowRight, 
  Calendar, 
  User, 
  FileText,
  Warehouse,
  DollarSign
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProcessDiagram } from "@/components/processes/ProcessDiagram";
import { ProcessRead } from "@/types/process";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";

const editSchema = z.object({
  notes: z.string().optional(),
});

type EditFormData = z.infer<typeof editSchema>;

export default function ProcessDetail() {
  const { uuid } = useParams<{ uuid: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t, te } = useLanguage();
  const [isEditing, setIsEditing] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const form = useForm<EditFormData>({
    resolver: zodResolver(editSchema),
  });

  const { data: process, isLoading, error } = useQuery<ProcessRead>({
    queryKey: ["/process/", uuid],
    queryFn: () => apiRequest(`/process/${uuid}`),
  });

  // Fetch materials for display names
  const { data: materials } = useQuery({
    queryKey: ["/material/"],
    queryFn: () => apiRequest("/material/?per_page=100"),
  });

  // Fetch warehouses for display names
  const { data: warehouses } = useQuery({
    queryKey: ["/warehouse/"],
    queryFn: () => apiRequest("/warehouse/?per_page=100"),
  });

  const updateMutation = useMutation({
    mutationFn: async (data: EditFormData) => {
      return await apiRequest(`/process/${uuid}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      toast({
        title: t('processes.updatedSuccess'),
        description: t('processes.updatedSuccessDesc'),
      });
      queryClient.invalidateQueries({ queryKey: ["/process/", uuid] });
      setIsEditing(false);
    },
    onError: (error: any) => {
      toast({
        title: t('processes.updateError'),
        description: error.message || t('processes.updateErrorDesc'),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/process/${uuid}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      toast({
        title: t('processes.deletedSuccess'),
        description: t('processes.deletedSuccessDesc'),
      });
      queryClient.invalidateQueries({ queryKey: ["/process/"] });
      setLocation("/processes");
    },
    onError: (error: any) => {
      toast({
        title: t('processes.deleteError'),
        description: error.message || t('processes.deleteErrorDesc'),
        variant: "destructive",
      });
    },
  });

  const copyToClipboard = (text: string, fieldName: string, fieldLabel: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
    toast({
      title: t('processes.copied'),
      description: t('processes.copiedDesc', { field: fieldLabel }),
    });
  };

  const handleEdit = () => {
    if (process) {
      form.setValue("notes", process.notes || "");
      setIsEditing(true);
    }
  };

  const handleSave = () => {
    form.handleSubmit((data) => {
      const cleanData = {
        notes: data.notes || undefined,
      };
      updateMutation.mutate(cleanData);
    })();
  };

  const handleCancel = () => {
    form.reset();
    setIsEditing(false);
  };

  const getMaterialName = (materialUuid: string) => {
    const material = materials?.materials?.find((m: any) => m.uuid === materialUuid);
    return material?.name || t('processes.unknownMaterial');
  };

  const getWarehouseName = (warehouseUuid: string) => {
    const warehouse = warehouses?.warehouses?.find((w: any) => w.uuid === warehouseUuid);
    return warehouse?.name || t('processes.unknownWarehouse');
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="container mx-auto px-4 py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
            <div className="space-y-4">
              <div className="h-32 bg-gray-200 rounded"></div>
              <div className="h-64 bg-gray-200 rounded"></div>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (error || !process) {
    return (
      <AppLayout>
        <div className="container mx-auto px-4 py-8">
          <div className="text-center py-8">
            <p className="text-red-600">{t('processes.errorLoadingOne', { message: error?.message || t('processes.notFound') })}</p>
            <Button onClick={() => setLocation("/processes")} className="mt-4">
              {t('processes.backToProcesses')}
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              onClick={() => setLocation("/processes")}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              {t('processes.backToProcesses')}
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                <Factory className="h-8 w-8" />
                {t('processes.detailsTitle')}
              </h1>
              <p className="text-gray-600 mt-1">
                {te(process.type)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <Button
                  onClick={handleSave}
                  disabled={updateMutation.isPending}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {t('processes.saveChanges')}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleCancel}
                  disabled={updateMutation.isPending}
                >
                  {t('common.cancel')}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={handleEdit}
                  className="flex items-center gap-2"
                >
                  <Edit className="h-4 w-4" />
                  {t('common.edit')}
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="flex items-center gap-2">
                      <Trash2 className="h-4 w-4" />
                      {t('common.delete')}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t('processes.deleteTitle')}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t('processes.deleteConfirm')}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteMutation.mutate()}
                        disabled={deleteMutation.isPending}
                        className="bg-red-600 hover:bg-red-700"
                      >
                        {t('common.delete')}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {/* Process Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                {t('processes.processInfo')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-medium text-gray-600">{t('processes.uuid')}</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(process.uuid, "UUID", t('processes.uuid'))}
                      className="h-6 w-6 p-0"
                    >
                      {copiedField === "UUID" ? (
                        <Check className="h-3 w-3 text-green-600" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                  <div className="font-mono text-sm bg-gray-50 p-2 rounded">
                    {process.uuid}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-600">{t('processes.processType')}</Label>
                  <Badge className="bg-purple-100 text-purple-800">
                    {te(process.type)}
                  </Badge>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-gray-500" />
                    <Label className="text-sm font-medium text-gray-600">{t('processes.created')}</Label>
                  </div>
                  <div className="text-sm text-gray-900">
                    {formatDate(process.created_at)}
                  </div>
                </div>

                {process.created_by_uuid && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-gray-500" />
                      <Label className="text-sm font-medium text-gray-600">{t('processes.createdBy')}</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(process.created_by_uuid!, "Created By UUID", t('processes.createdBy'))}
                        className="h-6 w-6 p-0"
                      >
                        {copiedField === "Created By UUID" ? (
                          <Check className="h-3 w-3 text-green-600" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                    <div className="font-mono text-sm bg-gray-50 p-2 rounded">
                      {process.created_by_uuid}
                    </div>
                  </div>
                )}

                {process.data.output_warehouse_uuid && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Warehouse className="h-4 w-4 text-gray-500" />
                      <Label className="text-sm font-medium text-gray-600">{t('processes.outputWarehouse')}</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(process.data.output_warehouse_uuid!, "Output Warehouse UUID", t('processes.outputWarehouse'))}
                        className="h-6 w-6 p-0"
                      >
                        {copiedField === "Output Warehouse UUID" ? (
                          <Check className="h-3 w-3 text-green-600" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                    <div className="text-sm text-gray-900">
                      {getWarehouseName(process.data.output_warehouse_uuid)}
                    </div>
                  </div>
                )}

                {process.workflow_execution_uuid && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label className="text-sm font-medium text-gray-600">{t('nav.workflowExecution')}</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(process.workflow_execution_uuid!, "Workflow Execution UUID", t('nav.workflowExecution'))}
                        className="h-6 w-6 p-0"
                      >
                        {copiedField === "Workflow Execution UUID" ? (
                          <Check className="h-3 w-3 text-green-600" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                    <div className="font-mono text-sm bg-gray-50 p-2 rounded">
                      {process.workflow_execution_uuid}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6 space-y-2">
                <Label className="text-sm font-medium text-gray-600">{t('common.notes')}</Label>
                {isEditing ? (
                  <Textarea
                    {...form.register("notes")}
                    placeholder={t('processes.notesEditPlaceholder')}
                    className="min-h-[100px]"
                  />
                ) : (
                  <div className="text-sm text-gray-900 bg-gray-50 p-3 rounded min-h-[100px]">
                    {process.notes || t('processes.noNotesProvided')}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Input Materials */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                {t('processes.inputMaterials')}
              </CardTitle>
              <CardDescription>
                {t('processes.inputMaterialsDetailDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('processes.material')}</TableHead>
                    <TableHead>{t('common.quantity')}</TableHead>
                    <TableHead>{t('processes.costPerUnit')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {process.data.inputs.map((input, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <div className="font-medium">
                          {getMaterialName(input.material_uuid)}
                        </div>
                        <div className="text-xs text-gray-500 font-mono">
                          {input.material_uuid}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">
                          {input.quantity.toLocaleString()}
                        </div>
                      </TableCell>
                      <TableCell>
                        {input.cost_per_unit ? (
                          <div className="flex items-center gap-1">
                            <span className="font-medium">{input.cost_per_unit.toLocaleString()} {te('SYP')}</span>
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Output Products */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowRight className="h-5 w-5" />
                {t('processes.outputProducts')}
              </CardTitle>
              <CardDescription>
                {t('processes.outputProductsDetailDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('processes.material')}</TableHead>
                    <TableHead>{t('common.quantity')}</TableHead>
                    <TableHead>{t('processes.costPerUnit')}</TableHead>
                    <TableHead>{t('processes.totalCost')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {process.data.outputs.map((output, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <div className="font-medium">
                          {getMaterialName(output.material_uuid)}
                        </div>
                        <div className="text-xs text-gray-500 font-mono">
                          {output.material_uuid}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">
                          {output.quantity.toLocaleString()}
                        </div>
                      </TableCell>
                      <TableCell>
                        {output.cost_per_unit ? (
                          <div className="flex items-center gap-1">
                            <span className="font-medium">{output.cost_per_unit.toLocaleString()} {te('SYP')}</span>
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {output.total_cost ? (
                          <div className="flex items-center gap-1">
                            <span className="font-medium">{output.total_cost.toLocaleString()} {te('SYP')}</span>
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Process Flow Diagram */}
          <ProcessDiagram
            inputs={process.data.inputs}
            outputs={process.data.outputs}
            processType={process.type}
          />
        </div>
      </div>
    </AppLayout>
  );
}