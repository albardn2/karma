import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";

interface VehicleInventory {
  uuid: string;
  material_uuid: string;
  material_name?: string | null;
  unit?: string | null;
  current_quantity?: number | null;
}

/**
 * Current on-hand stock per material for a vehicle. Shares the
 * ["/vehicle-inventory/", vehicleUuid] query prefix with the inventory
 * dialog, so applying an add/adjust/unload refreshes this table live.
 */
export function VehicleInventoryTable({ vehicleUuid }: { vehicleUuid: string }) {
  const { t } = useLanguage();
  const { data, isLoading } = useQuery({
    queryKey: ["/vehicle-inventory/", vehicleUuid, "table"],
    queryFn: async () =>
      apiRequest(`/vehicle-inventory/?vehicle_uuid=${vehicleUuid}&per_page=100`),
  });
  const inventories: VehicleInventory[] = data?.vehicle_inventories || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("vehicles.currentInventory")}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-gray-500 py-6 text-center">{t("common.loading")}</div>
        ) : inventories.length === 0 ? (
          <div className="text-sm text-gray-500 py-6 text-center">
            {t("vehicles.noInventory")}
          </div>
        ) : (
          <Table data-testid="table-vehicle-inventory">
            <TableHeader>
              <TableRow>
                <TableHead>{t("vehicles.material")}</TableHead>
                <TableHead className="text-end">{t("vehicles.onHand")}</TableHead>
                <TableHead>{t("vehicles.unit")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inventories.map((inv) => (
                <TableRow key={inv.uuid} data-testid={`row-vinv-${inv.uuid}`}>
                  <TableCell className="font-medium">
                    {inv.material_name || inv.material_uuid}
                  </TableCell>
                  <TableCell
                    className="text-end font-semibold tabular-nums"
                    data-testid={`text-vinv-qty-${inv.uuid}`}
                  >
                    {inv.current_quantity ?? 0}
                  </TableCell>
                  <TableCell className="text-gray-500">{inv.unit || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
