import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

const inventoryEventSchema = z.object({
  inventory_uuid: z.string().min(1, "Inventory UUID is required"),
  event_type: z.string().min(1, "Event type is required"),
  quantity: z.string().min(1, "Quantity is required"),
  notes: z.string().optional(),
  cost_per_unit: z.string().optional(),
  currency: z.string().optional(),
  affect_original: z.boolean(),
});

type InventoryEventFormData = z.infer<typeof inventoryEventSchema>;

export function AddInventoryEventDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch event types
  const { data: eventTypes } = useQuery<string[]>({
    queryKey: ["/inventory-event/event_types"],
    queryFn: async () => {
      return await apiRequest("/inventory-event/event_types");
    },
    enabled: isOpen,
  });

  // Fetch currencies
  const { data: currencies } = useQuery<string[]>({
    queryKey: ["/payment/currencies"],
    queryFn: async () => {
      return await apiRequest("/payment/currencies");
    },
    enabled: isOpen,
  });

  const form = useForm<InventoryEventFormData>({
    resolver: zodResolver(inventoryEventSchema),
    defaultValues: {
      inventory_uuid: "",
      event_type: "",
      quantity: "",
      notes: "",
      cost_per_unit: "",
      currency: "",
      affect_original: false,
    },
  });

  const createInventoryEventMutation = useMutation({
    mutationFn: async (data: InventoryEventFormData) => {
      const payload = {
        inventory_uuid: data.inventory_uuid,
        event_type: data.event_type,
        quantity: parseFloat(data.quantity),
        notes: data.notes || null,
        cost_per_unit: data.cost_per_unit ? parseFloat(data.cost_per_unit) : null,
        currency: data.currency || null,
        affect_original: data.affect_original,
      };

      return await apiRequest("/inventory-event/", { method: "POST", body: payload });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/inventory-event/"] });
      queryClient.refetchQueries({ queryKey: ["/inventory-event/"] });
      
      toast({
        title: "Success",
        description: "Inventory event created successfully",
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

  const onSubmit = (data: InventoryEventFormData) => {
    createInventoryEventMutation.mutate(data);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="bg-[#5469D4] hover:bg-[#4356C7] text-white">
          <Plus className="h-4 w-4 mr-2" />
          Add Inventory Event
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add New Inventory Event</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="inventory_uuid"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Inventory UUID</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter inventory UUID" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="event_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Event Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select event type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {eventTypes?.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type.replace('_', ' ').toUpperCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="quantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Quantity</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="Enter quantity" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="cost_per_unit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cost per Unit (Optional)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" placeholder="Enter cost" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Currency (Optional)</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select currency" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {currencies?.map((currency) => (
                          <SelectItem key={currency} value={currency}>
                            {currency}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="affect_original"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Affect Original Quantity</FormLabel>
                    <div className="text-sm text-muted-foreground">
                      Whether this event affects the original inventory quantity
                    </div>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (Optional)</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Enter any additional notes"
                      className="resize-none"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setIsOpen(false)}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={createInventoryEventMutation.isPending}
                className="bg-[#5469D4] hover:bg-[#4356C7]"
              >
                {createInventoryEventMutation.isPending ? "Creating..." : "Create Event"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}