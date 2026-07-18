import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ArrowLeft, Building, MapPin, Calendar, User, Copy, Edit, Trash2, StickyNote } from "lucide-react";
import { WarehouseDetailMap } from "@/components/map/WarehouseDetailMap";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Warehouse } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { Link } from "wouter";

export default function WarehouseDetail() {
  const { uuid } = useParams<{ uuid: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch warehouse details
  const { data: warehouse, isLoading, error } = useQuery<Warehouse>({
    queryKey: ["/warehouse", uuid],
    queryFn: async () => {
      return await apiRequest(`/warehouse/${uuid}`);
    },
    enabled: !!uuid,
  });

  // Delete warehouse mutation
  const deleteWarehouseMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/warehouse/${uuid}`, { method: "DELETE" });
    },
    onSuccess: () => {
      // Invalidate all warehouse queries to refresh the list
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const queryKey = query.queryKey[0] as string;
          return queryKey.includes("/warehouse");
        }
      });
      
      // Also refetch any active queries immediately
      queryClient.refetchQueries({
        predicate: (query) => {
          const queryKey = query.queryKey[0] as string;
          return queryKey.includes("/warehouse");
        }
      });
      
      toast({
        title: "Success",
        description: "Warehouse deleted successfully",
      });
      
      // Navigate back to warehouses list
      setLocation("/warehouses");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete warehouse",
        variant: "destructive",
      });
    },
  });

  // Copy to clipboard functionality
  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied!",
        description: `${label} copied to clipboard`,
      });
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to copy to clipboard",
        variant: "destructive",
      });
    }
  };

  const handleDelete = () => {
    deleteWarehouseMutation.mutate();
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-4 lg:p-6">
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <Link href="/warehouses">
                <Button variant="outline" size="sm">
                  <ArrowLeft className="h-4 w-4 me-2" />
                  Back to Warehouses
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

  if (error || !warehouse) {
    return (
      <AppLayout>
        <div className="p-4 lg:p-6">
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <Link href="/warehouses">
                <Button variant="outline" size="sm">
                  <ArrowLeft className="h-4 w-4 me-2" />
                  Back to Warehouses
                </Button>
              </Link>
            </div>
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Building className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Warehouse not found</h3>
                <p className="text-muted-foreground text-center">
                  The warehouse you're looking for doesn't exist or may have been deleted.
                </p>
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
              <Link href="/warehouses">
                <Button variant="outline" size="sm">
                  <ArrowLeft className="h-4 w-4 me-2" />
                  Back to Warehouses
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  <Building className="h-6 w-6" />
                  {warehouse.name}
                </h1>
                <p className="text-muted-foreground">Warehouse details and information</p>
              </div>
            </div>
            
            <div className="flex gap-2">
              <Link href={`/warehouses/${uuid}/edit`}>
                <Button variant="outline" size="sm">
                  <Edit className="h-4 w-4 me-2" />
                  Edit
                </Button>
              </Link>
              
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                    <Trash2 className="h-4 w-4 me-2" />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Warehouse</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete "{warehouse.name}"? This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDelete}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      disabled={deleteWarehouseMutation.isPending}
                    >
                      {deleteWarehouseMutation.isPending ? "Deleting..." : "Delete"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>

          {/* Main Content */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Warehouse Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building className="h-5 w-5" />
                  Warehouse Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Building className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Name:</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{warehouse.name}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(warehouse.name, "Warehouse name")}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Address:</span>
                    </div>
                    <div className="flex items-start gap-2 text-end">
                      <span className="text-sm max-w-[200px]">{warehouse.address}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(warehouse.address, "Address")}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  {warehouse.coordinates && (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Coordinates:</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono">{warehouse.coordinates}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(warehouse.coordinates!, "Coordinates")}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Created:</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{formatDate(warehouse.created_at)}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(formatDate(warehouse.created_at), "Creation date")}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Warehouse ID:</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono">{warehouse.uuid}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(warehouse.uuid, "Warehouse ID")}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  {warehouse.notes && (
                    <div className="pt-2 border-t">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <StickyNote className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">Notes:</span>
                        </div>
                        <div className="flex items-start gap-2 text-end">
                          <span className="text-sm max-w-[200px] whitespace-pre-wrap">{warehouse.notes}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(warehouse.notes!, "Notes")}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Location Map */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Location Map
                </CardTitle>
              </CardHeader>
              <CardContent>
                <WarehouseDetailMap warehouse={warehouse} />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}