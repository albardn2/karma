import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Control, FieldPath, FieldValues } from "react-hook-form";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";

interface MaterialSelectorProps<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
  materials?: any[];
}

export function MaterialSelector<T extends FieldValues>({ 
  control, 
  name, 
  materials: externalMaterials 
}: MaterialSelectorProps<T>) {
  const { t } = useLanguage();
  const [materialOpen, setMaterialOpen] = useState(false);
  const [materialSearch, setMaterialSearch] = useState("");
  const [materialValue, setMaterialValue] = useState("");
  const [useManualMaterialUuid, setUseManualMaterialUuid] = useState(false);

  // Fetch materials with search if not provided externally
  const { data: materialsData } = useQuery({
    queryKey: ["/material", materialSearch],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: "1",
        per_page: "10",
      });
      
      if (materialSearch) {
        params.append("name", materialSearch);
      }

      return apiRequest(`/material?${params.toString()}`);
    },
    enabled: !externalMaterials && !useManualMaterialUuid,
  });

  const materials = externalMaterials || materialsData?.items || [];

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{t('purchaseOrders.material')}</FormLabel>
          <div className="flex gap-2 mb-2">
            <Button
              type="button"
              variant={!useManualMaterialUuid ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setUseManualMaterialUuid(false);
                setMaterialOpen(false);
                setMaterialValue("");
                field.onChange("");
              }}
            >
              {t('purchaseOrders.selectMaterial')}
            </Button>
            <Button
              type="button"
              variant={useManualMaterialUuid ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setUseManualMaterialUuid(true);
                setMaterialOpen(false);
                setMaterialValue("");
                field.onChange("");
              }}
            >
              {t('purchaseOrders.enterUuidManually')}
            </Button>
          </div>
          <FormControl>
            {useManualMaterialUuid ? (
              <Input
                placeholder={t('purchaseOrders.enterMaterialUuid')}
                value={field.value}
                onChange={(e) => {
                  field.onChange(e.target.value);
                  setMaterialValue(e.target.value);
                }}
              />
            ) : (
              <div className="relative">
                <Button
                  variant="outline"
                  type="button"
                  className="w-full justify-between"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setMaterialOpen(!materialOpen);
                  }}
                >
                  {materialValue
                    ? materials?.find((material: any) => material.uuid === materialValue)?.name || t('purchaseOrders.materialNotFound')
                    : t('purchaseOrders.selectMaterialEllipsis')}
                  <ChevronsUpDown className="ms-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
                {materialOpen && (
                  <div className="absolute top-full z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg">
                    <div className="p-2">
                      <Input
                        placeholder={t('purchaseOrders.searchMaterials')}
                        value={materialSearch}
                        onChange={(e) => setMaterialSearch(e.target.value)}
                        className="mb-2"
                      />
                      <div className="max-h-40 overflow-y-auto">
                        {materials && materials.length > 0 ? (
                          materials.map((material: any) => (
                            <div
                              key={material.uuid}
                              className="flex items-center space-x-2 rtl:space-x-reverse p-2 hover:bg-gray-100 cursor-pointer"
                              onClick={() => {
                                setMaterialValue(material.uuid);
                                field.onChange(material.uuid);
                                setMaterialOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "me-2 h-4 w-4",
                                  materialValue === material.uuid ? "opacity-100" : "opacity-0"
                                )}
                              />
                              {material.name} {material.sku ? `(${material.sku})` : ''}
                            </div>
                          ))
                        ) : (
                          <div className="px-3 py-2 text-gray-500">{t('purchaseOrders.noMaterialsFound')}</div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}