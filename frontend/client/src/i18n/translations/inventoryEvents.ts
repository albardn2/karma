// Inventory Events domain strings (list, detail, add dialog, filters).

export const en: Record<string, string> = {
  // list page
  'inventoryEvents.countEvents': '{count} events',
  'inventoryEvents.emptyTitle': 'No inventory events found',
  'inventoryEvents.emptyFiltered':
    'No inventory events match your current filters. Try adjusting your search criteria.',
  'inventoryEvents.emptyDefault':
    'Get started by adding your first inventory event to track inventory changes.',
  'inventoryEvents.eventId': 'Event ID: {id}',
  'inventoryEvents.material': 'Material',
  'inventoryEvents.costPerUnit': 'Cost per Unit',
  'inventoryEvents.affectsOriginal': 'Affects Original',
  'inventoryEvents.notAvailable': 'N/A',

  // pagination
  'inventoryEvents.first': 'First',
  'inventoryEvents.last': 'Last',
  'inventoryEvents.pageOf': 'Page {page} of {pages}',
  'inventoryEvents.showingEvents': 'Showing {from} to {to} of {total} events',

  // filters
  'inventoryEvents.filterTitle': 'Filter Inventory Events',
  'inventoryEvents.uuid': 'UUID',
  'inventoryEvents.eventUuidPlaceholder': 'Enter event UUID',
  'inventoryEvents.inventoryUuid': 'Inventory UUID',
  'inventoryEvents.inventoryUuidPlaceholder': 'Enter inventory UUID',
  'inventoryEvents.materialUuid': 'Material UUID',
  'inventoryEvents.eventType': 'Event Type',
  'inventoryEvents.selectEventType': 'Select event type',
  'inventoryEvents.allTypes': 'All Types',
  'inventoryEvents.startDate': 'Start Date',
  'inventoryEvents.endDate': 'End Date',
  'inventoryEvents.itemsPerPage': 'Items per page',
  'inventoryEvents.totalEvents': '{count} total events',
  'inventoryEvents.applyFilters': 'Apply Filters',
  'inventoryEvents.clear': 'Clear',

  // add dialog
  'inventoryEvents.addEvent': 'Add Inventory Event',
  'inventoryEvents.addNewEvent': 'Add New Inventory Event',
  'inventoryEvents.quantityPlaceholder': 'Enter quantity',
  'inventoryEvents.costPerUnitOptional': 'Cost per Unit (Optional)',
  'inventoryEvents.costPlaceholder': 'Enter cost',
  'inventoryEvents.currencyOptional': 'Currency (Optional)',
  'inventoryEvents.selectCurrency': 'Select currency',
  'inventoryEvents.affectOriginalQuantity': 'Affect Original Quantity',
  'inventoryEvents.affectOriginalHint':
    'Whether this event affects the original inventory quantity',
  'inventoryEvents.notesOptional': 'Notes (Optional)',
  'inventoryEvents.notesPlaceholder': 'Enter any additional notes',
  'inventoryEvents.createEvent': 'Create Event',

  // validation
  'inventoryEvents.inventoryUuidRequired': 'Inventory UUID is required',
  'inventoryEvents.eventTypeRequired': 'Event type is required',
  'inventoryEvents.quantityRequired': 'Quantity is required',

  // detail page
  'inventoryEvents.notFoundTitle': 'Inventory Event Not Found',
  'inventoryEvents.backToList': 'Back to Inventory Events',
  'inventoryEvents.detailsTitle': 'Inventory Event Details',
  'inventoryEvents.infoTitle': 'Inventory Event Information',
  'inventoryEvents.deleteConfirm':
    'This action cannot be undone. This will permanently delete the inventory event.',
  'inventoryEvents.copied': 'Copied',
  'inventoryEvents.copiedToClipboard': '{field} copied to clipboard',
  'inventoryEvents.copyFailed': 'Failed to copy to clipboard',

  // event type enum values (via te())
  'enum.purchase_order': 'Purchase Order',
  'enum.process': 'Process',
  'enum.sale': 'Sale',
  'enum.transfer': 'Transfer',
  'enum.return': 'Return',
  'enum.adjustment': 'Adjustment',
  'enum.manual': 'Manual',
};

export const ar: Record<string, string> = {
  // list page
  'inventoryEvents.countEvents': '{count} حركة',
  'inventoryEvents.emptyTitle': 'لا توجد حركات مخزون',
  'inventoryEvents.emptyFiltered':
    'لا توجد حركات مخزون مطابقة لعوامل التصفية الحالية. حاول تعديل معايير البحث.',
  'inventoryEvents.emptyDefault':
    'ابدأ بإضافة أول حركة مخزون لتتبّع تغيّرات المخزون.',
  'inventoryEvents.eventId': 'معرّف الحركة: {id}',
  'inventoryEvents.material': 'المادة',
  'inventoryEvents.costPerUnit': 'تكلفة الوحدة',
  'inventoryEvents.affectsOriginal': 'يؤثر على الأصل',
  'inventoryEvents.notAvailable': 'غير متاح',

  // pagination
  'inventoryEvents.first': 'الأولى',
  'inventoryEvents.last': 'الأخيرة',
  'inventoryEvents.pageOf': 'صفحة {page} من {pages}',
  'inventoryEvents.showingEvents': 'عرض {from} إلى {to} من {total} حركة',

  // filters
  'inventoryEvents.filterTitle': 'تصفية حركات المخزون',
  'inventoryEvents.uuid': 'المعرّف الفريد',
  'inventoryEvents.eventUuidPlaceholder': 'أدخل معرّف الحركة',
  'inventoryEvents.inventoryUuid': 'معرّف المخزون',
  'inventoryEvents.inventoryUuidPlaceholder': 'أدخل معرّف المخزون',
  'inventoryEvents.materialUuid': 'معرّف المادة',
  'inventoryEvents.eventType': 'نوع الحركة',
  'inventoryEvents.selectEventType': 'اختر نوع الحركة',
  'inventoryEvents.allTypes': 'جميع الأنواع',
  'inventoryEvents.startDate': 'تاريخ البداية',
  'inventoryEvents.endDate': 'تاريخ النهاية',
  'inventoryEvents.itemsPerPage': 'عناصر لكل صفحة',
  'inventoryEvents.totalEvents': '{count} حركة إجمالاً',
  'inventoryEvents.applyFilters': 'تطبيق التصفية',
  'inventoryEvents.clear': 'مسح',

  // add dialog
  'inventoryEvents.addEvent': 'إضافة حركة مخزون',
  'inventoryEvents.addNewEvent': 'إضافة حركة مخزون جديدة',
  'inventoryEvents.quantityPlaceholder': 'أدخل الكمية',
  'inventoryEvents.costPerUnitOptional': 'تكلفة الوحدة (اختياري)',
  'inventoryEvents.costPlaceholder': 'أدخل التكلفة',
  'inventoryEvents.currencyOptional': 'العملة (اختياري)',
  'inventoryEvents.selectCurrency': 'اختر العملة',
  'inventoryEvents.affectOriginalQuantity': 'التأثير على الكمية الأصلية',
  'inventoryEvents.affectOriginalHint':
    'ما إذا كانت هذه الحركة تؤثر على كمية المخزون الأصلية',
  'inventoryEvents.notesOptional': 'ملاحظات (اختياري)',
  'inventoryEvents.notesPlaceholder': 'أدخل أي ملاحظات إضافية',
  'inventoryEvents.createEvent': 'إنشاء الحركة',

  // validation
  'inventoryEvents.inventoryUuidRequired': 'معرّف المخزون مطلوب',
  'inventoryEvents.eventTypeRequired': 'نوع الحركة مطلوب',
  'inventoryEvents.quantityRequired': 'الكمية مطلوبة',

  // detail page
  'inventoryEvents.notFoundTitle': 'حركة المخزون غير موجودة',
  'inventoryEvents.backToList': 'العودة إلى حركات المخزون',
  'inventoryEvents.detailsTitle': 'تفاصيل حركة المخزون',
  'inventoryEvents.infoTitle': 'معلومات حركة المخزون',
  'inventoryEvents.deleteConfirm':
    'لا يمكن التراجع عن هذا الإجراء. سيؤدي هذا إلى حذف حركة المخزون نهائياً.',
  'inventoryEvents.copied': 'تم النسخ',
  'inventoryEvents.copiedToClipboard': 'تم نسخ {field} إلى الحافظة',
  'inventoryEvents.copyFailed': 'فشل النسخ إلى الحافظة',

  // event type enum values (via te())
  'enum.purchase_order': 'طلب شراء',
  'enum.process': 'عملية إنتاج',
  'enum.sale': 'بيع',
  'enum.transfer': 'نقل',
  'enum.return': 'إرجاع',
  'enum.adjustment': 'تسوية',
  'enum.manual': 'يدوي',
};
