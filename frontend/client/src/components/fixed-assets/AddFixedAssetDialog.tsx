import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const fixedAssetSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  purchase_date: z.string().optional(),
  annual_depreciation_rate: z.string().min(1, "Annual depreciation rate is required"),
  purchase_order_item_uuid: z.string().optional(),
  material_uuid: z.string().optional(),
  quantity: z.string().optional(),
  price_per_unit: z.string().optional(),
});

type FixedAssetFormData = z.infer<typeof fixedAssetSchema>;

export function AddFixedAssetDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<FixedAssetFormData>({
    resolver: zodResolver(fixedAssetSchema),
    defaultValues: {
      name: "",
      description: "",
      purchase_date: "",
      annual_depreciation_rate: "",
      purchase_order_item_uuid: "",
      material_uuid: "",
      quantity: "",
      price_per_unit: "",
    },
  });

  const createFixedAssetMutation = useMutation({
    mutationFn: async (data: FixedAssetFormData) => {
      const payload = {
        name: data.name,
        description: data.description || null,
        purchase_date: data.purchase_date || null,
        annual_depreciation_rate: parseFloat(data.annual_depreciation_rate),
        purchase_order_item_uuid: data.purchase_order_item_uuid || null,
        material_uuid: data.material_uuid || null,
        quantity: data.quantity ? parseFloat(data.quantity) : null,
        price_per_unit: data.price_per_unit ? parseFloat(data.price_per_unit) : null,
      };

      return await apiRequest("/fixed-asset/", { method: "POST", body: payload });
    },
    onSuccess: () => {
      // Invalidate and refetch fixed assets list
      queryClient.invalidateQueries({ queryKey: ["/fixed-asset/"] });
      queryClient.refetchQueries({ queryKey: ["/fixed-asset/"] });
      
      toast({
        title: "Success",
        description: "Fixed asset created successfully",
      });

      form.reset();
      setIsOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FixedAssetFormData) => {
    createFixedAssetMutation.mutate(data);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="bg-[#5469D4] hover:bg-[#4356C7] text-white">
          <Plus className="h-4 w-4 me-2" />
          Add Fixed Asset
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add New Fixed Asset</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter asset name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Enter asset description"
                      className="resize-none"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="purchase_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Purchase Date (Optional)</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="annual_depreciation_rate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Depreciation Rate (%)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Enter rate"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantity (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Enter quantity"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="price_per_unit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Price per Unit (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Enter price"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="purchase_order_item_uuid"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Purchase Order Item UUID (Optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter purchase order item UUID" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
                )}
            />

            <FormField
              control={form.control}
              name="material_uuid"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Material UUID (Optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter material UUID" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex gap-2 pt-4">
              <Button
                type="submit"
                disabled={createFixedAssetMutation.isPending}
                className="flex-1 bg-[#5469D4] hover:bg-[#4356C7] text-white"
              >
                {createFixedAssetMutation.isPending ? "Creating..." : "Create Fixed Asset"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}