import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
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
import {
  ArrowLeft,
  Building2,
  Calendar,
  Copy,
  Edit,
  Mail,
  MapPin,
  Phone,
  Plus,
  Save,
  Tag,
  Trash2,
  X,
  CreditCard,
  User as UserIcon
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { apiRequest } from "@/lib/queryClient";
import type { Vendor, VendorUpdateData, VendorCategory } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const VENDOR_CATEGORIES = [
  { value: "raw_materials", label: "Raw Materials" },
  { value: "equipment", label: "Equipment" },
  { value: "services", label: "Services" },
  { value: "other", label: "Other" }
];

const VENDOR_CATEGORY_LABELS = {
  raw_materials: "Raw Materials",
  equipment: "Equipment", 
  services: "Services",
  other: "Other"
};

const VENDOR_CATEGORY_COLORS = {
  raw_materials: "bg-green-100 text-green-800",
  equipment: "bg-blue-100 text-blue-800",
  services: "bg-purple-100 text-purple-800",
  other: "bg-gray-100 text-gray-800"
};

// Fix leaflet default markers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const vendorUpdateSchema = z.object({
  company_name: z.string().min(1, "Company name is required").optional(),
  full_name: z.string().min(1, "Full name is required").optional(),
  phone_number: z.string().min(1, "Phone number is required").optional(),
  email_address: z.string().email("Invalid email address").optional().or(z.literal("")),
  full_address: z.string().optional(),
  business_cards: z.string().optional(),
  notes: z.string().optional(),
  category: z.string().optional(),
  coordinates: z.string().optional(),
});

type VendorUpdateFormValues = z.infer<typeof vendorUpdateSchema>;

export default function VendorDetail() {
  const { uuid } = useParams();
  const [, setLocation] = useLocation();
  const [isEditing, setIsEditing] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch vendor details
  const { data: vendor, isLoading } = useQuery<Vendor>({
    queryKey: ["/vendor", uuid],
    queryFn: async () => {
      if (!uuid) throw new Error("Vendor UUID is required");
      return await apiRequest(`/vendor/${uuid}`);
    },
    enabled: !!uuid,
  });

  const form = useForm<VendorUpdateFormValues>({
    resolver: zodResolver(vendorUpdateSchema),
    defaultValues: {
      company_name: vendor?.company_name || "",
      full_name: vendor?.full_name || "",
      phone_number: vendor?.phone_number || "",
      email_address: vendor?.email_address || "",
      full_address: vendor?.full_address || "",
      business_cards: vendor?.business_cards || "",
      notes: vendor?.notes || "",
      category: vendor?.category || "",
      coordinates: vendor?.coordinates || "",
    },
  });

  // Update form when vendor data loads using useEffect
  useEffect(() => {
    if (vendor) {
      form.reset({
        company_name: vendor.company_name,
        full_name: vendor.full_name,
        phone_number: vendor.phone_number,
        email_address: vendor.email_address || null,
        full_address: vendor.full_address || null,
        business_cards: vendor.business_cards || null,
        notes: vendor.notes || null,
        category: vendor.category || "",
        coordinates: vendor.coordinates || null,
      });
    }
  }, [vendor]);

  // Parse vendor coordinates for map display
  const vendorLocation = useMemo(() => {
    if (!vendor?.coordinates) return null;
    
    try {
      const coords = vendor.coordinates.split(',').map(c => parseFloat(c.trim()));
      if (coords.length === 2 && !isNaN(coords[0]) && !isNaN(coords[1])) {
        return {
          lat: coords[0],
          lng: coords[1]
        };
      }
    } catch (e) {
      console.warn('Invalid coordinates for vendor:', vendor.uuid, vendor.coordinates);
    }
    return null;
  }, [vendor]);

  const updateVendorMutation = useMutation({
    mutationFn: async (data: VendorUpdateData) => {
      if (!uuid) throw new Error("Vendor UUID is required");
      return await apiRequest(`/vendor/${uuid}`, { method: "PUT", body: data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) => 
        query.queryKey[0] === "/vendor" 
      });
      setIsEditing(false);
      toast({
        title: "Success",
        description: "Vendor updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update vendor",
        variant: "destructive",
      });
    },
  });

  const deleteVendorMutation = useMutation({
    mutationFn: async (uuid: string) => {
      return await apiRequest(`/vendor/${uuid}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) => 
        query.queryKey[0] === "/vendor" 
      });
      setLocation("/vendors");
      toast({
        title: "Success",
        description: "Vendor deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete vendor",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: VendorUpdateFormValues) => {
    // Only include changed fields and convert empty strings to undefined
    const updateData: VendorUpdateData = {};
    
    if (data.company_name !== vendor?.company_name) {
      updateData.company_name = data.company_name;
    }
    if (data.full_name !== vendor?.full_name) {
      updateData.full_name = data.full_name;
    }
    if (data.phone_number !== vendor?.phone_number) {
      updateData.phone_number = data.phone_number;
    }
    if (data.email_address !== (vendor?.email_address || "")) {
      updateData.email_address = data.email_address || undefined;
    }
    if (data.full_address !== (vendor?.full_address || "")) {
      updateData.full_address = data.full_address || undefined;
    }
    if (data.business_cards !== (vendor?.business_cards || "")) {
      updateData.business_cards = data.business_cards || undefined;
    }
    if (data.notes !== (vendor?.notes || "")) {
      updateData.notes = data.notes || undefined;
    }
    if (data.category !== (vendor?.category || "")) {
      updateData.category = (data.category as VendorCategory) || undefined;
    }
    if (data.coordinates !== (vendor?.coordinates || "")) {
      updateData.coordinates = data.coordinates || undefined;
    }

    if (Object.keys(updateData).length === 0) {
      setIsEditing(false);
      return;
    }

    updateVendorMutation.mutate(updateData);
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied!",
        description: `${label} copied to clipboard`,
      });
    } catch (err) {
      toast({
        title: "Failed to copy",
        description: "Could not copy to clipboard",
        variant: "destructive",
      });
    }
  };

  const handleDeleteVendor = () => {
    if (vendor) {
      deleteVendorMutation.mutate(vendor.uuid);
    }
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-4 lg:p-6">
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={() => setLocation("/vendors")}>
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              {[...Array(4)].map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardHeader>
                    <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                  </CardHeader>
                  <CardContent>
                    <div className="h-16 bg-gray-200 rounded"></div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!vendor) {
    return (
      <AppLayout>
        <div className="p-4 lg:p-6">
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={() => setLocation("/vendors")}>
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            </div>
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Vendor not found</h3>
                <p className="text-muted-foreground">The requested vendor could not be found.</p>
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
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={() => setLocation("/vendors")}>
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <div>
                <h1 className="text-2xl font-bold">{vendor.company_name}</h1>
                <p className="text-muted-foreground">{vendor.full_name}</p>
              </div>
            </div>
            <div className="flex gap-2">
              {isEditing ? (
                <>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsEditing(false);
                      form.reset();
                    }}
                  >
                    <X className="h-4 w-4" />
                    Cancel
                  </Button>
                  <Button
                    onClick={form.handleSubmit(onSubmit)}
                    disabled={updateVendorMutation.isPending}
                  >
                    <Save className="h-4 w-4" />
                    {updateVendorMutation.isPending ? "Saving..." : "Save"}
                  </Button>
                </>
              ) : (
                <>
                  <Button 
                    onClick={() => setLocation(`/purchase-orders/create?vendor_uuid=${vendor.uuid}&referrer=/vendors/${vendor.uuid}`)}
                    className="bg-purple-600 hover:bg-purple-700 text-white"
                  >
                    <Plus className="h-4 w-4" />
                    Create Purchase Order
                  </Button>
                  <Button variant="outline" onClick={() => setIsEditing(true)}>
                    <Edit className="h-4 w-4" />
                    Edit
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Vendor</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete "{vendor.company_name}"? This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleDeleteVendor}
                          disabled={deleteVendorMutation.isPending}
                          className="bg-red-600 hover:bg-red-700"
                        >
                          {deleteVendorMutation.isPending ? "Deleting..." : "Delete"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              )}
            </div>
          </div>

          {isEditing ? (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid gap-6 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Building2 className="h-5 w-5" />
                        Company Information
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <FormField
                        control={form.control}
                        name="company_name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Company Name</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="category"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Category</FormLabel>
                            <Select
                              value={field.value || "none"}
                              onValueChange={(value: string) => field.onChange(value === "none" ? "" : value)}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select category" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="none">No category</SelectItem>
                                {VENDOR_CATEGORIES.map((category) => (
                                  <SelectItem key={category.value} value={category.value}>
                                    {category.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <UserIcon className="h-5 w-5" />
                        Contact Information
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <FormField
                        control={form.control}
                        name="full_name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Full Name</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="phone_number"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Phone Number</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="email_address"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email Address</FormLabel>
                            <FormControl>
                              <Input type="email" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <MapPin className="h-5 w-5" />
                        Location & Address
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <FormField
                        control={form.control}
                        name="full_address"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Full Address</FormLabel>
                            <FormControl>
                              <Textarea {...field} rows={3} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="coordinates"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Coordinates</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="e.g., 33.5138,36.2765" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Additional Information</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <FormField
                        control={form.control}
                        name="business_cards"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Business Cards</FormLabel>
                            <FormControl>
                              <Textarea {...field} rows={2} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="notes"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Notes</FormLabel>
                            <FormControl>
                              <Textarea {...field} rows={3} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>
                </div>
              </form>
            </Form>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    Company Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-muted-foreground">Company Name</Label>
                    <div className="flex items-center justify-between group">
                      <span className="font-medium">{vendor.company_name}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => copyToClipboard(vendor.company_name, "Company name")}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <Separator />
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-muted-foreground">Category</Label>
                    <div className="flex items-center justify-between group">
                      {vendor.category ? (
                        <Badge 
                          variant="secondary" 
                          className={vendor.category ? VENDOR_CATEGORY_COLORS[vendor.category] : "bg-gray-100 text-gray-800"}
                        >
                          {vendor.category ? VENDOR_CATEGORY_LABELS[vendor.category] : "Unknown"}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">No category set</span>
                      )}
                      {vendor.category && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => copyToClipboard(VENDOR_CATEGORY_LABELS[vendor.category!], "Category")}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <Separator />
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-muted-foreground">UUID</Label>
                    <div className="flex items-center justify-between group">
                      <span className="font-mono text-sm">{vendor.uuid}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => copyToClipboard(vendor.uuid, "UUID")}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <UserIcon className="h-5 w-5" />
                    Contact Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-muted-foreground">Full Name</Label>
                    <div className="flex items-center justify-between group">
                      <span>{vendor.full_name}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => copyToClipboard(vendor.full_name, "Full name")}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <Separator />
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      Phone Number
                    </Label>
                    <div className="flex items-center justify-between group">
                      <span>{vendor.phone_number}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => copyToClipboard(vendor.phone_number, "Phone number")}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  {vendor.email_address && (
                    <>
                      <Separator />
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                          <Mail className="h-4 w-4" />
                          Email Address
                        </Label>
                        <div className="flex items-center justify-between group">
                          <span>{vendor.email_address}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => copyToClipboard(vendor.email_address!, "Email address")}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5" />
                    Location & Address
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {vendor.full_address && (
                    <>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">Full Address</Label>
                        <div className="flex items-start justify-between group">
                          <span className="flex-1">{vendor.full_address}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="opacity-0 group-hover:opacity-100 transition-opacity ml-2"
                            onClick={() => copyToClipboard(vendor.full_address!, "Address")}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <Separator />
                    </>
                  )}
                  {vendor.coordinates && (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-muted-foreground">Coordinates</Label>
                      <div className="flex items-center justify-between group">
                        <span className="font-mono text-sm">{vendor.coordinates}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => copyToClipboard(vendor.coordinates!, "Coordinates")}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  )}
                  {!vendor.full_address && !vendor.coordinates && (
                    <div className="text-center py-8">
                      <MapPin className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">No location information available</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5" />
                    Balance & Metadata
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {Object.keys(vendor.balance_per_currency).length > 0 && (
                    <>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">Balance per Currency</Label>
                        <div className="space-y-1">
                          {Object.entries(vendor.balance_per_currency).map(([currency, balance]) => (
                            <div key={currency} className="flex items-center justify-between group">
                              <span className="text-sm">
                                <span className="font-medium">{currency}:</span> {balance}
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => copyToClipboard(`${currency}: ${balance}`, "Balance")}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                      <Separator />
                    </>
                  )}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Created At
                    </Label>
                    <div className="flex items-center justify-between group">
                      <span>{formatDate(vendor.created_at)}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => copyToClipboard(formatDate(vendor.created_at), "Created date")}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  {vendor.created_by_uuid && (
                    <>
                      <Separator />
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">Created By</Label>
                        <div className="flex items-center justify-between group">
                          <span className="font-mono text-sm">{vendor.created_by_uuid}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => copyToClipboard(vendor.created_by_uuid!, "Created by UUID")}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {(vendor.business_cards || vendor.notes) && (
                <Card className="md:col-span-2">
                  <CardHeader>
                    <CardTitle>Additional Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {vendor.business_cards && (
                      <>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-muted-foreground">Business Cards</Label>
                          <div className="flex items-start justify-between group">
                            <span className="flex-1 whitespace-pre-wrap">{vendor.business_cards}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="opacity-0 group-hover:opacity-100 transition-opacity ml-2"
                              onClick={() => copyToClipboard(vendor.business_cards!, "Business cards")}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        {vendor.notes && <Separator />}
                      </>
                    )}
                    {vendor.notes && (
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">Notes</Label>
                        <div className="flex items-start justify-between group">
                          <span className="flex-1 whitespace-pre-wrap">{vendor.notes}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="opacity-0 group-hover:opacity-100 transition-opacity ml-2"
                            onClick={() => copyToClipboard(vendor.notes!, "Notes")}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Location Map */}
              {vendorLocation && (
                <Card className="md:col-span-2">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MapPin className="h-5 w-5" />
                      Location Map
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[400px] w-full rounded-lg overflow-hidden border">
                      <MapContainer
                        center={[vendorLocation.lat, vendorLocation.lng]}
                        zoom={15}
                        style={{ height: '100%', width: '100%' }}
                      >
                        <TileLayer
                          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                        <Marker position={[vendorLocation.lat, vendorLocation.lng]}>
                          <Popup>
                            <div className="p-2 min-w-[200px]">
                              <h3 className="font-semibold text-sm mb-1">{vendor.company_name}</h3>
                              <p className="text-xs text-muted-foreground mb-2">{vendor.full_name}</p>
                              
                              {vendor.category && (
                                <Badge 
                                  variant="secondary" 
                                  className={`text-xs mb-2 ${VENDOR_CATEGORY_COLORS[vendor.category]}`}
                                >
                                  {VENDOR_CATEGORY_LABELS[vendor.category]}
                                </Badge>
                              )}
                              
                              <div className="space-y-1 text-xs">
                                <div className="flex items-center gap-1">
                                  <Phone className="h-3 w-3" />
                                  <span>{vendor.phone_number}</span>
                                </div>
                                
                                {vendor.email_address && (
                                  <div className="flex items-center gap-1">
                                    <Mail className="h-3 w-3" />
                                    <span>{vendor.email_address}</span>
                                  </div>
                                )}
                                
                                {vendor.full_address && (
                                  <div className="flex items-start gap-1">
                                    <MapPin className="h-3 w-3 mt-0.5" />
                                    <span className="text-xs">{vendor.full_address}</span>
                                  </div>
                                )}
                              </div>
                              
                              <div className="mt-2 text-xs text-muted-foreground">
                                Coordinates: {vendorLocation.lat}, {vendorLocation.lng}
                              </div>
                            </div>
                          </Popup>
                        </Marker>
                      </MapContainer>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}