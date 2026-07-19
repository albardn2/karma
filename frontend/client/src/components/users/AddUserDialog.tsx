import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { PermissionsEditor } from "@/components/users/PermissionsEditor";
import { PermissionScope, type UserFormData, type UserPermissions } from "@/lib/types";
import { LANGUAGE_LABELS } from "@/i18n";

const makeUserSchema = (t: (key: string) => string) =>
  z.object({
    username: z.string().min(3, t("users.usernameMin")).refine(val => !val.includes('@'), t("users.usernameNotEmail")),
    first_name: z.string().min(1, t("users.firstNameRequired")),
    last_name: z.string().min(1, t("users.lastNameRequired")),
    password: z.string().min(6, t("users.passwordMin")),
    email: z.string().email(t("users.invalidEmail")).optional().or(z.literal("")),
    phone_number: z.string().optional(),
    language: z.string().optional(),
    permission_scope: z.string().optional(),
    rfid_token: z.string().optional(),
  });

type UserFormValues = z.infer<ReturnType<typeof makeUserSchema>>;

interface AddUserDialogProps {
  permissionScopes: string[];
}

export function AddUserDialog({ permissionScopes }: AddUserDialogProps) {
  const [open, setOpen] = useState(false);
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const [permissions, setPermissions] = useState<UserPermissions>({ modules: [], endpoints: {} });

  // role presets: picking a role is a shortcut that fills the checklist
  const { data: catalog } = useQuery<any>({
    queryKey: ["/auth/permission-catalog"],
    queryFn: () => apiRequest("/auth/permission-catalog"),
  });
  const applyRolePreset = (scope: string) => {
    const preset = catalog?.role_presets?.[scope];
    if (preset) {
      setPermissions({
        modules: [...(preset.modules ?? [])],
        endpoints: Object.fromEntries(
          Object.entries(preset.endpoints ?? {}).map(([k, v]) => [k, [...(v as string[])]])
        ),
      });
      setPermissionsOpen(true);
    }
  };
  const { toast } = useToast();
  const { t, te } = useLanguage();

  const userSchema = useMemo(() => makeUserSchema(t), [t]);

  const form = useForm<UserFormValues>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      username: "",
      first_name: "",
      last_name: "",
      password: "",
      email: "",
      phone_number: "",
      language: "",
      permission_scope: PermissionScope.OPERATOR,
      rfid_token: "",
    },
  });

  const createUserMutation = useMutation({
    mutationFn: async (data: UserFormData) => {
      // Clean up empty fields before sending
      const cleanData = Object.fromEntries(
        Object.entries(data).filter(([_, value]) => value !== "" && value !== undefined)
      );
      
      const response = await apiRequest("/auth/register", { method: "POST", body: cleanData });
      return response;
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
        description: t("users.createdSuccess"),
      });
      setOpen(false);
      form.reset();
      setPermissions({ modules: [], endpoints: {} });
      setPermissionsOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: t("common.error"),
        description: error.message || t("users.createFailed"),
        variant: "destructive",
      });
    },
  });

  // fine-grained permissions are only valid for non-admin scopes
  const { user: currentUser } = useAuth();
  const callerIsSuperuser = (
    (currentUser as any)?.permission_scope ?? ""
  ).includes("superuser");
  const assignableScopes = Object.values(PermissionScope).filter(
    (scope) => scope !== PermissionScope.SUPER_ADMIN || callerIsSuperuser
  );

  const selectedScope = form.watch("permission_scope") ?? "";
  const isAdminScope = selectedScope.includes("admin") || selectedScope.includes("superuser");

  const onSubmit = (data: UserFormValues) => {
    const payload = { ...(data as UserFormData) };
    const hasSelection =
      permissions.modules.length > 0 ||
      Object.values(permissions.endpoints).some((actions) => actions.length > 0);
    if (!isAdminScope && hasSelection) {
      payload.permissions = permissions;
    }
    createUserMutation.mutate(payload);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          {t("users.addUser")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("users.addNewUser")}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("common.username")} *</FormLabel>
                    <FormControl>
                      <Input placeholder={t("users.enterUsername")} {...field} />
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
                    <FormLabel>{t("common.password")} *</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder={t("users.enterPassword")} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="first_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("users.firstName")} *</FormLabel>
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
                    <FormLabel>{t("users.lastName")} *</FormLabel>
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
                name="permission_scope"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("users.permissionScope")}</FormLabel>
                    <Select
                      onValueChange={(v) => {
                        field.onChange(v);
                        applyRolePreset(v);
                      }}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t("users.selectPermissionScope")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {assignableScopes.map((scope) => (
                          <SelectItem key={scope} value={scope}>
                            {te(scope)}
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
                name="language"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("common.language")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl>
                        <SelectTrigger data-testid="user-language">
                          <SelectValue placeholder={t("users.selectLanguage")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(LANGUAGE_LABELS).map(([code, label]) => (
                          <SelectItem key={code} value={code}>
                            {label}
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
                name="rfid_token"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>{t("users.rfidToken")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("users.enterRfidTokenOptional")} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {!isAdminScope && (
              <Collapsible open={permissionsOpen} onOpenChange={setPermissionsOpen}>
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-between"
                  >
                    <span>{t("users.finePermissions")}</span>
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${permissionsOpen ? "rotate-180" : ""}`}
                    />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3">
                  <PermissionsEditor value={permissions} onChange={setPermissions} />
                </CollapsibleContent>
              </Collapsible>
            )}

            <div className="flex justify-end space-x-2 rtl:space-x-reverse pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={createUserMutation.isPending}
              >
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={createUserMutation.isPending}>
                {createUserMutation.isPending ? t("common.creating") : t("users.createUser")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}