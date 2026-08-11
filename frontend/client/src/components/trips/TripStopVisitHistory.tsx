import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, History } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";

const PER_PAGE = 5;

interface HistoryResponse {
  items: { uuid: string; date: string; outcome: string; notes?: string | null }[];
  total_count: number;
  page: number;
  pages: number;
}

// backend datetimes are UTC-naive; without the Z a browser parses them as
// local time and every visit shifts by the viewer's offset
function fmtDateTime(v?: string) {
  if (!v) return "—";
  const d = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(v) ? v : v + "Z");
  return isNaN(d.getTime())
    ? v
    : d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * How earlier visits to this customer ended — outcome + notes, newest first,
 * five per page. Backed by /trip-stop/customer-history, which orders by when
 * the result was recorded (not stop creation) and only counts stops that have
 * one; the stop being worked on is excluded since its form is on screen.
 */
export function TripStopVisitHistory({
  customerUuid,
  excludeTripStopUuid,
}: {
  customerUuid: string;
  excludeTripStopUuid?: string;
}) {
  const { t, te } = useLanguage();
  const [page, setPage] = useState(1);

  const { data } = useQuery<HistoryResponse>({
    queryKey: ["/trip-stop/customer-history", customerUuid, excludeTripStopUuid, page],
    queryFn: () =>
      apiRequest(
        `/trip-stop/customer-history?customer_uuid=${customerUuid}&page=${page}&per_page=${PER_PAGE}` +
          (excludeTripStopUuid ? `&exclude_uuid=${excludeTripStopUuid}` : "")
      ),
  });

  // the dataset can shrink between fetches (a trip soft-deleted elsewhere);
  // a page past the new end returns zero rows — snap to the last real page
  useEffect(() => {
    if (!data) return;
    if (data.pages > 0 && page > data.pages) setPage(data.pages);
    else if (data.total_count === 0 && page !== 1) setPage(1);
  }, [data, page]);

  // nothing recorded yet: stay out of the way rather than render an empty shell
  if (!data || data.total_count === 0) return null;

  return (
    <div className="mt-8">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center">
        <History className="w-5 h-5 me-2" />
        {t("workflows.previousVisits")}
      </h3>
      <Card>
        <CardContent className="p-0">
          <Table data-testid="visit-history-table">
            <TableHeader>
              <TableRow>
                <TableHead>{t("common.date")}</TableHead>
                <TableHead>{t("customers.result")}</TableHead>
                <TableHead>{t("customers.comments")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((h) => (
                <TableRow key={h.uuid} data-testid={`visit-history-row-${h.uuid}`}>
                  <TableCell className="whitespace-nowrap">{fmtDateTime(h.date)}</TableCell>
                  <TableCell>{te(h.outcome)}</TableCell>
                  <TableCell className="max-w-xs truncate text-gray-600">{h.notes || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {data.pages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
              <p className="text-xs text-gray-500">
                {t("customers.tablePageOf", { page: data.page, pages: data.pages, total: data.total_count })}
              </p>
              <div className="flex gap-1">
                {/* step from the server's page so a failed fetch retries the
                    missing page instead of skipping past it */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(Math.max(1, data.page - 1))}
                  disabled={data.page <= 1}
                  data-testid="visit-history-prev"
                >
                  <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(Math.min(data.pages, data.page + 1))}
                  disabled={data.page >= data.pages}
                  data-testid="visit-history-next"
                >
                  <ChevronRight className="h-4 w-4 rtl:rotate-180" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
