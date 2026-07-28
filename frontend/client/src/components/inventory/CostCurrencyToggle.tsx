import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";

export type CostCurrency = "SYP" | "USD";

/** Which currency the backend should report lot costs in. Costs are converted
 * server-side at the exchange rate nearest each event's day, so this changes
 * the numbers, not just the label. */
export function CostCurrencyToggle({
  value,
  onChange,
}: {
  value: CostCurrency;
  onChange: (c: CostCurrency) => void;
}) {
  const { t } = useLanguage();
  return (
    <div
      className="inline-flex rounded-md border overflow-hidden"
      role="group"
      aria-label={t('inventory.costCurrency')}
      data-testid="cost-currency-toggle"
    >
      {(["SYP", "USD"] as const).map((c) => (
        <Button
          key={c}
          type="button"
          size="sm"
          variant={value === c ? "default" : "ghost"}
          className="rounded-none px-3"
          onClick={() => onChange(c)}
          data-testid={`cost-currency-${c}`}
        >
          {c}
        </Button>
      ))}
    </div>
  );
}
