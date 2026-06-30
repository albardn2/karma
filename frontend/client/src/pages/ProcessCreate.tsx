import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm, useFieldArray, SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Plus, Trash2, Factory, Package, ArrowRight } from "lucide-react";
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
import { ProcessType, ProcessTypeLabels } from "@/types/process";
import { apiRequest, queryClient } from "@/lib/queryClient";

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





  const createMutation = useMutation({
    mutationFn: async (data: ProcessFormData) => {
      return await apiRequest("/process/", {
        method: "POST",
        body: data,
      });
    },
    onSuccess: () => {
      toast({
        title: "Process created successfully",
        description: "The manufacturing process has been created.",
      });
      queryClient.invalidateQueries({ queryKey: ["/process/"] });
      setLocation("/processes");
    },
    onError: (error: any) => {
      toast({
        title: "Error creating process",
        description: error.message || "Failed to create process",
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
    return material?.name || "Unknown Material";
  };

  const getWarehouseName = (warehouseUuid: string) => {
    const warehouse = warehouses?.items?.find((w: any) => w.uuid === warehouseUuid);
    return warehouse?.name || "Unknown Warehouse";
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
            Back to Processes
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
              <Factory className="h-8 w-8" />
              Create Process
            </h1>
            <p className="text-gray-600 mt-1">
              Define a new manufacturing process with inputs and outputs
            </p>
          </div>
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          {/* Process Information */}
          <Card>
            <CardHeader>
              <CardTitle>Process Information</CardTitle>
              <CardDescription>
                Basic information about the manufacturing process
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="type">Process Type</Label>
                  <Select
                    value={form.watch("type")}
                    onValueChange={(value) => form.setValue("type", value as ProcessType)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select process type" />
                    </SelectTrigger>
                    <SelectContent>
                      {processTypes?.map((type: string) => (
                        <SelectItem key={type} value={type}>
                          {ProcessTypeLabels[type as ProcessType] || type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.formState.errors.type && (
                    <p className="text-sm text-red-600">{form.formState.errors.type.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="warehouse">Output Warehouse (Optional)</Label>
                  <Select
                    value={form.watch("data.output_warehouse_uuid") || "none"}
                    onValueChange={(value) => form.setValue("data.output_warehouse_uuid", value === "none" ? undefined : value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select warehouse" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No warehouse selected</SelectItem>
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
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  placeholder="Optional notes about this process..."
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
                Input Materials
              </CardTitle>
              <CardDescription>
                Materials that will be consumed in this process
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Material</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Actions</TableHead>
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
                            <SelectValue placeholder="Select material" />
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
                <Plus className="h-4 w-4 mr-2" />
                Add Input Material
              </Button>
            </CardContent>
          </Card>

          {/* Output Products */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowRight className="h-5 w-5" />
                Output Products
              </CardTitle>
              <CardDescription>
                Products that will be produced by this process
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Material</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Actions</TableHead>
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
                            <SelectValue placeholder="Select material" />
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
                <Plus className="h-4 w-4 mr-2" />
                Add Output Product
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
              {createMutation.isPending ? "Creating..." : "Create Process"}
            </Button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}