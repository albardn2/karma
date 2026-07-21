import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ChevronLeft, ChevronRight, ClipboardList, MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";

const PER_PAGE = 5;

interface OrdersResponse {
  orders: any[];
  total_count: number;
  page: number;
  pages: number;
}
interface StopsResponse {
  items: any[];
  total_count: number;
  page: number;
  pages: number;
}

function fmtDate(v?: string) {
  return v ? new Date(v).toLocaleDateString() : "—";
}

function Pager({
  page,
  pages,
  total,
  onPrev,
  onNext,
  testPrefix,
  t,
}: {
  page: number;
  pages: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  testPrefix: string;
  t: (k: string, v?: Record<string, string | number>) => string;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
      <p className="text-xs text-gray-500">
        {t("customers.tablePageOf", { page, pages: Math.max(pages, 1), total })}
      </p>
      <div className="flex gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={onPrev}
          disabled={page <= 1}
          data-testid={`${testPrefix}-prev`}
        >
          <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onNext}
          disabled={page >= pages}
          data-testid={`${testPrefix}-next`}
        >
          <ChevronRight className="h-4 w-4 rtl:rotate-180" />
        </Button>
      </div>
    </div>
  );
}

export function CustomerActivity({ customerUuid }: { customerUuid: string }) {
  const { t, te } = useLanguage();
  const [ordersPage, setOrdersPage] = useState(1);
  const [stopsPage, setStopsPage] = useState(1);

  const { data: orders } = useQuery<OrdersResponse>({
    queryKey: ["/customer-order/", customerUuid, "orders", ordersPage],
    queryFn: () =>
      apiRequest(
        `/customer-order/?customer_uuid=${customerUuid}&page=${ordersPage}&per_page=${PER_PAGE}`
      ),
  });

  const { data: stops } = useQuery<StopsResponse>({
    queryKey: ["/trip-stop/", customerUuid, "stops", stopsPage],
    queryFn: () =>
      apiRequest(
        `/trip-stop/?customer_uuid=${customerUuid}&page=${stopsPage}&per_page=${PER_PAGE}`
      ),
  });

  return (
    <div className="mt-8 space-y-8">
      {/* Orders */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <ClipboardList className="w-5 h-5 me-2" />
          {t("customers.ordersSection")}
        </h3>
        <Card>
          <CardContent className="p-0">
            <Table data-testid="customer-orders-table">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("common.date")}</TableHead>
                  <TableHead>{t("common.total")}</TableHead>
                  <TableHead>{t("customers.payment")}</TableHead>
                  <TableHead>{t("customers.fulfillment")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!orders ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-gray-400 py-6">
                      {t("common.loading")}
                    </TableCell>
                  </TableRow>
                ) : orders.orders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-gray-400 py-6">
                      {t("customers.noOrders")}
                    </TableCell>
                  </TableRow>
                ) : (
                  orders.orders.map((o) => (
                    <TableRow key={o.uuid} className="hover:bg-gray-50">
                      <TableCell>
                        <Link
                          href={`/customer-orders/${o.uuid}`}
                          className="text-[hsl(245,58%,57%)] hover:underline"
                        >
                          {fmtDate(o.created_at)}
                        </Link>
                      </TableCell>
                      <TableCell className="font-medium">
                        {(o.total_amount ?? o.total_adjusted_amount ?? 0).toLocaleString()}{" "}
                        <span className="text-xs text-gray-500">{te(o.currency)}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={o.is_paid ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}>
                          {o.is_paid ? te("paid") : te("unpaid")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={o.is_fulfilled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}>
                          {o.is_fulfilled ? te("fulfilled") : te("pending")}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            {orders && orders.total_count > 0 && (
              <Pager
                page={orders.page}
                pages={orders.pages}
                total={orders.total_count}
                onPrev={() => setOrdersPage((p) => Math.max(1, p - 1))}
                onNext={() => setOrdersPage((p) => p + 1)}
                testPrefix="customer-orders"
                t={t}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Trip stops */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <MapPin className="w-5 h-5 me-2" />
          {t("customers.tripStopsSection")}
        </h3>
        <Card>
          <CardContent className="p-0">
            <Table data-testid="customer-tripstops-table">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("common.date")}</TableHead>
                  <TableHead>{t("customers.assignedUser")}</TableHead>
                  <TableHead>{t("customers.result")}</TableHead>
                  <TableHead>{t("customers.comments")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!stops ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-gray-400 py-6">
                      {t("common.loading")}
                    </TableCell>
                  </TableRow>
                ) : stops.items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-gray-400 py-6">
                      {t("customers.noTripStops")}
                    </TableCell>
                  </TableRow>
                ) : (
                  stops.items.map((s) => (
                    <TableRow key={s.uuid} className="hover:bg-gray-50">
                      <TableCell>{fmtDate(s.created_at)}</TableCell>
                      <TableCell>{s.assigned_username || "—"}</TableCell>
                      <TableCell>{s.outcome ? te(s.outcome) : "—"}</TableCell>
                      <TableCell className="max-w-xs truncate text-gray-600">
                        {s.notes || "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            {stops && stops.total_count > 0 && (
              <Pager
                page={stops.page}
                pages={stops.pages}
                total={stops.total_count}
                onPrev={() => setStopsPage((p) => Math.max(1, p - 1))}
                onNext={() => setStopsPage((p) => p + 1)}
                testPrefix="customer-tripstops"
                t={t}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
