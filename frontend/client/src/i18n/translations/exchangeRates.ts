// UI strings for the exchange-rate domain (Exchange Rates list + filters, and
// the pre-filled rate hint on the transaction create form).
// Keys are prefixed with "exchangeRates."; shared strings reuse common.* / nav.*.
// The rate is always SYP per 1 USD in OLD Syrian pounds (~13,387) — the same
// unit as every other SYP amount in the app — so no "new pound" wording here.
// Arabic is Modern Standard Arabic, business register, terminology kept
// consistent with nav (exchange rate = سعر الصرف).

export const en: Record<string, string> = {
  // list page
  'exchangeRates.historyTitle': 'Exchange Rate History',
  'exchangeRates.noRates': 'No exchange rates recorded yet',
  'exchangeRates.noRatesHint': "Pull today's rate to start the history.",
  'exchangeRates.loadError': 'Error loading exchange rates: {message}',
  'exchangeRates.pagination': 'Showing {from} to {to} of {total} exchange rates',

  // table columns
  'exchangeRates.rate': 'Rate',
  'exchangeRates.buy': 'Buy',
  'exchangeRates.sell': 'Sell',
  'exchangeRates.source': 'Source',
  'exchangeRates.from': 'From',
  'exchangeRates.to': 'To',

  // pull / backfill actions
  'exchangeRates.pullToday': "Pull today's rate",
  'exchangeRates.pulling': 'Pulling…',
  'exchangeRates.pullSuccess':
    '{rate} {to} per 1 {from} saved for {date} — {created} created, {updated} updated',
  'exchangeRates.pullNoData': 'sp-today published no rate for today',
  'exchangeRates.pullFailed': "Could not pull today's rate",
  'exchangeRates.backfill': 'Backfill from sp-today',
  'exchangeRates.backfilling': 'Backfilling…',
  'exchangeRates.backfillSuccess':
    '{created} days created, {updated} updated ({first} to {last})',
  'exchangeRates.backfillNoData': 'sp-today published no days to backfill',
  'exchangeRates.backfillFailed': 'Could not backfill from sp-today',

  // how far back to backfill — the ranges sp-today's own chart offers
  'exchangeRates.backfillRangeLabel': 'How far back to backfill',
  'exchangeRates.range_today': 'Today',
  'exchangeRates.range_1w': '1 week',
  'exchangeRates.range_1m': '1 month',
  'exchangeRates.range_3m': '3 months',
  'exchangeRates.range_6m': '6 months',
  'exchangeRates.range_1y': '1 year',

  // filters
  'exchangeRates.countRates': '{count} exchange rates',
  'exchangeRates.filterTitle': 'Filter Exchange Rates',
  'exchangeRates.fromCurrency': 'From Currency',
  'exchangeRates.toCurrency': 'To Currency',
  'exchangeRates.allCurrencies': 'All Currencies',
  'exchangeRates.selectCurrency': 'Select currency',
  'exchangeRates.allSources': 'All Sources',
  'exchangeRates.selectSource': 'Select source',
  'exchangeRates.startDate': 'Start Date',
  'exchangeRates.endDate': 'End Date',
  'exchangeRates.applyFilters': 'Apply Filters',
  'exchangeRates.clearAll': 'Clear All',
  'exchangeRates.show': 'Show:',
  'exchangeRates.perPageSuffix': 'per page',

  // transaction create form — the rate field pre-filled from the stored rate
  'exchangeRates.seededFrom': 'from the rate recorded on {date}',

  // source enum values (shown via te(); 'manual' already lives in
  // inventoryEvents.ts, so only the site source is added here)
  'enum.sp-today': 'sp-today',
};

export const ar: Record<string, string> = {
  // list page
  'exchangeRates.historyTitle': 'سجل أسعار الصرف',
  'exchangeRates.noRates': 'لا توجد أسعار صرف مسجّلة',
  'exchangeRates.noRatesHint': 'اجلب سعر اليوم لبدء السجل.',
  'exchangeRates.loadError': 'خطأ في تحميل أسعار الصرف: {message}',
  'exchangeRates.pagination': 'عرض {from} إلى {to} من {total} سعر صرف',

  // table columns
  'exchangeRates.rate': 'سعر الصرف',
  'exchangeRates.buy': 'شراء',
  'exchangeRates.sell': 'بيع',
  'exchangeRates.source': 'المصدر',
  'exchangeRates.from': 'من',
  'exchangeRates.to': 'إلى',

  // pull / backfill actions
  'exchangeRates.pullToday': 'جلب سعر اليوم',
  'exchangeRates.pulling': 'جارٍ الجلب…',
  'exchangeRates.pullSuccess':
    '{rate} {to} لكل 1 {from} — حُفظ بتاريخ {date} — {created} جديد، {updated} محدّث',
  'exchangeRates.pullNoData': 'لم ينشر sp-today سعراً لهذا اليوم',
  'exchangeRates.pullFailed': 'تعذر جلب سعر اليوم',
  'exchangeRates.backfill': 'تعبئة السجل من sp-today',
  'exchangeRates.backfilling': 'جارٍ تعبئة السجل…',
  'exchangeRates.backfillSuccess':
    '{created} يوم جديد، {updated} محدّث (من {first} إلى {last})',
  'exchangeRates.backfillNoData': 'لا توجد أيام لتعبئتها من sp-today',
  'exchangeRates.backfillFailed': 'تعذرت تعبئة السجل من sp-today',

  // how far back to backfill
  'exchangeRates.backfillRangeLabel': 'مدة التعبئة',
  'exchangeRates.range_today': 'اليوم',
  'exchangeRates.range_1w': 'أسبوع',
  'exchangeRates.range_1m': 'شهر',
  'exchangeRates.range_3m': '3 أشهر',
  'exchangeRates.range_6m': '6 أشهر',
  'exchangeRates.range_1y': 'سنة',

  // filters
  'exchangeRates.countRates': '{count} سعر صرف',
  'exchangeRates.filterTitle': 'تصفية أسعار الصرف',
  'exchangeRates.fromCurrency': 'العملة المُحوَّل منها',
  'exchangeRates.toCurrency': 'العملة المُحوَّل إليها',
  'exchangeRates.allCurrencies': 'جميع العملات',
  'exchangeRates.selectCurrency': 'اختر العملة',
  'exchangeRates.allSources': 'جميع المصادر',
  'exchangeRates.selectSource': 'اختر المصدر',
  'exchangeRates.startDate': 'تاريخ البداية',
  'exchangeRates.endDate': 'تاريخ النهاية',
  'exchangeRates.applyFilters': 'تطبيق عوامل التصفية',
  'exchangeRates.clearAll': 'مسح الكل',
  'exchangeRates.show': 'عرض:',
  'exchangeRates.perPageSuffix': 'لكل صفحة',

  // transaction create form — the rate field pre-filled from the stored rate
  'exchangeRates.seededFrom': 'من السعر المسجّل بتاريخ {date}',

  // source enum values (shown via te(); 'manual' already lives in
  // inventoryEvents.ts, so only the site source is added here)
  'enum.sp-today': 'sp-today',
};
