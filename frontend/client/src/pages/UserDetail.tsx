import { useState, useEffect, useMemo } from "react";
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
import { useLanguage } from "@/contexts/LanguageContext";
import { UserLocationMap } from "@/components/location/UserLocationMap";
import { PermissionsEditor } from "@/components/users/PermissionsEditor";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { User, UserUpdateData, PermissionScope, UserPermissions } from "@/lib/types";

const makeUserUpdateSchema = (t: (key: string) => string) =>
  z.object({
    username: z.string().min(3, t("users.usernameMin")).optional(),
    first_name: z.string().min(1, t("users.firstNameRequired")).optional(),
    last_name: z.string().min(1, t("users.lastNameRequired")).optional(),
    email: z.string().email(t("users.invalidEmail")).optional().or(z.literal("")),
    phone_number: z.string().optional(),
    language: z.string().optional(),
    password: z.string().min(6, t("users.passwordMin")).optional().or(z.literal("")),
    permission_scope: z.string().optional(),
    rfid_token: z.string().optional(),
    track_location: z.boolean().optional(),
    location_ping_seconds: z.preprocess(
      (val) => (val === "" || val === null || val === undefined ? undefined : Number(val)),
      z
        .number({ invalid_type_error: t("users.mustBeNumber") })
        .int(t("users.mustBeWholeNumber"))
        .min(1, t("users.pingMinSeconds"))
        .max(3600, t("users.pingMaxSeconds"))
        .optional()
    ),
  });

type UserUpdateFormValues = z.infer<ReturnType<typeof makeUserUpdateSchema>>;

export default function UserDetail() {
  const [, params] = useRoute("/users/:uuid");
  const uuid = params?.uuid;
  const [, setLocation] = useLocation();
  const [isEditing, setIsEditing] = useState(false);
  const [useFinePermissions, setUseFinePermissions] = useState(false);
  const [finePermissions, setFinePermissions] = useState<UserPermissions>({ modules: [], endpoints: {} });
  const { toast } = useToast();
  const { t, te } = useLanguage();

  const userUpdateSchema = useMemo(() => makeUserUpdateSchema(t), [t]);

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
      setUseFinePermissions(!!user.permissions);
      setFinePermissions(
        user.permissions
          ? {
              modules: user.permissions.modules ?? [],
              endpoints: user.permissions.endpoints ?? {},
            }
          : { modules: [], endpoints: {} }
      );
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
        title: t("common.success"),
        description: t("users.updatedSuccess"),
      });
      setIsEditing(false);
    },
    onError: (error: any) => {
      toast({
        title: t("common.error"),
        description: error.message || t("users.updateFailed"),
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
        title: t("common.success"),
        description: t("users.deletedSuccess"),
      });
      // Navigate back to the list page
      history.back();
    },
    onError: (error: any) => {
      toast({
        title: t("common.error"),
        description: error.message || t("users.deleteFailed"),
        variant: "destructive",
      });
    },
  });

  // fine-grained permissions are only valid for non-admin scopes
  const selectedScope = form.watch("permission_scope") || "";
  const isAdminScope =
    selectedScope.includes("admin") || selectedScope.includes("superuser");

  const onSubmit = (data: UserUpdateFormValues) => {
    const payload = { ...(data as UserUpdateData) };
    if (!isAdminScope) {
      if (useFinePermissions) {
        payload.permissions = finePermissions;
      } else if (user?.permissions) {
        // toggled off for a user that had permissions: clear back to role behavior
        payload.permissions = null;
      }
    }
    updateUserMutation.mutate(payload);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatPermissionScope = (scope?: string) => {
    if (!scope) return t("users.noPermission");
    return te(scope);
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
        title: t("users.copiedTitle"),
        description: t("users.copiedDesc", { field: fieldName }),
      });
    } catch (error) {
      console.error("Failed to copy:", error);
      toast({
        title: t("users.copyFailedTitle"),
        description: t("users.copyFailedDesc"),
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
              {t("common.back")}
            </Button>
          </div>
          <div className="text-center py-12">
            <p className="text-gray-600">{t("users.loadingUserDetails")}</p>
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
              {t("common.back")}
            </Button>
          </div>
          <div className="text-center py-12">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{t("users.userNotFound")}</h3>
            <p className="text-gray-600">{t("users.userNotFoundDesc")}</p>
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
                {t("common.back")}
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
                    {t("common.cancel")}
                  </Button>
                  <Button
                    onClick={form.handleSubmit(onSubmit)}
                    disabled={updateUserMutation.isPending}
                  >
                    <Save className="h-4 w-4 me-2" />
                    {updateUserMutation.isPending ? t("common.saving") : t("users.saveChanges")}
                  </Button>
                </>
              ) : (
                <>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm">
                        <Trash2 className="h-4 w-4 me-2" />
                        {t("common.delete")}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t("users.deleteUser")}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {t("users.deleteConfirmDesc", {
                            name: `${user.first_name} ${user.last_name}`,
                            username: user.username,
                          })}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteUserMutation.mutate()}
                          disabled={deleteUserMutation.isPending}
                          className="bg-red-600 hover:bg-red-700"
                        >
                          {deleteUserMutation.isPending ? t("common.deleting") : t("users.deleteUser")}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  <Button
                    variant="outline"
                    onClick={() => setLocation(`/users/${uuid}/location-history`)}
                  >
                    <History className="h-4 w-4 me-2" />
                    {t("users.locationHistory")}
                  </Button>
                  <Button onClick={() => setIsEditing(true)}>
                    <Edit className="h-4 w-4 me-2" />
                    {t("users.editUser")}
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
                <CardTitle>{t("users.userInformation")}</CardTitle>
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
                              <FormLabel>{t("common.username")}</FormLabel>
                              <FormControl>
                                <Input placeholder={t("users.enterUsername")} {...field} />
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
                              <FormLabel>{t("users.permissionScope")}</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value || ""}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder={t("users.selectPermissionScope")} />
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
                              <FormLabel>{t("users.firstName")}</FormLabel>
                              <FormControl>
                                <Input placeholder={t("users.enterFirstName")} {...field} />
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
                              <FormLabel>{t("users.lastName")}</FormLabel>
                              <FormControl>
                                <Input placeholder={t("users.enterLastName")} {...field} />
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
                              <FormLabel>{t("common.email")}</FormLabel>
                              <FormControl>
                                <Input type="email" placeholder={t("users.enterEmail")} {...field} />
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
                              <FormLabel>{t("users.phoneNumber")}</FormLabel>
                              <FormControl>
                                <Input placeholder={t("users.enterPhoneNumber")} {...field} />
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
                              <FormLabel>{t("common.language")}</FormLabel>
                              <FormControl>
                                <Input placeholder={t("users.enterLanguage")} {...field} />
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
                              <FormLabel>{t("users.newPasswordOptional")}</FormLabel>
                              <FormControl>
                                <Input type="password" placeholder={t("users.enterNewPassword")} {...field} />
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
                              <FormLabel>{t("users.rfidToken")}</FormLabel>
                              <FormControl>
                                <Input placeholder={t("users.enterRfidToken")} {...field} />
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
                                <FormLabel>{t("users.trackLocation")}</FormLabel>
                                <FormDescription>
                                  {t("users.trackLocationDesc")}
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
                              <FormLabel>{t("users.pingCadenceLabel")}</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min={1}
                                  max={3600}
                                  placeholder={t("users.enterPingCadence")}
                                  {...field}
                                  value={field.value ?? ""}
                                />
                              </FormControl>
                              <FormDescription>
                                {t("users.pingCadenceDesc")}
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        {!isAdminScope && (
                          <div className="rounded-lg border p-3 md:col-span-2 space-y-3">
                            <div className="flex flex-row items-center justify-between gap-2">
                              <div className="space-y-0.5">
                                <p className="text-sm font-medium">
                                  {t("users.useFinePermissions")}
                                </p>
                                <p className="text-sm text-gray-500">
                                  {t("users.useFinePermissionsDesc")}
                                </p>
                              </div>
                              <Switch
                                checked={useFinePermissions}
                                onCheckedChange={setUseFinePermissions}
                                data-testid="perm-use-fine"
                              />
                            </div>
                            {useFinePermissions && (
                              <PermissionsEditor
                                value={finePermissions}
                                onChange={setFinePermissions}
                              />
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </Form>
                ) : (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <UserIcon className="h-4 w-4" />
                          <span>{t("common.username")}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCopyToClipboard(user.username, t("common.username"))}
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
                          <span>{t("users.permissionScope")}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCopyToClipboard(user.permission_scope || "None", t("users.permissionScope"))}
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
                          <span>{t("users.firstName")}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCopyToClipboard(user.first_name, t("users.firstName"))}
                            className="h-5 w-5 p-0 hover:bg-gray-100"
                          >
                            <Copy className="w-3 h-3 text-gray-400" />
                          </Button>
                        </div>
                        <p className="font-medium">{user.first_name}</p>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <span>{t("users.lastName")}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCopyToClipboard(user.last_name, t("users.lastName"))}
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
                          <span>{t("common.email")}</span>
                          {user.email && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCopyToClipboard(user.email!, t("common.email"))}
                              className="h-5 w-5 p-0 hover:bg-gray-100"
                            >
                              <Copy className="w-3 h-3 text-gray-400" />
                            </Button>
                          )}
                        </div>
                        <p className="font-medium">{user.email || t("users.notProvided")}</p>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <Phone className="h-4 w-4" />
                          <span>{t("users.phoneNumber")}</span>
                          {user.phone_number && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCopyToClipboard(user.phone_number!, t("users.phoneNumber"))}
                              className="h-5 w-5 p-0 hover:bg-gray-100"
                            >
                              <Copy className="w-3 h-3 text-gray-400" />
                            </Button>
                          )}
                        </div>
                        <p className="font-medium">{user.phone_number || t("users.notProvided")}</p>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <Globe className="h-4 w-4" />
                          <span>{t("common.language")}</span>
                          {user.language && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCopyToClipboard(user.language!, t("common.language"))}
                              className="h-5 w-5 p-0 hover:bg-gray-100"
                            >
                              <Copy className="w-3 h-3 text-gray-400" />
                            </Button>
                          )}
                        </div>
                        <p className="font-medium">{user.language || t("users.notProvided")}</p>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <MapPin className="h-4 w-4" />
                          <span>{t("users.trackLocation")}</span>
                        </div>
                        <Badge variant={user.track_location ? "default" : "secondary"}>
                          {user.track_location ? t("users.enabled") : t("users.disabled")}
                        </Badge>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <Timer className="h-4 w-4" />
                          <span>{t("users.pingCadence")}</span>
                        </div>
                        <p className="font-medium">
                          {user.location_ping_seconds != null
                            ? t("users.seconds", { count: user.location_ping_seconds })
                            : t("users.notSet")}
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
                <CardTitle>{t("users.accountDetails")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Calendar className="h-4 w-4" />
                    <span>{t("users.created")}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopyToClipboard(formatDate(user.created_at), t("users.created"))}
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
                    <span>{t("users.userId")}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopyToClipboard(user.uuid, t("users.userId"))}
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
                    <span>{t("common.status")}</span>
                  </div>
                  <Badge variant={user.is_deleted ? "destructive" : "default"}>
                    {user.is_deleted ? t("users.deleted") : t("users.active")}
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