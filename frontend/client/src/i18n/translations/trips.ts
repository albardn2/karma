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
  'trips.colName': 'Name',
  'trips.namePlaceholder': 'Unnamed — e.g. 2026-07-30-zaid-malki',
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
  'trips.auditLabel': 'Audit',
  'trips.selectAuditState': 'Select audit state',
  'trips.allAuditStates': 'Audited and not',
  // the assignee / vehicle dropdowns offer only people and vehicles that are on
  // at least one trip, so an empty list means there are no trips yet
  'trips.filterAssignee': 'Assigned to',
  'trips.allAssignees': 'Everyone',
  'trips.filterVehicle': 'Vehicle',
  'trips.allVehicles': 'All vehicles',
  'trips.filterOptionsFailed': "Couldn't load the choices",
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

  // audit sign-off
  'trips.audited': 'Audited',
  'trips.notAudited': 'Not audited',
  'trips.markAudited': 'Mark as audited',
  'trips.undoAudit': 'Undo audit',
  'trips.awaitingReview': 'Awaiting review',
  'trips.auditedByOn': 'Audited by {user} on {date}',
  'trips.auditedOn': 'Audited on {date}',
  'trips.auditMarked': 'Trip marked as audited',
  'trips.auditCleared': 'Audit undone',
  'trips.failedAudit': 'Failed to mark the trip as audited',
  'trips.failedUnaudit': 'Failed to undo the audit',

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
  'trips.tabDebtCollected': 'Debt collected ({count})',
  'trips.debtOrderDate': 'Order from',
  'trips.debtCollectedTotal': 'Total debt collected',
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
  'trips.cashCollected': 'Collected',
  'trips.tripSpend': 'Spent on the trip',
  'trips.unpaidSpend': 'Booked, unpaid',
  'trips.shouldReturn': 'Should return',
  // the expected-cash statement: each line with a one-line explanation
  'trips.cashTripRevenue': 'Trip revenue',
  'trips.cashTripRevenueHint': 'Cash taken for orders sold or delivered on this trip',
  'trips.cashDebtCollected': 'Debt collected',
  'trips.cashDebtCollectedHint': 'Cash taken at its stops for older orders, delivered before this trip',
  'trips.tripSpendHint': 'Expenses paid out of the trip cash',
  'trips.unpaidSpendHint': 'Booked to the trip but not paid: not deducted',
  // the same lines in the multi-trip summary. Each trip's own split, summed:
  // a credit sale on Monday's trip collected by Tuesday's is Tuesday's debt,
  // even when both trips are selected, so the wording is per trip
  'trips.cashTripRevenueHintMany': 'Cash each trip took for orders it sold or delivered itself',
  'trips.cashDebtCollectedHintMany': 'Cash each trip took for orders delivered before it, including on another of these trips',
  'trips.tripSpendHintMany': 'Expenses paid out of the trips’ cash',
  'trips.unpaidSpendHintMany': 'Booked to the trips but not paid: not deducted',
  'trips.tripExpenses': 'Trip Expenses',
  'trips.noTripExpenses': 'No expenses booked to this trip',
  // multi-select + aggregate summary over the selected trips
  'trips.selectTrip': 'Select trip',
  'trips.selectAllOnPage': 'Select every trip on this page',
  'trips.selectedCount': '{count} selected',
  'trips.clearSelection': 'Clear',
  'trips.summary': 'Summary',
  'trips.summaryTitle': 'Selected Trips Summary',
  'trips.summarySubtitle': 'Totals across {count} trip(s)',
  'trips.summaryFailed': 'Could not load the summary: {message}',
  'trips.summaryTooMany': 'At most {max} trips can be summarised at once',
  'trips.summaryNoCash': 'No cash was collected or spent on the selected trips.',
  'trips.summaryNoMaterials': 'No stock moved on the selected trips.',
  'trips.summaryNetInventory': 'Net Inventory Change',
  'trips.summaryLoaded': 'Loaded',
  'trips.summaryReturned': 'Returned',
  'trips.summaryNetChange': 'Net Change',
  'trips.summaryNetChangeHint':
    'Net change is what came back minus what was loaded, so it carries losses as well as sales. Compare it against Sold.',
  'trips.summaryPartialHint': 'Counts only the selected trips whose stock was counted back in.',
  // '(s)' rather than a plural rule: the t() helper does no pluralisation, and
  // '1 of the selected trips have' reads as a bug
  'trips.summaryMissing': '{count} selected trip(s) no longer exist and are not included.',
  'trips.summaryNoEndSnapshot':
    '{count} selected trip(s) have no returned-stock count yet, so they add to Sold but not to Net Change.',

  // sales & interest funnels on this trip (the funnel's own labels are dashboards.tf*)
  'trips.funnelsTitle': 'Sales & interest funnels on this trip',
  'trips.funnelsDesc':
    'The {n} customers this trip stopped at — where they stood when it ended, and how the trip moved them.',
  'trips.funnelsDescOpen':
    'The {n} customers this trip has stopped at so far — where they stand now, and how the trip has moved them.',
  'trips.funnelsNew': '{n} of them were added during the trip.',
  'trips.funnelsBefore': '{n} before the trip',
  'trips.funnelsMoves': 'Moves during this trip',
  'trips.funnelsNoMoves': 'No customer changed step during this trip.',
  'trips.funnelsHint':
    'Big number: customers on this step when the trip ended (now, while it is still running). Small number: before the trip began. Badge: the change during the trip. Arrows: customers who moved between steps during the trip. Only completed or skipped stops count, and any change to these customers while the trip ran is included — also one made elsewhere.',
  'trips.funnelsHistoryNote':
    'This trip started before tag history begins ({date}), so some of its moves were not recorded.',
  'trips.funnelsEstimated':
    'This trip did not record when it set off or when its stops were worked, so its window is estimated (from when it was planned, or its first day if it was closed later).',
  'trips.funnelsEmpty': 'No customers to show: none of this trip’s completed or skipped stops is at a customer that still exists.',
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
  'trips.colName': 'الاسم',
  'trips.namePlaceholder': 'بدون اسم — مثال 2026-07-30-zaid-malki',
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
  'trips.auditLabel': 'المراجعة',
  'trips.selectAuditState': 'اختر حالة المراجعة',
  'trips.allAuditStates': 'المُراجَعة وغير المُراجَعة',
  'trips.filterAssignee': 'مسندة إلى',
  'trips.allAssignees': 'الجميع',
  'trips.filterVehicle': 'المركبة',
  'trips.allVehicles': 'جميع المركبات',
  'trips.filterOptionsFailed': 'تعذّر تحميل الخيارات',
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

  // audit sign-off
  'trips.audited': 'مُراجَع',
  'trips.notAudited': 'غير مُراجَع',
  'trips.markAudited': 'تحديد كمُراجَع',
  'trips.undoAudit': 'إلغاء المراجعة',
  'trips.awaitingReview': 'بانتظار المراجعة',
  'trips.auditedByOn': 'راجعها {user} بتاريخ {date}',
  'trips.auditedOn': 'تمت المراجعة بتاريخ {date}',
  'trips.auditMarked': 'تم تحديد الرحلة كمُراجَعة',
  'trips.auditCleared': 'تم إلغاء المراجعة',
  'trips.failedAudit': 'فشل تحديد الرحلة كمُراجَعة',
  'trips.failedUnaudit': 'فشل إلغاء المراجعة',

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
  'trips.tabDebtCollected': 'الديون المُحصّلة ({count})',
  'trips.debtOrderDate': 'تاريخ الطلب',
  'trips.debtCollectedTotal': 'إجمالي الديون المُحصّلة',
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
  'trips.cashCollected': 'المُحصّل',
  'trips.tripSpend': 'المصروف على الرحلة',
  'trips.unpaidSpend': 'مُسجَّل وغير مدفوع',
  'trips.shouldReturn': 'الواجب إرجاعه',
  'trips.cashTripRevenue': 'إيرادات الرحلة',
  'trips.cashTripRevenueHint': 'نقد مُحصّل عن طلبات بيعت أو سُلّمت في هذه الرحلة',
  'trips.cashDebtCollected': 'الديون المُحصّلة',
  'trips.cashDebtCollectedHint': 'نقد مُحصّل في محطاتها عن طلبات سابقة سُلّمت قبل هذه الرحلة',
  'trips.tripSpendHint': 'مصاريف دُفعت من نقد الرحلة',
  'trips.unpaidSpendHint': 'مُسجّلة على الرحلة ولم تُدفع: لا تُخصم',
  'trips.cashTripRevenueHintMany': 'نقد حصّلته كل رحلة عن طلبات باعتها أو سلّمتها بنفسها',
  'trips.cashDebtCollectedHintMany': 'نقد حصّلته كل رحلة عن طلبات سُلّمت قبلها، ولو في رحلة أخرى من هذه الرحلات',
  'trips.tripSpendHintMany': 'مصاريف دُفعت من نقد الرحلات',
  'trips.unpaidSpendHintMany': 'مُسجّلة على الرحلات ولم تُدفع: لا تُخصم',
  'trips.tripExpenses': 'مصاريف الرحلة',
  'trips.noTripExpenses': 'لا مصاريف مسجلة على هذه الرحلة',
  // التحديد المتعدد وملخص الرحلات المحددة
  'trips.selectTrip': 'تحديد الرحلة',
  'trips.selectAllOnPage': 'تحديد كل الرحلات في هذه الصفحة',
  'trips.selectedCount': 'المحدد: {count}',
  'trips.clearSelection': 'إلغاء التحديد',
  'trips.summary': 'الملخص',
  'trips.summaryTitle': 'ملخص الرحلات المحددة',
  'trips.summarySubtitle': 'الإجماليات عبر {count} رحلة',
  'trips.summaryFailed': 'تعذّر تحميل الملخص: {message}',
  'trips.summaryTooMany': 'يمكن تلخيص {max} رحلة كحد أقصى في المرة الواحدة',
  'trips.summaryNoCash': 'لم يُحصَّل أو يُصرف أي نقد في الرحلات المحددة.',
  'trips.summaryNoMaterials': 'لا حركة مخزون في الرحلات المحددة.',
  'trips.summaryNetInventory': 'صافي حركة المخزون',
  'trips.summaryLoaded': 'المحمَّل',
  'trips.summaryReturned': 'المُرجَع',
  'trips.summaryNetChange': 'الصافي',
  'trips.summaryNetChangeHint':
    'الصافي = المُرجَع ناقص المحمَّل، فهو يشمل الفاقد كما يشمل المبيع. قارنه مع المُباع.',
  'trips.summaryPartialHint': 'يحتسب فقط الرحلات المحددة التي تم جرد مخزونها عند العودة.',
  'trips.summaryMissing': '{count} من الرحلات المحددة لم تعد موجودة ولم تُحتسب.',
  'trips.summaryNoEndSnapshot':
    '{count} من الرحلات المحددة لم يتم جرد مخزونها عند العودة بعد، فهي تُضاف إلى المُباع دون الصافي.',

  // sales & interest funnels on this trip (the funnel's own labels are dashboards.tf*)
  'trips.funnelsTitle': 'قمع المبيعات والاهتمام في هذه الرحلة',
  'trips.funnelsDesc':
    'العملاء الـ{n} الذين توقفت عندهم هذه الرحلة — أين كانوا عند انتهائها، وكيف حرّكتهم الرحلة.',
  'trips.funnelsDescOpen':
    'العملاء الـ{n} الذين توقفت عندهم هذه الرحلة حتى الآن — أين هم الآن، وكيف حرّكتهم الرحلة.',
  'trips.funnelsNew': '{n} منهم أُضيفوا خلال الرحلة.',
  'trips.funnelsBefore': '{n} قبل الرحلة',
  'trips.funnelsMoves': 'الانتقالات خلال هذه الرحلة',
  'trips.funnelsNoMoves': 'لم يغيّر أي عميل مرحلته خلال هذه الرحلة.',
  'trips.funnelsHint':
    'الرقم الكبير: عدد العملاء في هذه المرحلة عند انتهاء الرحلة (أو الآن إن كانت لا تزال جارية). الرقم الصغير: قبل بدء الرحلة. الشارة: التغيّر خلال الرحلة. الأسهم: العملاء الذين انتقلوا بين المراحل خلال الرحلة. تُحتسب فقط المحطات المكتملة أو المتخطّاة، ويُضمَّن أي تغيير على هؤلاء العملاء أثناء الرحلة — حتى لو تمّ من مكان آخر.',
  'trips.funnelsHistoryNote':
    'بدأت هذه الرحلة قبل بدء سجل الوسوم ({date})، لذا لم تُسجَّل بعض انتقالاتها.',
  'trips.funnelsEstimated':
    'لم تُسجّل هذه الرحلة وقت انطلاقها أو وقت إنجاز محطاتها، لذا نافذتها الزمنية تقديرية (من وقت التخطيط لها، أو يومها الأول إن أُغلقت لاحقاً).',
  'trips.funnelsEmpty': 'لا يوجد عملاء لعرضهم: لا تضم هذه الرحلة أي محطة مكتملة أو متخطّاة لعميل لا يزال موجوداً.',
};
