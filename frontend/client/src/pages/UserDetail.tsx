import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { 
  ArrowLeft, 
  Edit, 
  Save, 
  X, 
  User as UserIcon, 
  Mail, 
  Phone, 
  Calendar, 
  Shield,
  Key,
  Globe,
  Copy,
  Trash2,
  MapPin,
  Timer,
  History
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { UserLocationMap } from "@/components/location/UserLocationMap";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { User, UserUpdateData, PermissionScope } from "@/lib/types";

const userUpdateSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters").optional(),
  first_name: z.string().min(1, "First name is required").optional(),
  last_name: z.string().min(1, "Last name is required").optional(),
  email: z.string().email("Invalid email format").optional().or(z.literal("")),
  phone_number: z.string().optional(),
  language: z.string().optional(),
  password: z.string().min(6, "Password must be at least 6 characters").optional().or(z.literal("")),
  permission_scope: z.string().optional(),
  rfid_token: z.string().optional(),
  track_location: z.boolean().optional(),
  location_ping_seconds: z.preprocess(
    (val) => (val === "" || val === null || val === undefined ? undefined : Number(val)),
    z
      .number({ invalid_type_error: "Must be a number" })
      .int("Must be a whole number")
      .min(1, "Must be at least 1 second")
      .max(3600, "Must be at most 3600 seconds")
      .optional()
  ),
});

type UserUpdateFormValues = z.infer<typeof userUpdateSchema>;

export default function UserDetail() {
  const [, params] = useRoute("/users/:uuid");
  const uuid = params?.uuid;
  const [, setLocation] = useLocation();
  const [isEditing, setIsEditing] = useState(false);
  const { toast } = useToast();

  // Fetch user details
  const { data: user, isLoading } = useQuery<User>({
    queryKey: ["/auth/user", uuid],
    queryFn: async () => {
      if (!uuid) throw new Error("User UUID is required");
      return await apiRequest(`/auth/user/${uuid}`);
    },
    enabled: !!uuid,
  });

  // Fetch permission scopes
  const { data: permissionScopes } = useQuery<string[]>({
    queryKey: ["/auth/permissions"],
    queryFn: async () => {
      return await apiRequest("/auth/permissions");
    },
  });

  const form = useForm<UserUpdateFormValues>({
    resolver: zodResolver(userUpdateSchema),
    defaultValues: {
      username: "",
      first_name: "",
      last_name: "",
      email: "",
      phone_number: "",
      language: "",
      password: "",
      permission_scope: "",
      rfid_token: "",
      track_location: undefined,
      location_ping_seconds: undefined,
    },
  });

  // Update form when user data loads
  useEffect(() => {
    if (user) {
      form.reset({
        username: user.username || "",
        first_name: user.first_name || "",
        last_name: user.last_name || "",
        email: user.email || "",
        phone_number: user.phone_number || "",
        language: user.language || "",
        password: "",
        permission_scope: user.permission_scope || "",
        rfid_token: "",
        track_location: user.track_location,
        location_ping_seconds: user.location_ping_seconds,
      });
    }
  }, [user, form]);

  // Update user mutation
  const updateUserMutation = useMutation({
    mutationFn: async (data: UserUpdateData) => {
      if (!uuid) throw new Error("User UUID is required");
      
      // Clean up empty fields before sending
      const cleanData = Object.fromEntries(
        Object.entries(data).filter(([_, value]) => value !== "" && value !== undefined)
      );
      
      return await apiRequest(`/auth/user/${uuid}`, { method: "PUT", body: cleanData });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/auth/user", uuid] });
      queryClient.invalidateQueries({ 
        queryKey: ["/auth/users"],
        exact: false 
      });
      toast({
        title: "Success",
        description: "User updated successfully",
      });
      setIsEditing(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update user",
        variant: "destructive",
      });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async () => {
      if (!uuid) throw new Error("User UUID is required");
      return await apiRequest(`/auth/user/${uuid}`, { method: "DELETE" });
    },
    onSuccess: () => {
      // Invalidate all user queries to refresh the list
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const queryKey = query.queryKey[0] as string;
          return queryKey.includes("/auth/user");
        }
      });
      
      // Also refetch any active queries immediately
      queryClient.refetchQueries({
        predicate: (query) => {
          const queryKey = query.queryKey[0] as string;
          return queryKey.includes("/auth/user");
        }
      });
      
      toast({
        title: "Success",
        description: "User deleted successfully",
      });
      // Navigate back to the list page
      history.back();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete user",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: UserUpdateFormValues) => {
    updateUserMutation.mutate(data as UserUpdateData);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatPermissionScope = (scope?: string) => {
    if (!scope) return "No Permission";
    return scope.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const getPermissionBadgeColor = (scope?: string) => {
    if (!scope) return "bg-gray-100 text-gray-800";
    if (scope.includes('admin') || scope.includes('superuser')) return "bg-red-100 text-red-800";
    if (scope.includes('manager')) return "bg-blue-100 text-blue-800";
    if (scope.includes('accountant')) return "bg-green-100 text-green-800";
    return "bg-gray-100 text-gray-800";
  };

  const handleCopyToClipboard = async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied to clipboard",
        description: `${fieldName} copied successfully.`,
      });
    } catch (error) {
      console.error("Failed to copy:", error);
      toast({
        title: "Copy failed",
        description: "Failed to copy to clipboard. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => history.back()}>
              <ArrowLeft className="h-4 w-4 me-2" />
              Back
            </Button>
          </div>
          <div className="text-center py-12">
            <p className="text-gray-600">Loading user details...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!user) {
    return (
      <AppLayout>
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => history.back()}>
              <ArrowLeft className="h-4 w-4 me-2" />
              Back
            </Button>
          </div>
          <div className="text-center py-12">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">User not found</h3>
            <p className="text-gray-600">The user you're looking for doesn't exist or has been deleted.</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex-1 overflow-auto p-4 lg:p-6">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={() => history.back()}>
                <ArrowLeft className="h-4 w-4 me-2" />
                Back
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {user.first_name} {user.last_name}
                </h1>
                <p className="text-sm text-gray-600 flex items-center gap-1">
                  <UserIcon className="h-3 w-3" />
                  @{user.username}
                </p>
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
                    disabled={updateUserMutation.isPending}
                  >
                    <X className="h-4 w-4 me-2" />
                    Cancel
                  </Button>
                  <Button
                    onClick={form.handleSubmit(onSubmit)}
                    disabled={updateUserMutation.isPending}
                  >
                    <Save className="h-4 w-4 me-2" />
                    {updateUserMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </>
              ) : (
                <>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm">
                        <Trash2 className="h-4 w-4 me-2" />
                        Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete User</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete "{user.first_name} {user.last_name}" (@{user.username})? This action cannot be undone and will permanently remove the user and all associated data.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteUserMutation.mutate()}
                          disabled={deleteUserMutation.isPending}
                          className="bg-red-600 hover:bg-red-700"
                        >
                          {deleteUserMutation.isPending ? "Deleting..." : "Delete User"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  <Button
                    variant="outline"
                    onClick={() => setLocation(`/users/${uuid}/location-history`)}
                  >
                    <History className="h-4 w-4 me-2" />
                    Location History
                  </Button>
                  <Button onClick={() => setIsEditing(true)}>
                    <Edit className="h-4 w-4 me-2" />
                    Edit User
                  </Button>
                </>
              )}
            </div>
          </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* User Information Card */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>User Information</CardTitle>
              </CardHeader>
              <CardContent>
                {isEditing ? (
                  <Form {...form}>
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="username"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Username</FormLabel>
                              <FormControl>
                                <Input placeholder="Enter username" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="permission_scope"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Permission Scope</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value || ""}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select permission scope" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {permissionScopes?.map((scope) => (
                                    <SelectItem key={scope} value={scope}>
                                      {formatPermissionScope(scope)}
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
                          name="first_name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>First Name</FormLabel>
                              <FormControl>
                                <Input placeholder="Enter first name" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="last_name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Last Name</FormLabel>
                              <FormControl>
                                <Input placeholder="Enter last name" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="email"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Email</FormLabel>
                              <FormControl>
                                <Input type="email" placeholder="Enter email" {...field} />
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
                                <Input placeholder="Enter phone number" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="language"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Language</FormLabel>
                              <FormControl>
                                <Input placeholder="Enter language preference" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="password"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>New Password (optional)</FormLabel>
                              <FormControl>
                                <Input type="password" placeholder="Enter new password" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="rfid_token"
                          render={({ field }) => (
                            <FormItem className="md:col-span-2">
                              <FormLabel>RFID Token</FormLabel>
                              <FormControl>
                                <Input placeholder="Enter RFID token" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="track_location"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 md:col-span-2">
                              <div className="space-y-0.5">
                                <FormLabel>Track location</FormLabel>
                                <FormDescription>
                                  Publish this user's live location from the mobile app
                                </FormDescription>
                              </div>
                              <FormControl>
                                <Switch
                                  checked={field.value ?? false}
                                  onCheckedChange={field.onChange}
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="location_ping_seconds"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Live ping cadence (seconds)</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min={1}
                                  max={3600}
                                  placeholder="Enter ping cadence in seconds"
                                  {...field}
                                  value={field.value ?? ""}
                                />
                              </FormControl>
                              <FormDescription>
                                How often the app publishes while tracking
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  </Form>
                ) : (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <UserIcon className="h-4 w-4" />
                          <span>Username</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCopyToClipboard(user.username, "Username")}
                            className="h-5 w-5 p-0 hover:bg-gray-100"
                          >
                            <Copy className="w-3 h-3 text-gray-400" />
                          </Button>
                        </div>
                        <p className="font-medium">@{user.username}</p>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <Shield className="h-4 w-4" />
                          <span>Permission Scope</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCopyToClipboard(user.permission_scope || "None", "Permission Scope")}
                            className="h-5 w-5 p-0 hover:bg-gray-100"
                          >
                            <Copy className="w-3 h-3 text-gray-400" />
                          </Button>
                        </div>
                        <Badge 
                          variant="secondary"
                          className={getPermissionBadgeColor(user.permission_scope)}
                        >
                          {formatPermissionScope(user.permission_scope)}
                        </Badge>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <span>First Name</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCopyToClipboard(user.first_name, "First Name")}
                            className="h-5 w-5 p-0 hover:bg-gray-100"
                          >
                            <Copy className="w-3 h-3 text-gray-400" />
                          </Button>
                        </div>
                        <p className="font-medium">{user.first_name}</p>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <span>Last Name</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCopyToClipboard(user.last_name, "Last Name")}
                            className="h-5 w-5 p-0 hover:bg-gray-100"
                          >
                            <Copy className="w-3 h-3 text-gray-400" />
                          </Button>
                        </div>
                        <p className="font-medium">{user.last_name}</p>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <Mail className="h-4 w-4" />
                          <span>Email</span>
                          {user.email && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCopyToClipboard(user.email!, "Email")}
                              className="h-5 w-5 p-0 hover:bg-gray-100"
                            >
                              <Copy className="w-3 h-3 text-gray-400" />
                            </Button>
                          )}
                        </div>
                        <p className="font-medium">{user.email || "Not provided"}</p>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <Phone className="h-4 w-4" />
                          <span>Phone Number</span>
                          {user.phone_number && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCopyToClipboard(user.phone_number!, "Phone Number")}
                              className="h-5 w-5 p-0 hover:bg-gray-100"
                            >
                              <Copy className="w-3 h-3 text-gray-400" />
                            </Button>
                          )}
                        </div>
                        <p className="font-medium">{user.phone_number || "Not provided"}</p>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <Globe className="h-4 w-4" />
                          <span>Language</span>
                          {user.language && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCopyToClipboard(user.language!, "Language")}
                              className="h-5 w-5 p-0 hover:bg-gray-100"
                            >
                              <Copy className="w-3 h-3 text-gray-400" />
                            </Button>
                          )}
                        </div>
                        <p className="font-medium">{user.language || "Not provided"}</p>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <MapPin className="h-4 w-4" />
                          <span>Track Location</span>
                        </div>
                        <Badge variant={user.track_location ? "default" : "secondary"}>
                          {user.track_location ? "Enabled" : "Disabled"}
                        </Badge>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <Timer className="h-4 w-4" />
                          <span>Live Ping Cadence</span>
                        </div>
                        <p className="font-medium">
                          {user.location_ping_seconds != null
                            ? `${user.location_ping_seconds} seconds`
                            : "Not set"}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* User Stats Card */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Account Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Calendar className="h-4 w-4" />
                    <span>Created</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopyToClipboard(formatDate(user.created_at), "Created Date")}
                      className="h-5 w-5 p-0 hover:bg-gray-100"
                    >
                      <Copy className="w-3 h-3 text-gray-400" />
                    </Button>
                  </div>
                  <p className="font-medium">{formatDate(user.created_at)}</p>
                </div>

                <Separator />

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Key className="h-4 w-4" />
                    <span>User ID</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopyToClipboard(user.uuid, "User ID")}
                      className="h-5 w-5 p-0 hover:bg-gray-100"
                    >
                      <Copy className="w-3 h-3 text-gray-400" />
                    </Button>
                  </div>
                  <p className="font-mono text-xs bg-gray-100 p-2 rounded border">
                    {user.uuid}
                  </p>
                </div>

                <Separator />

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <span>Status</span>
                  </div>
                  <Badge variant={user.is_deleted ? "destructive" : "default"}>
                    {user.is_deleted ? "Deleted" : "Active"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* live + playback location tracking for this user (admins) */}
        <UserLocationMap
          userUuid={user.uuid}
          username={user.username}
          trackLocation={user.track_location}
        />
        </div>
      </div>
    </AppLayout>
  );
}