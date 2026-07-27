import { Lang, translations } from './index';

// Arabic display labels for backend enum values and field identifiers.
// The RAW value keeps flowing to (and being compared against) the API —
// only what the user sees changes. Ported from expo_app/i18n/enums.ts so
// terminology stays identical across app and web.
//
// Domain-specific enum values can also be translated by adding an
// `enum.<value>` key to a translation module; ENUM_AR here wins on conflict.
const ENUM_AR: Record<string, string> = {
  // customer categories (CustomerCategory)
  roastery: 'محمصة',
  restaurant: 'مطعم',
  minimarket: 'ميني ماركت',
  supermarket: 'سوبر ماركت',
  distributer: 'موزّع',
  school: 'مدرسة',
  university: 'جامعة',
  hospital: 'مشفى',
  // currencies (Currency)
  USD: 'دولار',
  SYP: 'ل.س',
  EUR: 'يورو',
  TRY: 'ليرة تركية',
  // units of measure (UnitOfMeasure)
  kg: 'كغ',
  liters: 'لتر',
  meters: 'متر',
  pcs: 'قطعة',
  // task-form field identifiers (task_inputs field names/labels)
  manual_stops: 'محطات يدوية',
  service_areas: 'مناطق الخدمة',
  start_warehouse_name: 'مستودع الانطلاق',
  end_warehouse_name: 'مستودع النهاية',
  start_point: 'نقطة الانطلاق',
  end_point: 'نقطة النهاية',
  assigned_user_uuid: 'المستخدم المسؤول',
  customer_categories: 'فئات العملاء',
  vehicle_plate: 'لوحة المركبة',
  last_visit_threshold_days: 'مدة آخر زيارة (أيام)',
  max_stops: 'الحد الأقصى للمحطات',
  min_stops: 'الحد الأدنى للمحطات',
  outcome: 'النتيجة',
  notes: 'ملاحظات',
};

const ARABIC_CHARS = /[؀-ۿ]/;

// "assigned_user_uuid" → "Assigned user" (mirrors the app's prettyLabel)
const prettify = (v: string) =>
  v
    .replace(/_/g, ' ')
    .replace(/\buuid\b/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());

/**
 * Translate a backend enum value / field identifier for display.
 *
 * - Bilingual composites stored in workflow data ("sale - تم البيع") are split:
 *   English shows the part before " - ", Arabic the part after.
 * - Plain values map through ENUM_AR (or an `enum.<value>` translation key)
 *   in Arabic; unknown values fall back to the raw string, so data-driven
 *   options (usernames, plates, area names) pass through intact.
 */
export function enumLabel(value: string | null | undefined, lang: Lang): string {
  if (!value) return '';
  const v = String(value);

  // composite "english - عربي" option values baked into workflow definitions
  const parts = v.split(' - ');
  if (parts.length >= 2 && ARABIC_CHARS.test(parts[parts.length - 1])) {
    return lang === 'ar'
      ? parts.slice(1).join(' - ').trim()
      : parts[0].trim();
  }

  if (lang === 'ar') {
    return (
      ENUM_AR[v] ??
      ENUM_AR[v.toLowerCase()] ??
      translations.ar[`enum.${v}`] ??
      translations.ar[`enum.${v.toLowerCase()}`] ??
      v
    );
  }
  return translations.en[`enum.${v}`] ?? translations.en[`enum.${v.toLowerCase()}`] ?? v;
}

/** enumLabel + English prettify — for identifiers shown as labels/chips. */
export function enumLabelPretty(value: string | null | undefined, lang: Lang): string {
  if (!value) return '';
  const label = enumLabel(value, lang);
  return lang === 'ar' ? label : prettify(label);
}
