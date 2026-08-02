import { Lang } from './translations';

// Arabic display labels for backend enum values and field identifiers.
// The RAW value keeps flowing to (and being compared against) the API —
// only what the user sees changes.
const ENUM_AR: Record<string, string> = {
  raw_materials: 'مواد خام',
  services: 'خدمات',
  sold: 'مُباع',
  retired: 'مسحوب',
  utilized: 'قيد الاستخدام',
  pending: 'قيد الانتظار',
  paid: 'مدفوع',
  void: 'ملغى',
  manager: 'مدير',
  employee: 'موظف',
  // inventory event types
  sale: 'بيع',
  purchase_order: 'أمر شراء',
  process: 'عملية إنتاج',
  manual: 'يدوي',
  transfer: 'نقل',
  adjustment: 'تسوية',
  // material types
  product: 'منتج',
  raw_material: 'مادة خام',
  // User roles. The app had none of these, so a role name rendered as its raw key
  // in Arabic — the whole set is here rather than only the two being added, since
  // the gap is the same for all of them.
  superuser: 'مدير أعلى',
  admin: 'مدير النظام',
  operation_manager: 'مدير العمليات',
  accountant: 'محاسب',
  operator: 'مشغّل',
  driver: 'سائق',
  sales: 'مبيعات',
  sales_associate: 'مندوب مبيعات',
  sales_manager: 'مدير مبيعات',
  warehouse_keeper: 'أمين مستودع',
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
  // expense categories (ExpenseCategory) — drivers pick these on the road.
  // Wording copied verbatim from the web's shipped enum.* labels so the two
  // surfaces name the same category identically.
  electricity: 'كهرباء',
  water: 'مياه',
  rent: 'إيجار',
  maintenance: 'صيانة',
  equipment: 'معدات',
  supplies: 'مستلزمات',
  travel: 'سفر',
  meals: 'وجبات',
  other: 'أخرى',
  // units of measure (UnitOfMeasure)
  kg: 'كغ',
  liters: 'لتر',
  meters: 'متر',
  pcs: 'قطعة',
  // task-form field identifiers (task_inputs field names/labels)
  trip_name: 'اسم الرحلة',
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
 * - Plain values map through ENUM_AR in Arabic; English gets a light prettify
 *   ("roastery" → "Roastery"). Unknown values fall back to the raw string, so
 *   data-driven options (usernames, plates, area names) pass through intact.
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

  if (lang === 'ar') return ENUM_AR[v] ?? ENUM_AR[v.toLowerCase()] ?? v;
  return v;
}

/** enumLabel + English prettify — for identifiers shown as labels/chips. */
export function enumLabelPretty(value: string | null | undefined, lang: Lang): string {
  if (!value) return '';
  const label = enumLabel(value, lang);
  return lang === 'ar' ? label : prettify(label);
}
