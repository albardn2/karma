// UI strings for the credit-note-item and debit-note-item domain
// (list, create, detail, filters, add dialog). Keys are prefixed with
// "notes.". Shared strings reuse common.* / nav.*. Arabic is Modern
// Standard Arabic, business register, terminology kept consistent with
// the mobile app and nav (credit note = إشعار دائن, debit note = إشعار مدين,
// invoice item = بند الفاتورة, vendor = المورّد, purchase order = طلب الشراء).

export const en: Record<string, string> = {
  // list pages — headers / subtitles / actions
  'notes.creditSubtitle': 'Manage credit note items and refunds ({count} total)',
  'notes.debitSubtitle': 'Manage debit note items and charges ({count} total)',
  'notes.addCreditItem': 'Add Credit Note Item',
  'notes.addDebitItem': 'Add Debit Note Item',
  'notes.createCreditItem': 'Create Credit Note Item',
  'notes.createDebitItem': 'Create Debit Note Item',

  // tabs
  'notes.tabAll': 'All ({count})',
  'notes.tabUnpaid': 'Unpaid ({count})',
  'notes.tabPaid': 'Paid ({count})',
  'notes.tabOverdue': 'Overdue ({count})',

  // table columns / fields
  'notes.amountDue': 'Amount Due',
  'notes.amountPaid': 'Amount Paid',
  'notes.reference': 'Reference',
  'notes.referenceType': 'Reference Type',
  'notes.referenceUuid': 'Reference UUID',
  'notes.created': 'Created',
  'notes.createdDate': 'Created Date',
  'notes.createdBy': 'Created By',
  'notes.createdByUuid': 'Created By UUID',
  'notes.paidDate': 'Paid Date',
  'notes.inventoryChange': 'Inventory Change',
  'notes.creditAmount': 'Credit Amount',
  'notes.debitAmount': 'Debit Amount',

  // empty states
  'notes.creditNoneFound': 'No credit note items found',
  'notes.debitNoneFound': 'No debit note items found',
  'notes.creditEmptyHint': 'Get started by creating your first credit note item to track refunds and adjustments.',
  'notes.debitEmptyHint': 'Get started by creating your first debit note item to track charges and adjustments.',
  'notes.noNotes': 'No notes',
  'notes.noNotesProvided': 'No notes provided',

  // reference type labels
  'notes.refInvoiceItem': 'Invoice Item',
  'notes.refCustomer': 'Customer',
  'notes.refVendor': 'Vendor',
  'notes.refPurchaseOrderItem': 'Purchase Order Item',

  // pagination
  'notes.pageInfo': 'Page {page} of {pages}',
  'notes.showingResults': 'Showing {from} to {to} of {total} results',
  'notes.ofItems': 'of {count} items',
  'notes.show': 'Show:',

  // errors (list + detail)
  'notes.creditErrorLoading': 'Error loading credit note items: {message}',
  'notes.debitErrorLoadingTitle': 'Error Loading Debit Note Items',
  'notes.creditErrorLoadingTitle': 'Error Loading Credit Note Item',
  'notes.debitErrorLoadingItemTitle': 'Error Loading Debit Note Item',
  'notes.backToCreditItems': 'Back to Credit Note Items',
  'notes.backToDebitItems': 'Back to Debit Note Items',

  // create pages
  'notes.createCreditSubtitle': 'Add a new credit note item for customer refunds or adjustments',
  'notes.createDebitSubtitle': 'Add a new debit note item for charges and adjustments',
  'notes.creditItemInfo': 'Credit Note Item Information',
  'notes.creditItemInfoDesc': 'Fill in the information below to create a new credit note item',
  'notes.debitInfo': 'Debit Note Information',
  'notes.debitInfoDesc': 'Enter the basic information for the debit note item',
  'notes.referenceInformation': 'Reference Information',
  'notes.referenceSelection': 'Reference Selection',
  'notes.selectReferenceProvideUuid': 'Select the reference type and provide the UUID:',
  'notes.selectReferenceProvideUuidDebit': 'Select the type of reference and provide the UUID',
  'notes.prefilledReferring': 'Pre-filled from referring page',
  'notes.prefilledPrevious': 'Pre-filled from previous page',
  'notes.loadingCurrencies': 'Loading currencies...',
  'notes.selectCurrency': 'Select currency',
  'notes.selectCurrencyDots': 'Select currency...',
  'notes.inventoryChangeHint': 'Optional: Only set if related to purchase order or invoice item',
  'notes.inventoryChangeHintDialog': 'Optional: Specify inventory quantity change (positive for increase, negative for decrease)',
  'notes.notesPlaceholder': 'Enter any additional notes...',
  'notes.notesPlaceholderDialog': 'Add any additional notes about this credit note item...',
  'notes.autoPayCredit': 'Auto Pay (Create automatic payout for this credit note item)',
  'notes.autoPayDebit': 'Auto Pay (automatically create payment record)',
  'notes.createAutomaticPayout': 'Create automatic payout',

  // UUID field labels
  'notes.creditItemUuid': 'Credit Note Item UUID',
  'notes.uuid': 'UUID',
  'notes.invoiceItemUuid': 'Invoice Item UUID',
  'notes.customerOrderItemUuid': 'Customer Order Item UUID',
  'notes.purchaseOrderItemUuid': 'Purchase Order Item UUID',
  'notes.customerUuid': 'Customer UUID',
  'notes.vendorUuid': 'Vendor UUID',

  // UUID field placeholders (create / add dialog)
  'notes.enterCreditItemUuid': 'Enter credit note item UUID...',
  'notes.enterInvoiceItemUuid': 'Enter invoice item UUID...',
  'notes.enterCustomerOrderItemUuid': 'Enter customer order item UUID...',
  'notes.enterPurchaseOrderItemUuid': 'Enter purchase order item UUID...',
  'notes.enterCustomerUuid': 'Enter customer UUID...',
  'notes.enterVendorUuid': 'Enter vendor UUID...',
  'notes.enterReference': 'Enter {label}...',

  // UUID field placeholders (debit filters)
  'notes.filterByUuid': 'Filter by UUID...',
  'notes.filterByInvoiceItemUuid': 'Filter by invoice item UUID...',
  'notes.filterByCustomerOrderItemUuid': 'Filter by customer order item UUID...',
  'notes.filterByPurchaseOrderItemUuid': 'Filter by purchase order item UUID...',
  'notes.filterByCustomerUuid': 'Filter by customer UUID...',
  'notes.filterByVendorUuid': 'Filter by vendor UUID...',

  // detail pages
  'notes.creditItemSingular': 'Credit Note Item',
  'notes.debitItemSingular': 'Debit Note Item',
  'notes.creditItemId': 'Credit Note Item ID',
  'notes.debitItemId': 'Debit Note Item ID',
  'notes.saveChanges': 'Save Changes',
  'notes.financialInfo': 'Financial Information',
  'notes.creditFinancialDesc': 'Credit note amount and payment details',
  'notes.debitFinancialDesc': 'Debit note amount and payment details',
  'notes.editableInfo': 'Editable Information',
  'notes.editableInfoDesc': 'Fields that can be modified',
  'notes.relatedEntityDetails': 'Related entity details',
  'notes.systemInfo': 'System Information',
  'notes.systemInfoDesc': 'Creation and audit details',
  'notes.dateAtTime': '{date} at {time}',
  'notes.deleteCreditTitle': 'Delete Credit Note Item',
  'notes.deleteCreditConfirm': 'Are you sure you want to delete this credit note item? This action cannot be undone.',
  'notes.deleteDebitTitle': 'Delete Debit Note Item',
  'notes.deleteDebitConfirm': 'Are you sure you want to delete this debit note item? This action cannot be undone.',

  // filters
  'notes.filterCreditTitle': 'Filter Credit Note Items',
  'notes.filterCreditDesc': 'Use the filters below to narrow down the credit note items list.',
  'notes.filterDebitTitle': 'Filter Debit Note Items',
  'notes.filterDebitDesc': 'Apply filters to find specific debit note items. Showing {count} total items.',
  'notes.allStatuses': 'All statuses',
  'notes.allStatusesTitle': 'All Statuses',
  'notes.selectStatus': 'Select status',
  'notes.paymentStatus': 'Payment Status',
  'notes.allPaymentStatuses': 'All payment statuses',
  'notes.selectPaymentStatus': 'Select payment status',
  'notes.applyFilters': 'Apply Filters',
  'notes.clearAll': 'Clear All',

  // toasts / validation
  'notes.copiedToClipboard': 'Copied to clipboard',
  'notes.copiedDescription': '{label} has been copied to your clipboard.',
  'notes.creditCreated': 'Credit note item created successfully',
  'notes.creditCreateFailed': 'Failed to create credit note item',
  'notes.creditCreatedDialog': 'Credit note item has been created successfully.',
  'notes.creditCreateFailedDialog': 'Failed to create credit note item.',
  'notes.creditUpdated': 'Credit note item updated successfully',
  'notes.creditUpdateFailed': 'Failed to update credit note item',
  'notes.creditDeleted': 'Credit note item deleted successfully',
  'notes.creditDeleteFailed': 'Failed to delete credit note item',
  'notes.debitCreated': 'Debit note item created successfully',
  'notes.debitCreateFailed': 'Failed to create debit note item',
  'notes.debitUpdated': 'Debit note item updated successfully',
  'notes.debitUpdateFailed': 'Failed to update debit note item',
  'notes.debitDeleted': 'Debit note item deleted successfully',
  'notes.debitDeleteFailed': 'Failed to delete debit note item',
  'notes.validationError': 'Validation Error',
  'notes.amountCurrencyRequired': 'Amount and currency are required.',
  'notes.validationAmount': 'Amount must be greater than 0',
  'notes.validationCurrency': 'Currency is required',
  'notes.validationUuid': 'Please enter a valid UUID',

  // domain enum value (te() fallback) — not in common.*
  'enum.sent': 'Sent',
};

export const ar: Record<string, string> = {
  // list pages — headers / subtitles / actions
  'notes.creditSubtitle': 'إدارة بنود الإشعارات الدائنة والاستردادات ({count} إجمالاً)',
  'notes.debitSubtitle': 'إدارة بنود الإشعارات المدينة والرسوم ({count} إجمالاً)',
  'notes.addCreditItem': 'إضافة بند إشعار دائن',
  'notes.addDebitItem': 'إضافة بند إشعار مدين',
  'notes.createCreditItem': 'إنشاء بند إشعار دائن',
  'notes.createDebitItem': 'إنشاء بند إشعار مدين',

  // tabs
  'notes.tabAll': 'الكل ({count})',
  'notes.tabUnpaid': 'غير مدفوع ({count})',
  'notes.tabPaid': 'مدفوع ({count})',
  'notes.tabOverdue': 'متأخر ({count})',

  // table columns / fields
  'notes.amountDue': 'المبلغ المستحق',
  'notes.amountPaid': 'المبلغ المدفوع',
  'notes.reference': 'المرجع',
  'notes.referenceType': 'نوع المرجع',
  'notes.referenceUuid': 'معرّف المرجع',
  'notes.created': 'تاريخ الإنشاء',
  'notes.createdDate': 'تاريخ الإنشاء',
  'notes.createdBy': 'أنشئ بواسطة',
  'notes.createdByUuid': 'معرّف المُنشئ',
  'notes.paidDate': 'تاريخ الدفع',
  'notes.inventoryChange': 'تغيير المخزون',
  'notes.creditAmount': 'مبلغ الإشعار الدائن',
  'notes.debitAmount': 'مبلغ الإشعار المدين',

  // empty states
  'notes.creditNoneFound': 'لا توجد بنود إشعارات دائنة',
  'notes.debitNoneFound': 'لا توجد بنود إشعارات مدينة',
  'notes.creditEmptyHint': 'ابدأ بإنشاء أول بند إشعار دائن لتتبع الاستردادات والتسويات.',
  'notes.debitEmptyHint': 'ابدأ بإنشاء أول بند إشعار مدين لتتبع الرسوم والتسويات.',
  'notes.noNotes': 'لا توجد ملاحظات',
  'notes.noNotesProvided': 'لا توجد ملاحظات',

  // reference type labels
  'notes.refInvoiceItem': 'بند الفاتورة',
  'notes.refCustomer': 'العميل',
  'notes.refVendor': 'المورّد',
  'notes.refPurchaseOrderItem': 'بند طلب الشراء',

  // pagination
  'notes.pageInfo': 'صفحة {page} من {pages}',
  'notes.showingResults': 'عرض {from} إلى {to} من {total} نتيجة',
  'notes.ofItems': 'من {count} بند',
  'notes.show': 'عرض:',

  // errors (list + detail)
  'notes.creditErrorLoading': 'خطأ في تحميل بنود الإشعارات الدائنة: {message}',
  'notes.debitErrorLoadingTitle': 'خطأ في تحميل بنود الإشعارات المدينة',
  'notes.creditErrorLoadingTitle': 'خطأ في تحميل بند الإشعار الدائن',
  'notes.debitErrorLoadingItemTitle': 'خطأ في تحميل بند الإشعار المدين',
  'notes.backToCreditItems': 'العودة إلى بنود الإشعارات الدائنة',
  'notes.backToDebitItems': 'العودة إلى بنود الإشعارات المدينة',

  // create pages
  'notes.createCreditSubtitle': 'إضافة بند إشعار دائن جديد لاستردادات العملاء أو التسويات',
  'notes.createDebitSubtitle': 'إضافة بند إشعار مدين جديد للرسوم والتسويات',
  'notes.creditItemInfo': 'معلومات بند الإشعار الدائن',
  'notes.creditItemInfoDesc': 'املأ المعلومات أدناه لإنشاء بند إشعار دائن جديد',
  'notes.debitInfo': 'معلومات الإشعار المدين',
  'notes.debitInfoDesc': 'أدخل المعلومات الأساسية لبند الإشعار المدين',
  'notes.referenceInformation': 'معلومات المرجع',
  'notes.referenceSelection': 'اختيار المرجع',
  'notes.selectReferenceProvideUuid': 'اختر نوع المرجع وأدخل المعرّف:',
  'notes.selectReferenceProvideUuidDebit': 'اختر نوع المرجع وأدخل المعرّف',
  'notes.prefilledReferring': 'مُعبأ مسبقاً من الصفحة المُحيلة',
  'notes.prefilledPrevious': 'مُعبأ مسبقاً من الصفحة السابقة',
  'notes.loadingCurrencies': 'جارٍ تحميل العملات...',
  'notes.selectCurrency': 'اختر العملة',
  'notes.selectCurrencyDots': 'اختر العملة...',
  'notes.inventoryChangeHint': 'اختياري: يُحدَّد فقط إذا كان مرتبطاً بطلب شراء أو بند فاتورة',
  'notes.inventoryChangeHintDialog': 'اختياري: حدّد تغيير كمية المخزون (موجب للزيادة، سالب للنقصان)',
  'notes.notesPlaceholder': 'أدخل أي ملاحظات إضافية...',
  'notes.notesPlaceholderDialog': 'أضف أي ملاحظات إضافية حول بند الإشعار الدائن هذا...',
  'notes.autoPayCredit': 'دفع تلقائي (إنشاء دفعة صادرة تلقائية لبند الإشعار الدائن هذا)',
  'notes.autoPayDebit': 'دفع تلقائي (إنشاء سجل دفع تلقائياً)',
  'notes.createAutomaticPayout': 'إنشاء دفعة صادرة تلقائية',

  // UUID field labels
  'notes.creditItemUuid': 'معرّف بند الإشعار الدائن',
  'notes.uuid': 'المعرّف',
  'notes.invoiceItemUuid': 'معرّف بند الفاتورة',
  'notes.customerOrderItemUuid': 'معرّف بند طلب العميل',
  'notes.purchaseOrderItemUuid': 'معرّف بند طلب الشراء',
  'notes.customerUuid': 'معرّف العميل',
  'notes.vendorUuid': 'معرّف المورّد',

  // UUID field placeholders (create / add dialog)
  'notes.enterCreditItemUuid': 'أدخل معرّف بند الإشعار الدائن...',
  'notes.enterInvoiceItemUuid': 'أدخل معرّف بند الفاتورة...',
  'notes.enterCustomerOrderItemUuid': 'أدخل معرّف بند طلب العميل...',
  'notes.enterPurchaseOrderItemUuid': 'أدخل معرّف بند طلب الشراء...',
  'notes.enterCustomerUuid': 'أدخل معرّف العميل...',
  'notes.enterVendorUuid': 'أدخل معرّف المورّد...',
  'notes.enterReference': 'أدخل {label}...',

  // UUID field placeholders (debit filters)
  'notes.filterByUuid': 'التصفية حسب المعرّف...',
  'notes.filterByInvoiceItemUuid': 'التصفية حسب معرّف بند الفاتورة...',
  'notes.filterByCustomerOrderItemUuid': 'التصفية حسب معرّف بند طلب العميل...',
  'notes.filterByPurchaseOrderItemUuid': 'التصفية حسب معرّف بند طلب الشراء...',
  'notes.filterByCustomerUuid': 'التصفية حسب معرّف العميل...',
  'notes.filterByVendorUuid': 'التصفية حسب معرّف المورّد...',

  // detail pages
  'notes.creditItemSingular': 'بند الإشعار الدائن',
  'notes.debitItemSingular': 'بند الإشعار المدين',
  'notes.creditItemId': 'معرّف بند الإشعار الدائن',
  'notes.debitItemId': 'معرّف بند الإشعار المدين',
  'notes.saveChanges': 'حفظ التغييرات',
  'notes.financialInfo': 'المعلومات المالية',
  'notes.creditFinancialDesc': 'مبلغ الإشعار الدائن وتفاصيل الدفع',
  'notes.debitFinancialDesc': 'مبلغ الإشعار المدين وتفاصيل الدفع',
  'notes.editableInfo': 'المعلومات القابلة للتعديل',
  'notes.editableInfoDesc': 'الحقول التي يمكن تعديلها',
  'notes.relatedEntityDetails': 'تفاصيل الكيان المرتبط',
  'notes.systemInfo': 'معلومات النظام',
  'notes.systemInfoDesc': 'تفاصيل الإنشاء والتدقيق',
  'notes.dateAtTime': '{date} في {time}',
  'notes.deleteCreditTitle': 'حذف بند الإشعار الدائن',
  'notes.deleteCreditConfirm': 'هل أنت متأكد أنك تريد حذف بند الإشعار الدائن هذا؟ لا يمكن التراجع عن هذا الإجراء.',
  'notes.deleteDebitTitle': 'حذف بند الإشعار المدين',
  'notes.deleteDebitConfirm': 'هل أنت متأكد أنك تريد حذف بند الإشعار المدين هذا؟ لا يمكن التراجع عن هذا الإجراء.',

  // filters
  'notes.filterCreditTitle': 'تصفية بنود الإشعارات الدائنة',
  'notes.filterCreditDesc': 'استخدم عوامل التصفية أدناه لتضييق قائمة بنود الإشعارات الدائنة.',
  'notes.filterDebitTitle': 'تصفية بنود الإشعارات المدينة',
  'notes.filterDebitDesc': 'طبّق عوامل التصفية للعثور على بنود إشعارات مدينة محددة. عرض {count} بنداً إجمالاً.',
  'notes.allStatuses': 'كل الحالات',
  'notes.allStatusesTitle': 'كل الحالات',
  'notes.selectStatus': 'اختر الحالة',
  'notes.paymentStatus': 'حالة الدفع',
  'notes.allPaymentStatuses': 'كل حالات الدفع',
  'notes.selectPaymentStatus': 'اختر حالة الدفع',
  'notes.applyFilters': 'تطبيق عوامل التصفية',
  'notes.clearAll': 'مسح الكل',

  // toasts / validation
  'notes.copiedToClipboard': 'تم النسخ إلى الحافظة',
  'notes.copiedDescription': 'تم نسخ {label} إلى الحافظة.',
  'notes.creditCreated': 'تم إنشاء بند الإشعار الدائن بنجاح',
  'notes.creditCreateFailed': 'فشل إنشاء بند الإشعار الدائن',
  'notes.creditCreatedDialog': 'تم إنشاء بند الإشعار الدائن بنجاح.',
  'notes.creditCreateFailedDialog': 'فشل إنشاء بند الإشعار الدائن.',
  'notes.creditUpdated': 'تم تحديث بند الإشعار الدائن بنجاح',
  'notes.creditUpdateFailed': 'فشل تحديث بند الإشعار الدائن',
  'notes.creditDeleted': 'تم حذف بند الإشعار الدائن بنجاح',
  'notes.creditDeleteFailed': 'فشل حذف بند الإشعار الدائن',
  'notes.debitCreated': 'تم إنشاء بند الإشعار المدين بنجاح',
  'notes.debitCreateFailed': 'فشل إنشاء بند الإشعار المدين',
  'notes.debitUpdated': 'تم تحديث بند الإشعار المدين بنجاح',
  'notes.debitUpdateFailed': 'فشل تحديث بند الإشعار المدين',
  'notes.debitDeleted': 'تم حذف بند الإشعار المدين بنجاح',
  'notes.debitDeleteFailed': 'فشل حذف بند الإشعار المدين',
  'notes.validationError': 'خطأ في التحقق',
  'notes.amountCurrencyRequired': 'المبلغ والعملة مطلوبان.',
  'notes.validationAmount': 'يجب أن يكون المبلغ أكبر من 0',
  'notes.validationCurrency': 'العملة مطلوبة',
  'notes.validationUuid': 'يرجى إدخال معرّف صالح',

  // domain enum value (te() fallback) — not in common.*
  'enum.sent': 'مُرسَل',
};
