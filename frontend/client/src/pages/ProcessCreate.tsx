import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm, useFieldArray, SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Plus, Trash2, Factory, Package, ArrowRight, BookmarkPlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProcessDiagram } from "@/components/processes/ProcessDiagram";
import { ProcessType } from "@/types/process";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";

const processSchema = z.object({
  type: z.nativeEnum(ProcessType),
  notes: z.string().optional(),
  data: z.object({
    inputs: z.array(z.object({
      quantity: z.number().min(0.01, "Quantity must be greater than 0"),
      material_uuid: z.string().min(1, "Material is required"),
    })).min(1, "At least one input is required"),
    outputs: z.array(z.object({
      material_uuid: z.string().min(1, "Material is required"),
      quantity: z.number().min(0.01, "Quantity must be greater than 0"),
    })).min(1, "At least one output is required"),
    output_warehouse_uuid: z.string().optional(),
  }),
});

type ProcessFormData = z.infer<typeof processSchema>;

export default function ProcessCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t, te } = useLanguage();
  const [selectedMaterials, setSelectedMaterials] = useState<{[key: string]: any}>({});

  const form = useForm<ProcessFormData>({
    resolver: zodResolver(processSchema),
    defaultValues: {
      type: ProcessType.COATED_PEANUT_BATCH,
      notes: "",
      data: {
        inputs: [{ material_uuid: "", quantity: 0 }],
        outputs: [{ material_uuid: "", quantity: 0 }],
        output_warehouse_uuid: "",
      },
    },
  });

  const { fields: inputFields, append: appendInput, remove: removeInput } = useFieldArray({
    control: form.control,
    name: "data.inputs",
  });

  const { fields: outputFields, append: appendOutput, remove: removeOutput } = useFieldArray({
    control: form.control,
    name: "data.outputs",
  });

  // Fetch process types
  const { data: processTypes } = useQuery({
    queryKey: ["/process/types"],
    queryFn: () => apiRequest("/process/types"),
  });

  // Fetch materials for dropdowns
  const { data: materials, isLoading: materialsLoading, error: materialsError } = useQuery({
    queryKey: ["/material/"],
    queryFn: () => apiRequest("/material/?per_page=100"),
  });

  // Fetch warehouses for output warehouse
  const { data: warehouses, isLoading: warehousesLoading, error: warehousesError } = useQuery({
    queryKey: ["/warehouse/"],
    queryFn: () => apiRequest("/warehouse/?per_page=100"),
  });

  // ---- presets: saved templates + recent processes (both just pre-fill
  // the form; everything stays editable before submit) ----
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");

  const { data: templates } = useQuery({
    queryKey: ["/process-template/"],
    queryFn: () => apiRequest("/process-template/?per_page=100"),
  });
  const { data: recentProcesses } = useQuery({
    queryKey: ["/process/", "recent-for-clone"],
    queryFn: () => apiRequest("/process/?page=1&per_page=25"),
  });

  // strip execution enrichment (inventory_uuid, cost_per_unit, ...) down to
  // what the create schema accepts
  const applyPreset = (preset: { type?: string; notes?: string | null; data?: any }) => {
    const cleanRows = (rows: any[] | undefined) =>
      (rows || [])
        .map((r) => ({ material_uuid: r.material_uuid || "", quantity: Number(r.quantity) || 0 }))
        .filter((r) => r.material_uuid);
    const inputs = cleanRows(preset.data?.inputs);
    const outputs = cleanRows(preset.data?.outputs);
    form.reset({
      type: (preset.type as ProcessType) || ProcessType.COATED_PEANUT_BATCH,
      notes: preset.notes || "",
      data: {
        inputs: inputs.length ? inputs : [{ material_uuid: "", quantity: 0 }],
        outputs: outputs.length ? outputs : [{ material_uuid: "", quantity: 0 }],
        output_warehouse_uuid: preset.data?.output_warehouse_uuid || "",
      },
    });
    toast({ title: t('processes.formPrefilled'), description: t('processes.formPrefilledDesc') });
  };

  const saveTemplateMutation = useMutation({
    mutationFn: async () => {
      const v = form.getValues();
      return apiRequest("/process-template/", {
        method: "POST",
        body: { name: templateName.trim(), type: v.type, notes: v.notes || null, data: v.data },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/process-template/"] });
      toast({ title: t('processes.templateSaved'), description: t('processes.templateSavedDesc', { name: templateName.trim() }) });
      setShowSaveTemplate(false);
      setTemplateName("");
    },
    onError: (e: Error) =>
      toast({ title: t('processes.templateSaveFailed'), description: e.message, variant: "destructive" }),
  });





  const createMutation = useMutation({
    mutationFn: async (data: ProcessFormData) => {
      return await apiRequest("/process/", {
        method: "POST",
        body: data,
      });
    },
    onSuccess: () => {
      toast({
        title: t('processes.createdSuccess'),
        description: t('processes.createdSuccessDesc'),
      });
      queryClient.invalidateQueries({ queryKey: ["/process/"] });
      setLocation("/processes");
    },
    onError: (error: any) => {
      toast({
        title: t('processes.createError'),
        description: error.message || t('processes.createErrorDesc'),
        variant: "destructive",
      });
    },
  });

  const onSubmit: SubmitHandler<ProcessFormData> = (data) => {
    // Clean up data - remove empty strings and convert to proper types
    const cleanData = {
      ...data,
      notes: data.notes || undefined,
      data: {
        ...data.data,
        output_warehouse_uuid: data.data.output_warehouse_uuid || undefined,
        inputs: data.data.inputs,
        outputs: data.data.outputs,
      },
    };

    createMutation.mutate(cleanData);
  };

  const getMaterialName = (materialUuid: string) => {
    const material = materials?.items?.find((m: any) => m.uuid === materialUuid);
    return material?.name || t('processes.unknownMaterial');
  };

  const getWarehouseName = (warehouseUuid: string) => {
    const warehouse = warehouses?.items?.find((w: any) => w.uuid === warehouseUuid);
    return warehouse?.name || t('processes.unknownWarehouse');
  };

  // Watch form values for live diagram updates
  const watchedInputs = form.watch("data.inputs");
  const watchedOutputs = form.watch("data.outputs");
  const watchedType = form.watch("type");

  // Filter out incomplete inputs/outputs for diagram
  const validInputs = watchedInputs.filter(input => input.material_uuid && input.quantity > 0);
  const validOutputs = watchedOutputs.filter(output => output.material_uuid && output.quantity > 0);

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
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
              {t('processes.create')}
            </h1>
            <p className="text-gray-600 mt-1">
              {t('processes.createSubtitle')}
            </p>
          </div>
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          {/* Start from a template or an existing process */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('processes.startFrom')}</CardTitle>
              <CardDescription>
                {t('processes.startFromDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-end gap-4">
              <div className="min-w-[260px]">
                <Label className="mb-1 block">{t('processes.template')}</Label>
                <Select
                  value=""
                  onValueChange={(uuid) => {
                    const t = (templates?.items || []).find((t: any) => t.uuid === uuid);
                    if (t) applyPreset(t);
                  }}
                >
                  <SelectTrigger data-testid="select-process-template">
                    <SelectValue placeholder={t('processes.loadTemplate')} />
                  </SelectTrigger>
                  <SelectContent>
                    {(templates?.items || []).length === 0 ? (
                      <SelectItem value="__none" disabled>{t('processes.noTemplates')}</SelectItem>
                    ) : (
                      (templates?.items || []).map((t: any) => (
                        <SelectItem key={t.uuid} value={t.uuid}>
                          {t.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-[260px]">
                <Label className="mb-1 block">{t('processes.cloneRecent')}</Label>
                <Select
                  value=""
                  onValueChange={(uuid) => {
                    const p = (recentProcesses?.items || []).find((p: any) => p.uuid === uuid);
                    if (p) applyPreset(p);
                  }}
                >
                  <SelectTrigger data-testid="select-process-clone">
                    <SelectValue placeholder={t('processes.cloneFromRecent')} />
                  </SelectTrigger>
                  <SelectContent>
                    {(recentProcesses?.items || []).map((p: any) => (
                      <SelectItem key={p.uuid} value={p.uuid}>
                        {te(p.type)} · {new Date(p.created_at).toLocaleDateString()}
                        {p.notes ? ` · ${String(p.notes).slice(0, 30)}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowSaveTemplate(true)}
                data-testid="button-save-template"
              >
                <BookmarkPlus className="h-4 w-4 me-2" />
                {t('processes.saveAsTemplate')}
              </Button>
            </CardContent>
          </Card>

          {/* Process Information */}
          <Card>
            <CardHeader>
              <CardTitle>{t('processes.processInfo')}</CardTitle>
              <CardDescription>
                {t('processes.processInfoDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="type">{t('processes.processType')}</Label>
                  <Select
                    value={form.watch("type")}
                    onValueChange={(value) => form.setValue("type", value as ProcessType)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('processes.selectType')} />
                    </SelectTrigger>
                    <SelectContent>
                      {processTypes?.map((type: string) => (
                        <SelectItem key={type} value={type}>
                          {te(type)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.formState.errors.type && (
                    <p className="text-sm text-red-600">{form.formState.errors.type.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="warehouse">{t('processes.outputWarehouseOptional')}</Label>
                  <Select
                    value={form.watch("data.output_warehouse_uuid") || "none"}
                    onValueChange={(value) => form.setValue("data.output_warehouse_uuid", value === "none" ? undefined : value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('processes.selectWarehouse')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t('processes.noWarehouse')}</SelectItem>
                      {warehouses?.warehouses?.map((warehouse: any) => (
                        <SelectItem key={warehouse.uuid} value={warehouse.uuid}>
                          {warehouse.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">{t('common.notes')}</Label>
                <Textarea
                  id="notes"
                  placeholder={t('processes.notesPlaceholder')}
                  {...form.register("notes")}
                />
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
                {t('processes.inputMaterialsDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('processes.material')}</TableHead>
                    <TableHead>{t('common.quantity')}</TableHead>
                    <TableHead>{t('common.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inputFields.map((field, index) => (
                    <TableRow key={field.id}>
                      <TableCell>
                        <Select
                          value={form.watch(`data.inputs.${index}.material_uuid`)}
                          onValueChange={(value) => form.setValue(`data.inputs.${index}.material_uuid`, value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={t('processes.selectMaterial')} />
                          </SelectTrigger>
                          <SelectContent>
                            {materials?.materials?.map((material: any) => (
                              <SelectItem key={material.uuid} value={material.uuid}>
                                {material.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0"
                          {...form.register(`data.inputs.${index}.quantity`, { valueAsNumber: true })}
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => removeInput(index)}
                          disabled={inputFields.length === 1}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Button
                type="button"
                variant="outline"
                onClick={() => appendInput({ material_uuid: "", quantity: 0 })}
                className="mt-4"
              >
                <Plus className="h-4 w-4 me-2" />
                {t('processes.addInput')}
              </Button>
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
                {t('processes.outputProductsDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('processes.material')}</TableHead>
                    <TableHead>{t('common.quantity')}</TableHead>
                    <TableHead>{t('common.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {outputFields.map((field, index) => (
                    <TableRow key={field.id}>
                      <TableCell>
                        <Select
                          value={form.watch(`data.outputs.${index}.material_uuid`)}
                          onValueChange={(value) => form.setValue(`data.outputs.${index}.material_uuid`, value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={t('processes.selectMaterial')} />
                          </SelectTrigger>
                          <SelectContent>
                            {materials?.materials?.map((material: any) => (
                              <SelectItem key={material.uuid} value={material.uuid}>
                                {material.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0"
                          {...form.register(`data.outputs.${index}.quantity`, { valueAsNumber: true })}
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => removeOutput(index)}
                          disabled={outputFields.length === 1}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Button
                type="button"
                variant="outline"
                onClick={() => appendOutput({ material_uuid: "", quantity: 0 })}
                className="mt-4"
              >
                <Plus className="h-4 w-4 me-2" />
                {t('processes.addOutput')}
              </Button>
            </CardContent>
          </Card>

          {/* Live Process Diagram */}
          {validInputs.length > 0 && validOutputs.length > 0 && (
            <ProcessDiagram
              inputs={validInputs}
              outputs={validOutputs}
              processType={watchedType}
            />
          )}

          {/* Submit Button */}
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={createMutation.isPending}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {createMutation.isPending ? t('common.creating') : t('processes.create')}
            </Button>
          </div>
        </form>
      </div>

      <Dialog open={showSaveTemplate} onOpenChange={setShowSaveTemplate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('processes.saveTemplateTitle')}</DialogTitle>
          </DialogHeader>
          <div>
            <Label className="mb-1 block">{t('processes.templateName')}</Label>
            <Input
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder={t('processes.templateNamePlaceholder')}
              data-testid="input-template-name"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveTemplate(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={!templateName.trim() || saveTemplateMutation.isPending}
              onClick={() => saveTemplateMutation.mutate()}
              data-testid="button-confirm-save-template"
            >
              {saveTemplateMutation.isPending ? t('common.saving') : t('processes.saveTemplate')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}