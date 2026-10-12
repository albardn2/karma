import { useLanguage } from "@/contexts/LanguageContext";

/** One currency's figures for the expected-cash statement. */
export interface CashFigures {
  /** cash for orders sold or delivered on the trip(s) */
  revenue: number;
  /** cash for older orders, delivered before the trip that collected it */
  debt: number;
  /** expenses actually paid out of the trip cash */
  spend: number;
  /** expenses booked but not paid: listed, never deducted */
  unpaid: number;
  /** revenue + debt - spend, as the server computed it */
  net: number;
}

/**
 * Expected cash, read top to bottom like a statement: trip revenue, plus debt
 * collected, less what was spent out of the cash, giving what should come
 * back. One column per currency; currencies are never added together.
 *
 * Shared by the trip page and the multi-trip summary, so a summary's lines can
 * be checked against the trips they came from line for line.
 */
export function CashStatement({
  currencies,
  figures,
  testId,
  manyTrips = false,
}: {
  currencies: string[];
  figures: (currency: string) => CashFigures;
  testId: string;
  /** a rollup of several trips: the explanations say "these trips" */
  manyTrips?: boolean;
}) {
  const { t, te } = useLanguage();
  const hint = (key: string) => t(manyTrips ? `${key}Many` : key);
  // the unpaid line only appears when some currency has something outstanding
  const hasUnpaid = currencies.some((cur) => figures(cur).unpaid > 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" data-testid={testId}>
        <thead>
          <tr className="text-gray-500 border-b">
            <th className="py-2 pe-4" />
            {currencies.map((cur) => (
              <th key={cur} className="py-2 ps-4 font-medium text-end" data-testid={`${testId}-${cur}`}>
                {te(cur)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <CashLine
            label={t("trips.cashTripRevenue")}
            hint={hint("trips.cashTripRevenueHint")}
            currencies={currencies}
            value={(cur) => figures(cur).revenue}
            testId={`${testId}-revenue`}
          />
          <CashLine
            label={t("trips.cashDebtCollected")}
            hint={hint("trips.cashDebtCollectedHint")}
            sign="+"
            currencies={currencies}
            value={(cur) => figures(cur).debt}
            testId={`${testId}-debt`}
          />
          <CashLine
            label={t("trips.tripSpend")}
            hint={hint("trips.tripSpendHint")}
            sign="-"
            currencies={currencies}
            value={(cur) => figures(cur).spend}
            className="text-amber-700 dark:text-amber-500"
            testId={`${testId}-spend`}
          />
          <tr className="border-t-2 border-gray-200 dark:border-gray-700" data-testid={`${testId}-net`}>
            <td className="py-2 pe-4 font-semibold text-gray-900 dark:text-gray-100">
              {t("trips.shouldReturn")}
            </td>
            {currencies.map((cur) => {
              const net = figures(cur).net;
              return (
                <td
                  key={cur}
                  className={`py-2 ps-4 text-end font-semibold tabular-nums whitespace-nowrap ${
                    net < 0 ? "text-red-600" : "text-gray-900 dark:text-gray-100"
                  }`}
                  data-testid={`${testId}-net-${cur}`}
                >
                  {net.toFixed(2)}
                </td>
              );
            })}
          </tr>
          {hasUnpaid && (
            <CashLine
              label={t("trips.unpaidSpend")}
              hint={hint("trips.unpaidSpendHint")}
              currencies={currencies}
              value={(cur) => figures(cur).unpaid}
              className="text-gray-500"
              muted
              testId={`${testId}-unpaid`}
            />
          )}
        </tbody>
      </table>
    </div>
  );
}

/** One line of the statement: a label with a one-line explanation under it,
 *  and an amount per currency. `sign` prefixes non-zero amounts so the
 *  arithmetic reads off the page: revenue, + debt, - spend. */
function CashLine({
  label,
  hint,
  sign,
  currencies,
  value,
  className = "",
  muted = false,
  testId,
}: {
  label: string;
  hint: string;
  sign?: "+" | "-";
  currencies: string[];
  value: (currency: string) => number;
  className?: string;
  muted?: boolean;
  testId: string;
}) {
  return (
    <tr className="border-b border-gray-100 dark:border-gray-800 last:border-0" data-testid={testId}>
      <td className="py-2 pe-4">
        <div className={muted ? "text-gray-500" : "text-gray-900 dark:text-gray-100"}>{label}</div>
        <div className="text-xs text-gray-500">{hint}</div>
      </td>
      {currencies.map((cur) => {
        const amount = value(cur);
        return (
          <td
            key={cur}
            className={`py-2 ps-4 text-end tabular-nums whitespace-nowrap align-top ${
              amount ? className : "text-gray-400"
            }`}
            data-testid={`${testId}-${cur}`}
          >
            {amount ? `${sign ? `${sign} ` : ""}${amount.toFixed(2)}` : "—"}
          </td>
        );
      })}
    </tr>
  );
}
