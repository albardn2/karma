// Trips domain: Trips list, TripDetail, and trip components (filters, dialogs,
// analytics). Arabic is Modern Standard Arabic, terminology kept consistent
// with the mobile app (expo_app/i18n/translations.ts).

export const en: Record<string, string> = {
  // page / list
  'trips.subtitle': 'Manage delivery and distribution trips',
  'trips.tabAll': 'All trips',
  'trips.createTrip': 'Create trip',
  'trips.loading': 'Loading trips...',
  'trips.errorLoading': 'Error loading trips',
  'trips.noTrips': 'No trips',
  'trips.errorMessage': 'Error: {message}',
  'trips.emptyHint': 'Get started by creating your first trip.',
  'trips.notSet': 'Not set',

  // list table headers
  'trips.colTripId': 'Trip ID',
  'trips.colVehicle': 'Vehicle',
  'trips.assignedTo': 'Assigned To',
  'trips.startTime': 'Start Time',
  'trips.endTime': 'End Time',
  'trips.created': 'Created',
  'trips.colCompleted': 'Completed',

  // delete dialog
  'trips.deleteConfirmTitle': 'Delete this trip?',
  'trips.deleteConfirmDescription':
    'The trip and its workflow execution will be removed from all lists. This cannot be undone from the app.',
  'trips.deleteTrip': 'Delete Trip',
  'trips.tripDeleted': 'Trip deleted',
  'trips.failedDelete': 'Failed to delete trip',

  // filters
  'trips.showLabel': 'Show:',
  'trips.filterTitle': 'Filter trips',
  'trips.tripUuid': 'Trip UUID',
  'trips.vehicleUuid': 'Vehicle UUID',
  'trips.serviceAreaUuid': 'Service Area UUID',
  'trips.enterTripUuid': 'Enter trip UUID',
  'trips.enterVehicleUuid': 'Enter vehicle UUID',
  'trips.enterServiceAreaUuid': 'Enter service area UUID',
  'trips.selectStatus': 'Select status',
  'trips.allStatuses': 'All statuses',
  'trips.clear': 'Clear',

  // create dialog
  'trips.createDialogTitle': 'Create New Trip',
  'trips.createDialogDescription': 'Create a new delivery or distribution trip.',
  'trips.formVehicle': 'Vehicle*',
  'trips.formStatus': 'Status*',
  'trips.formStartWarehouse': 'Start Warehouse (Optional)',
  'trips.formEndWarehouse': 'End Warehouse (Optional)',
  'trips.selectVehicle': 'Select a vehicle',
  'trips.selectStartWarehouse': 'Select start warehouse (optional)',
  'trips.selectEndWarehouse': 'Select end warehouse (optional)',
  'trips.notesInstructionsPlaceholder': 'Enter trip notes or instructions',
  'trips.vehicleRequired': 'Vehicle is required',
  'trips.createdSuccess': 'Trip created successfully',
  'trips.failedCreate': 'Failed to create trip',

  // detail header
  'trips.detailsTitle': 'Trip Details',
  'trips.headerUuid': 'Trip UUID: {uuid}',
  'trips.backToTrips': 'Back to trips',
  'trips.errorLoadingTrip': 'Error loading trip: {message}',
  'trips.tripNotFound': 'Trip not found',

  // copy-to-clipboard
  'trips.copied': 'Copied',
  'trips.copiedToClipboard': '{label} copied to clipboard',

  // general information card
  'trips.generalInfo': 'General Information',
  'trips.workflowExecution': 'Workflow Execution',

  // timing & warehouses card
  'trips.timingWarehouses': 'Timing & Warehouses',
  'trips.startWarehouse': 'Start Warehouse',
  'trips.endWarehouse': 'End Warehouse',

  // expected cash
  'trips.expectedCash': 'Expected Cash',
  'trips.noCashCollected': 'No cash collected on this trip yet.',

  // trip inventory / reconciliation
  'trips.inventory': 'Trip Inventory',
  'trips.material': 'Material',
  'trips.reconStart': 'Start',
  'trips.reconSold': 'Sold',
  'trips.reconExpectedEnd': 'Expected End',
  'trips.reconEnd': 'End',
  'trips.reconVariance': 'Variance',
  'trips.endInventoryNote':
    'End inventory not snapshotted yet — End and Variance fill in when the trip completes.',
  'trips.noInventorySnapshot': 'No inventory snapshot for this trip.',
  'trips.vehicleInventoryDuringTrip': 'Vehicle Inventory During Trip',

  // trip stops
  'trips.stopsTitle': 'Trip Stops',
  'trips.tableView': 'Table',
  'trips.mapView': 'Map',
  'trips.noStopsYet': 'No stops on this trip yet.',
  'trips.customer': 'Customer',
  'trips.outcome': 'Outcome',
  'trips.pageRange': '{from}–{to} of {total}',

  // trip activity
  'trips.activityTitle': 'Trip Activity',
  'trips.tabOrders': 'Orders ({count})',
  'trips.tabFulfilled': 'Fulfilled ({count})',
  'trips.tabPaid': 'Paid ({count})',
  'trips.tabAnalytics': 'Analytics',
  'trips.nothingHere': 'Nothing here for this trip yet.',
  'trips.qty': 'Qty',
  'trips.unfulfilled': 'Unfulfilled',

  // notes / data
  'trips.notesPlaceholder': 'Enter trip notes...',
  'trips.noNotes': 'No notes available',
  'trips.tripData': 'Trip Data',
  'trips.updatedSuccess': 'Trip updated successfully',
  'trips.failedUpdate': 'Failed to update trip',

  // analytics
  'trips.noActivityRecorded': 'No activity recorded for this trip yet.',
  'trips.totalRevenue': 'Total Revenue',
  'trips.collected': 'Collected',
  'trips.outstandingDebt': 'Outstanding Debt',
  'trips.labelStops': 'Stops',
  'trips.labelCompleted': 'Completed',
  'trips.labelSales': 'Sales',
  'trips.labelOrders': 'Orders',
  'trips.labelUnpaidOrders': 'Unpaid orders',
  'trips.stopOutcomes': 'Stop Outcomes',
  'trips.noStops': 'No stops on this trip.',
  'trips.noOutcomeYet': 'No outcome yet',
  'trips.revenuePerMaterial': 'Revenue per Material',
  'trips.noPricedItems': 'No priced order items on this trip.',
  'trips.revenueLabel': 'Revenue',
  'trips.deliveredQty': 'Delivered Quantity per Material',

  // add stop dialog
  'trips.addStop': 'Add Stop',
  'trips.adding': 'Adding…',
  'trips.existingCustomer': 'Existing customer',
  'trips.newCustomer': 'New customer',
  'trips.searchCustomers': 'Search customers...',
  'trips.noCustomersMatch': 'No customers match.',
  'trips.companyNamePlaceholder': 'Company / shop name *',
  'trips.contactFullNamePlaceholder': 'Contact full name *',
  'trips.phoneNumberPlaceholder': 'Phone number *',
  'trips.categoryPlaceholder': 'Category *',
  'trips.addressPlaceholder': 'Address (optional)',
  'trips.locationHint': 'Location (lat,lon) — used if the customer has no saved location',
  'trips.coordsPlaceholder': 'e.g. 33.5138,36.2765',
  'trips.useMyLocation': 'Use my location',
  'trips.stopAdded': 'Stop added',
  'trips.stopCreated': 'The trip stop was created.',
  'trips.locationUnavailable': 'Location unavailable',
  'trips.geolocationNotSupported': 'Geolocation is not supported here.',
  'trips.locationError': 'Location error',
};

export const ar: Record<string, string> = {
  // page / list
  'trips.subtitle': 'إدارة رحلات التوصيل والتوزيع',
  'trips.tabAll': 'كل الرحلات',
  'trips.createTrip': 'إنشاء رحلة',
  'trips.loading': 'جارٍ تحميل الرحلات...',
  'trips.errorLoading': 'خطأ في تحميل الرحلات',
  'trips.noTrips': 'لا توجد رحلات',
  'trips.errorMessage': 'خطأ: {message}',
  'trips.emptyHint': 'ابدأ بإنشاء رحلتك الأولى.',
  'trips.notSet': 'غير محدد',

  // list table headers
  'trips.colTripId': 'معرّف الرحلة',
  'trips.colVehicle': 'المركبة',
  'trips.assignedTo': 'مسندة إلى',
  'trips.startTime': 'وقت البداية',
  'trips.endTime': 'وقت النهاية',
  'trips.created': 'أنشئت',
  'trips.colCompleted': 'اكتملت',

  // delete dialog
  'trips.deleteConfirmTitle': 'حذف هذه الرحلة؟',
  'trips.deleteConfirmDescription':
    'سيتم إزالة الرحلة وتنفيذ سير العمل الخاص بها من جميع القوائم. لا يمكن التراجع عن ذلك من التطبيق.',
  'trips.deleteTrip': 'حذف الرحلة',
  'trips.tripDeleted': 'تم حذف الرحلة',
  'trips.failedDelete': 'فشل حذف الرحلة',

  // filters
  'trips.showLabel': 'عرض:',
  'trips.filterTitle': 'تصفية الرحلات',
  'trips.tripUuid': 'معرّف الرحلة',
  'trips.vehicleUuid': 'معرّف المركبة',
  'trips.serviceAreaUuid': 'معرّف منطقة الخدمة',
  'trips.enterTripUuid': 'أدخل معرّف الرحلة',
  'trips.enterVehicleUuid': 'أدخل معرّف المركبة',
  'trips.enterServiceAreaUuid': 'أدخل معرّف منطقة الخدمة',
  'trips.selectStatus': 'اختر الحالة',
  'trips.allStatuses': 'جميع الحالات',
  'trips.clear': 'مسح',

  // create dialog
  'trips.createDialogTitle': 'إنشاء رحلة جديدة',
  'trips.createDialogDescription': 'أنشئ رحلة توصيل أو توزيع جديدة.',
  'trips.formVehicle': 'المركبة*',
  'trips.formStatus': 'الحالة*',
  'trips.formStartWarehouse': 'مستودع الانطلاق (اختياري)',
  'trips.formEndWarehouse': 'مستودع النهاية (اختياري)',
  'trips.selectVehicle': 'اختر مركبة',
  'trips.selectStartWarehouse': 'اختر مستودع الانطلاق (اختياري)',
  'trips.selectEndWarehouse': 'اختر مستودع النهاية (اختياري)',
  'trips.notesInstructionsPlaceholder': 'أدخل ملاحظات أو تعليمات الرحلة',
  'trips.vehicleRequired': 'المركبة مطلوبة',
  'trips.createdSuccess': 'تم إنشاء الرحلة بنجاح',
  'trips.failedCreate': 'فشل إنشاء الرحلة',

  // detail header
  'trips.detailsTitle': 'تفاصيل الرحلة',
  'trips.headerUuid': 'معرّف الرحلة: {uuid}',
  'trips.backToTrips': 'العودة إلى الرحلات',
  'trips.errorLoadingTrip': 'خطأ في تحميل الرحلة: {message}',
  'trips.tripNotFound': 'الرحلة غير موجودة',

  // copy-to-clipboard
  'trips.copied': 'تم النسخ',
  'trips.copiedToClipboard': 'تم نسخ {label} إلى الحافظة',

  // general information card
  'trips.generalInfo': 'معلومات عامة',
  'trips.workflowExecution': 'تنفيذ سير العمل',

  // timing & warehouses card
  'trips.timingWarehouses': 'التوقيت والمستودعات',
  'trips.startWarehouse': 'مستودع الانطلاق',
  'trips.endWarehouse': 'مستودع النهاية',

  // expected cash
  'trips.expectedCash': 'النقد المتوقع',
  'trips.noCashCollected': 'لم يتم تحصيل أي نقد في هذه الرحلة بعد.',

  // trip inventory / reconciliation
  'trips.inventory': 'مخزون الرحلة',
  'trips.material': 'المادة',
  'trips.reconStart': 'البداية',
  'trips.reconSold': 'المُباع',
  'trips.reconExpectedEnd': 'النهاية المتوقعة',
  'trips.reconEnd': 'النهاية',
  'trips.reconVariance': 'الفرق',
  'trips.endInventoryNote':
    'لم يتم تسجيل مخزون النهاية بعد — يتم ملء "النهاية" و"الفرق" عند اكتمال الرحلة.',
  'trips.noInventorySnapshot': 'لا توجد لقطة مخزون لهذه الرحلة.',
  'trips.vehicleInventoryDuringTrip': 'مخزون المركبة أثناء الرحلة',

  // trip stops
  'trips.stopsTitle': 'محطات الرحلة',
  'trips.tableView': 'الجدول',
  'trips.mapView': 'الخريطة',
  'trips.noStopsYet': 'لا توجد محطات في هذه الرحلة بعد.',
  'trips.customer': 'العميل',
  'trips.outcome': 'النتيجة',
  'trips.pageRange': '{from}–{to} من {total}',

  // trip activity
  'trips.activityTitle': 'نشاط الرحلة',
  'trips.tabOrders': 'الطلبات ({count})',
  'trips.tabFulfilled': 'المسلَّم ({count})',
  'trips.tabPaid': 'المدفوع ({count})',
  'trips.tabAnalytics': 'التحليلات',
  'trips.nothingHere': 'لا يوجد شيء لهذه الرحلة بعد.',
  'trips.qty': 'الكمية',
  'trips.unfulfilled': 'غير مُسلَّم',

  // notes / data
  'trips.notesPlaceholder': 'أدخل ملاحظات الرحلة...',
  'trips.noNotes': 'لا توجد ملاحظات',
  'trips.tripData': 'بيانات الرحلة',
  'trips.updatedSuccess': 'تم تحديث الرحلة بنجاح',
  'trips.failedUpdate': 'فشل تحديث الرحلة',

  // analytics
  'trips.noActivityRecorded': 'لم يُسجَّل أي نشاط لهذه الرحلة بعد.',
  'trips.totalRevenue': 'إجمالي الإيرادات',
  'trips.collected': 'المحصَّل',
  'trips.outstandingDebt': 'الديون المستحقة',
  'trips.labelStops': 'المحطات',
  'trips.labelCompleted': 'المكتملة',
  'trips.labelSales': 'المبيعات',
  'trips.labelOrders': 'الطلبات',
  'trips.labelUnpaidOrders': 'طلبات غير مدفوعة',
  'trips.stopOutcomes': 'نتائج المحطات',
  'trips.noStops': 'لا توجد محطات في هذه الرحلة.',
  'trips.noOutcomeYet': 'لا نتيجة بعد',
  'trips.revenuePerMaterial': 'الإيرادات حسب المادة',
  'trips.noPricedItems': 'لا توجد بنود طلب مسعّرة في هذه الرحلة.',
  'trips.revenueLabel': 'الإيرادات',
  'trips.deliveredQty': 'الكمية المسلَّمة حسب المادة',

  // add stop dialog
  'trips.addStop': 'إضافة محطة',
  'trips.adding': 'جارٍ الإضافة…',
  'trips.existingCustomer': 'عميل حالي',
  'trips.newCustomer': 'عميل جديد',
  'trips.searchCustomers': 'بحث عن العملاء…',
  'trips.noCustomersMatch': 'لا يوجد عملاء مطابقون.',
  'trips.companyNamePlaceholder': 'اسم الشركة / المتجر *',
  'trips.contactFullNamePlaceholder': 'الاسم الكامل لجهة الاتصال *',
  'trips.phoneNumberPlaceholder': 'رقم الهاتف *',
  'trips.categoryPlaceholder': 'الفئة *',
  'trips.addressPlaceholder': 'العنوان (اختياري)',
  'trips.locationHint': 'الموقع (خط العرض، خط الطول) — يُستخدم إذا لم يكن للعميل موقع محفوظ',
  'trips.coordsPlaceholder': 'مثال: 33.5138,36.2765',
  'trips.useMyLocation': 'استخدام موقعي',
  'trips.stopAdded': 'تمت إضافة المحطة',
  'trips.stopCreated': 'تم إنشاء محطة الرحلة.',
  'trips.locationUnavailable': 'الموقع غير متاح',
  'trips.geolocationNotSupported': 'تحديد الموقع الجغرافي غير مدعوم هنا.',
  'trips.locationError': 'خطأ في تحديد الموقع',
};
