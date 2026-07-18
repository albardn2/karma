import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trash2, User as UserIcon, Mail, Phone, Calendar, Shield, Globe2 as Globe } from "lucide-react";
import { AddUserDialog } from "@/components/users/AddUserDialog";
import { UserFiltersComponent, type UserFilters } from "@/components/users/UserFilters";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiRequest } from "@/lib/queryClient";
import type { User, UserPage } from "@/lib/types";

export default function Users() {
  const [, setLocation] = useLocation();
  const { t, te } = useLanguage();
  const [filters, setFilters] = useState<UserFilters>({
    page: 1,
    per_page: 12,
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Build API URL with filters
  const buildApiUrl = (baseFilters: UserFilters) => {
    const params = new URLSearchParams();
    Object.entries(baseFilters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.append(key, value.toString());
      }
    });
    return `/auth/users?${params.toString()}`;
  };

  // Fetch users with filters
  const { data: usersData, isLoading, isError, error } = useQuery<UserPage>({
    queryKey: ["/auth/users", filters],
    queryFn: async () => {
      return await apiRequest(buildApiUrl(filters));
    },
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    retry: false,
  });

  // Fetch permission scopes
  const { data: permissionScopes } = useQuery<string[]>({
    queryKey: ["/auth/permissions"],
    queryFn: async () => {
      return await apiRequest("/auth/permissions");
    },
    retry: false,
  });

  // Create isolated display state
  const [displayUsers, setDisplayUsers] = useState<User[]>([]);
  const [displayCount, setDisplayCount] = useState<number>(0);

  // Update display data from fresh API data
  useEffect(() => {
    if (isError) {
      setDisplayUsers([]);
      setDisplayCount(0);
    } else {
      const users = usersData?.users || [];
      setDisplayUsers(users);
      setDisplayCount(users.length);
    }
  }, [usersData, isLoading, isError]);

  // Derived at render so it follows language switches
  const displayText = isError
    ? t("users.unableToLoad")
    : isLoading
      ? t("users.loadingUsers")
      : t("users.usersOnPage", { count: displayUsers.length });

  // Handle filter changes
  const handleFiltersChange = (newFilters: UserFilters) => {
    setFilters({ ...newFilters, page: 1 }); // Reset to first page when filters change
  };

  // Handle clear filters
  const handleClearFilters = () => {
    setFilters({ page: 1, per_page: 12 });
  };

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: async (uuid: string) => {
      return await apiRequest(`/auth/user/${uuid}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: ["/auth/users"],
        exact: false 
      });
      toast({
        title: t("common.success"),
        description: t("users.deletedSuccess"),
      });
    },
    onError: (error: any) => {
      toast({
        title: t("common.error"),
        description: error.message || t("users.deleteFailed"),
        variant: "destructive",
      });
    },
  });

  const handleDeleteUser = (uuid: string, username: string) => {
    if (confirm(t("users.confirmDelete", { username }))) {
      deleteUserMutation.mutate(uuid);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
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

  return (
    <AppLayout>
      <div className="flex-1 overflow-auto p-4 lg:p-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{t("nav.users")}</h2>
          </div>
          <AddUserDialog permissionScopes={permissionScopes || []} />
        </div>

        {/* Status Banner */}
        <div className="mb-6">
          <div className={`rounded-lg px-4 py-3 border ${
            isError 
              ? "bg-gradient-to-r from-red-50 to-orange-50 border-red-200" 
              : "bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-200"
          }`}>
            <div className="flex items-center">
              <div className={`w-3 h-3 rounded-full me-3 ${
                isError ? "bg-red-500" : "bg-indigo-500"
              }`}></div>
              <span className={`text-sm font-medium ${
                isError ? "text-red-900" : "text-indigo-900"
              }`}>
                {displayText}
              </span>
            </div>
          </div>
        </div>

        {/* Filters Row */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
          <div></div> {/* Empty div for spacing */}
          {!isError && (
            <UserFiltersComponent 
              filters={filters} 
              onFiltersChange={handleFiltersChange}
              onClearFilters={handleClearFilters}
            />
          )}
        </div>

        {/* Content Area */}
        {isError ? (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
              <UserIcon className="w-8 h-8 text-red-600" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">{t("users.backendNotAvailable")}</h3>
            <p className="text-gray-600 mb-4">
              {t("users.backendNotConfigured")}
            </p>
            <p className="text-sm text-gray-500">
              {t("users.backendEnableHint")}
            </p>
          </div>
        ) : displayUsers.length === 0 && !isLoading ? (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
              <UserIcon className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">{t("users.noUsersFound")}</h3>
            <p className="text-gray-600">
              {t("users.noUsersMatch")}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {displayUsers.map((user: User) => (
                <Card 
                  key={user.uuid} 
                  className="hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => setLocation(`/users/${user.uuid}`)}
                >
                <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                  <div className="space-y-1 flex-1">
                    <h3 className="font-semibold text-lg leading-none tracking-tight">
                      {user.first_name} {user.last_name}
                    </h3>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <UserIcon className="h-3 w-3" />
                      @{user.username}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteUser(user.uuid, user.username);
                    }}
                    className="h-8 w-8 p-0 text-red-600 hover:text-red-800 hover:bg-red-50"
                    disabled={deleteUserMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Badge 
                    variant="secondary" 
                    className={`${getPermissionBadgeColor(user.permission_scope)} text-xs`}
                  >
                    <Shield className="h-3 w-3 me-1" />
                    {formatPermissionScope(user.permission_scope)}
                  </Badge>
                  
                  {user.email && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Mail className="h-3 w-3" />
                      <span className="truncate">{user.email}</span>
                    </div>
                  )}
                  
                  {user.phone_number && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Phone className="h-3 w-3" />
                      <span>{user.phone_number}</span>
                    </div>
                  )}
                  
                  {user.language && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Globe className="h-3 w-3" />
                      <span>{user.language}</span>
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Calendar className="h-3 w-3" />
                      <span>{t("users.createdDate", { date: formatDate(user.created_at) })}</span>
                    </div>
                    <Badge variant={user.is_deleted ? "destructive" : "default"} className="text-xs">
                      {user.is_deleted ? t("users.deleted") : t("users.active")}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
            </div>
            
            {/* Pagination */}
            {usersData && usersData.pages > 1 && (
              <div className="flex justify-center items-center space-x-4 rtl:space-x-reverse mt-8">
                <Button
                  variant="outline"
                  disabled={filters.page === 1}
                  onClick={() => setFilters((prev: UserFilters) => ({ ...prev, page: (prev.page || 1) - 1 }))}
                >
                  {t("common.previous")}
                </Button>
                <span className="text-sm text-gray-600">
                  {t("common.page")} {filters.page || 1} {t("common.of")} {usersData.pages}
                </span>
                <Button
                  variant="outline"
                  disabled={filters.page === usersData.pages}
                  onClick={() => setFilters((prev: UserFilters) => ({ ...prev, page: (prev.page || 1) + 1 }))}
                >
                  {t("common.next")}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}