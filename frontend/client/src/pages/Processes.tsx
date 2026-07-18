import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Plus, ChevronLeft, ChevronRight, Factory, Package, ArrowRight } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProcessFilters } from "@/components/processes/ProcessFilters";
import { ProcessPage, ProcessType } from "@/types/process";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";

export default function Processes() {
  const { t, te } = useLanguage();
  const [filters, setFilters] = useState({
    uuid: "",
    type: undefined as ProcessType | undefined,
    start_date: "",
    end_date: "",
    created_by_uuid: "",
    per_page: 20,
  });
  const [page, setPage] = useState(1);

  const buildQueryParams = () => {
    const params = new URLSearchParams();
    if (filters.uuid) params.append("uuid", filters.uuid);
    if (filters.type) params.append("type", filters.type);
    if (filters.start_date) params.append("start_date", filters.start_date);
    if (filters.end_date) params.append("end_date", filters.end_date);
    if (filters.created_by_uuid) params.append("created_by_uuid", filters.created_by_uuid);
    params.append("page", page.toString());
    params.append("per_page", filters.per_page.toString());
    return params.toString();
  };

  const { data: processesPage, isLoading, error } = useQuery<ProcessPage>({
    queryKey: ["/process/", filters, page],
    queryFn: async () => {
      const queryParams = buildQueryParams();
      const url = `/process/${queryParams ? '?' + queryParams : ''}`;
      return await apiRequest(url);
    },
  });

  const handleFiltersChange = (newFilters: typeof filters) => {
    setFilters(newFilters);
    setPage(1);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getProcessTypeColor = (type: ProcessType) => {
    const colors = {
      [ProcessType.COATED_PEANUT_BATCH]: "bg-blue-100 text-blue-800",
      [ProcessType.FLOUR_STARCH_POWDER_PREPARATION]: "bg-green-100 text-green-800",
      [ProcessType.WATER_DIXTRIN_SOLUTION_PREPARATION]: "bg-purple-100 text-purple-800",
      [ProcessType.RAW_PEANUT_FILTER]: "bg-orange-100 text-orange-800",
      [ProcessType.PALM_OIL_PREPARATION]: "bg-yellow-100 text-yellow-800",
      [ProcessType.FRYER_FUEL_PREPARATION]: "bg-red-100 text-red-800",
      [ProcessType.SPICES_PREPARATION]: "bg-pink-100 text-pink-800",
    };
    return colors[type] || "bg-gray-100 text-gray-800";
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="container mx-auto px-4 py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-16 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout>
        <div className="container mx-auto px-4 py-8">
          <div className="text-center py-8">
            <p className="text-red-600">{t('processes.errorLoading', { message: error.message })}</p>
            <Button
              onClick={() => window.location.reload()}
              className="mt-4"
            >
              {t('common.retry')}
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
              <Factory className="h-8 w-8" />
              {t('nav.processes')}
            </h1>
            <p className="text-gray-600 mt-1">
              {t('processes.found', { count: processesPage?.total_count || 0 })}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <ProcessFilters 
              filters={filters} 
              onFiltersChange={handleFiltersChange}
            />
            <Link href="/processes/create">
              <Button className="bg-purple-600 hover:bg-purple-700">
                <Plus className="h-4 w-4 me-2" />
                {t('processes.create')}
              </Button>
            </Link>
          </div>
        </div>

        {/* Process Table */}
        <Card>
          <CardHeader>
            <CardTitle>{t('processes.list')}</CardTitle>
          </CardHeader>
          <CardContent>
            {!processesPage?.items?.length ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-purple-100 to-purple-200 rounded-full flex items-center justify-center">
                  <Factory className="h-8 w-8 text-purple-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {t('processes.emptyTitle')}
                </h3>
                <p className="text-gray-500 mb-4">
                  {t('processes.emptyDescription')}
                </p>
                <Link href="/processes/create">
                  <Button className="bg-purple-600 hover:bg-purple-700">
                    <Plus className="h-4 w-4 me-2" />
                    {t('processes.create')}
                  </Button>
                </Link>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('common.type')}</TableHead>
                      <TableHead>{t('processes.inputs')}</TableHead>
                      <TableHead>{t('processes.outputs')}</TableHead>
                      <TableHead>{t('processes.created')}</TableHead>
                      <TableHead>{t('processes.uuid')}</TableHead>
                      <TableHead>{t('common.notes')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {processesPage.items.map((process) => (
                      <TableRow 
                        key={process.uuid} 
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => window.location.href = `/processes/${process.uuid}`}
                      >
                        <TableCell>
                          <Badge className={getProcessTypeColor(process.type)}>
                            {te(process.type)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Package className="h-4 w-4 text-gray-500" />
                            <span className="font-medium">{process.data.inputs.length}</span>
                            <span className="text-sm text-gray-500">{t('processes.materialsLabel')}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <ArrowRight className="h-4 w-4 text-gray-500" />
                            <span className="font-medium">{process.data.outputs.length}</span>
                            <span className="text-sm text-gray-500">{t('processes.productsLabel')}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {formatDate(process.created_at)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-mono text-sm text-gray-600">
                            {process.uuid.slice(0, 8)}...
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm text-gray-600 truncate max-w-[200px]">
                            {process.notes || t('processes.noNotes')}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Pagination */}
                <div className="flex items-center justify-between mt-6">
                  <div className="text-sm text-gray-500">
                    {t('processes.showingRange', {
                      from: ((processesPage.page - 1) * processesPage.per_page) + 1,
                      to: Math.min(processesPage.page * processesPage.per_page, processesPage.total_count),
                      total: processesPage.total_count,
                    })}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setPage(Math.max(1, page - 1))}
                      disabled={page === 1}
                    >
                      <ChevronLeft className="h-4 w-4 me-1" />
                      {t('common.previous')}
                    </Button>
                    <span className="text-sm text-gray-500">
                      {t('common.page')} {processesPage.page} {t('common.of')} {processesPage.pages}
                    </span>
                    <Button
                      variant="outline"
                      onClick={() => setPage(Math.min(processesPage.pages, page + 1))}
                      disabled={page === processesPage.pages}
                    >
                      {t('common.next')}
                      <ChevronRight className="h-4 w-4 ms-1" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}