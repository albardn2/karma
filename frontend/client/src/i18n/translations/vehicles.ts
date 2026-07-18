// Vehicles domain: fleet list, vehicle detail, add/edit forms, filters,
// and per-vehicle inventory (table, chart, add/adjust/unload dialog).
// Arabic is Modern Standard Arabic, terminology kept consistent with the
// mobile app and the shared materials/inventory vocabulary.

export const en: Record<string, string> = {
  // list page
  'vehicles.loadingVehicles': 'Loading vehicles...',
  'vehicles.loadErrorBanner': 'Unable to load vehicles - backend endpoint not available',
  'vehicles.countOnPage': '{count} vehicles on this page',
  'vehicles.backendNotAvailable': 'Backend Not Available',
  'vehicles.backendNotConfigured': 'The vehicles endpoint is not configured in your Flask backend.',
  'vehicles.backendEnableHint': 'To enable vehicle management, add the /vehicle endpoint to your backend API.',
  'vehicles.noVehiclesFound': 'No vehicles found',
  'vehicles.noVehiclesMatch': 'No vehicles match your current filters.',
  'vehicles.paginationInfo': 'Page {page} of {pages} ({total} total vehicles)',

  // fields
  'vehicles.plateNumber': 'Plate Number',
  'vehicles.make': 'Make',
  'vehicles.model': 'Model',
  'vehicles.year': 'Year',
  'vehicles.color': 'Color',
  'vehicles.vin': 'VIN',
  'vehicles.vinOptional': 'VIN (Optional)',
  'vehicles.notesOptional': 'Notes (Optional)',
  'vehicles.uuid': 'UUID',
  'vehicles.createdBy': 'Created By',
  'vehicles.metadata': 'Metadata',
  'vehicles.vehicleInformation': 'Vehicle Information',

  // placeholders
  'vehicles.platePlaceholder': 'Enter plate number',
  'vehicles.makePlaceholder': 'e.g., Toyota, Ford, Honda',
  'vehicles.modelPlaceholder': 'e.g., Camry, F-150, Civic',
  'vehicles.yearPlaceholder': 'Enter year',
  'vehicles.colorPlaceholder': 'Enter color',
  'vehicles.vinPlaceholder': 'Enter vehicle identification number',
  'vehicles.notesPlaceholder': 'Enter any additional notes',
  'vehicles.selectStatus': 'Select status',

  // add dialog
  'vehicles.addVehicle': 'Add Vehicle',
  'vehicles.addNewVehicle': 'Add New Vehicle',
  'vehicles.addDescription': 'Create a new vehicle entry for your fleet.',
  'vehicles.createVehicle': 'Create Vehicle',

  // detail page actions
  'vehicles.loadingDetails': 'Loading vehicle details...',
  'vehicles.notFound': 'Vehicle not found',
  'vehicles.notFoundDesc': 'The vehicle you\'re looking for doesn\'t exist.',
  'vehicles.goBack': 'Go Back',
  'vehicles.saveChanges': 'Save Changes',
  'vehicles.deleteVehicle': 'Delete Vehicle',
  'vehicles.deleteConfirmDesc': 'This will permanently delete the vehicle "{plate}". This action cannot be undone.',

  // filters
  'vehicles.filterVehicles': 'Filter Vehicles',
  'vehicles.filterDescription': 'Apply filters to narrow down the vehicle list',
  'vehicles.searchByPlate': 'Search by plate number',
  'vehicles.searchByMake': 'Search by make (e.g., Toyota)',
  'vehicles.searchByModel': 'Search by model (e.g., Camry)',
  'vehicles.searchByYear': 'Search by year',
  'vehicles.searchByColor': 'Search by color',
  'vehicles.searchByVin': 'Search by VIN',
  'vehicles.allStatuses': 'All Statuses',
  'vehicles.itemsPerPage': 'Items per page',
  'vehicles.perPageOption': '{count} per page',
  'vehicles.applyFilters': 'Apply Filters',

  // validation messages
  'vehicles.plateRequired': 'Plate number is required',
  'vehicles.makeRequired': 'Make is required',
  'vehicles.modelRequired': 'Model is required',
  'vehicles.colorRequired': 'Color is required',
  'vehicles.invalidYear': 'Invalid year',
  'vehicles.yearMin': 'Year must be 1900 or later',
  'vehicles.yearFuture': 'Year cannot be in the future',

  // toasts
  'vehicles.createSuccess': 'Vehicle created successfully',
  'vehicles.createFailed': 'Failed to create vehicle',
  'vehicles.updateSuccess': 'Vehicle updated successfully',
  'vehicles.updateFailed': 'Failed to update vehicle',
  'vehicles.deleteSuccess': 'Vehicle deleted successfully',
  'vehicles.deleteFailed': 'Failed to delete vehicle',
  'vehicles.confirmDelete': 'Are you sure you want to delete vehicle "{plate}"? This action cannot be undone.',
  'vehicles.copiedTitle': 'Copied to clipboard',
  'vehicles.copiedDesc': '{field} copied successfully.',
  'vehicles.copyFailedTitle': 'Copy failed',
  'vehicles.copyFailedDesc': 'Failed to copy to clipboard. Please try again.',

  // inventory table
  'vehicles.currentInventory': 'Current Inventory',
  'vehicles.material': 'Material',
  'vehicles.onHand': 'On hand',
  'vehicles.unit': 'Unit',
  'vehicles.noInventory': 'No inventory on this vehicle yet.',

  // inventory dialog
  'vehicles.vehicleInventory': 'Vehicle Inventory',
  'vehicles.addMaterial': 'Add material',
  'vehicles.selectMaterial': 'Select material...',
  'vehicles.noInventoryAddHint': 'No inventory on this vehicle yet. Add a material above to get started.',
  'vehicles.eventAddManual': 'Add (manual)',
  'vehicles.eventAdjust': 'Adjust (+/-)',
  'vehicles.eventUnload': 'Unload',
  'vehicles.qty': 'Qty',
  'vehicles.materialAddedTitle': 'Added',
  'vehicles.materialAddedDesc': 'Material added to vehicle.',
  'vehicles.stockUpdatedTitle': 'Updated',
  'vehicles.stockUpdatedDesc': 'Vehicle stock updated.',

  // inventory chart
  'vehicles.inventoryOverTime': 'Inventory Over Time',
  'vehicles.range': 'Range',
  'vehicles.from': 'From',
  'vehicles.to': 'To',
  'vehicles.noInventoryEvents': 'No inventory events in this range.',
  'vehicles.rangeAll': 'All time',
  'vehicles.range15m': 'Last 15 minutes',
  'vehicles.range30m': 'Last 30 minutes',
  'vehicles.range1h': 'Last 1 hour',
  'vehicles.range6h': 'Last 6 hours',
  'vehicles.range12h': 'Last 12 hours',
  'vehicles.range24h': 'Last 24 hours',
  'vehicles.range7d': 'Last 7 days',
  'vehicles.range30d': 'Last 30 days',
  'vehicles.range90d': 'Last 90 days',
  'vehicles.rangeCustom': 'Custom range',

  // vehicle status enum values (via te()); active/inactive live in common
  'enum.sold': 'Sold',
  'enum.maintenance': 'Maintenance',
  'enum.retired': 'Retired',
  'enum.utilized': 'Utilized',
};

export const ar: Record<string, string> = {
  // list page
  'vehicles.loadingVehicles': 'جارٍ تحميل المركبات...',
  'vehicles.loadErrorBanner': 'تعذّر تحميل المركبات - نقطة النهاية الخلفية غير متوفرة',
  'vehicles.countOnPage': '{count} مركبة في هذه الصفحة',
  'vehicles.backendNotAvailable': 'الخادم غير متوفر',
  'vehicles.backendNotConfigured': 'نقطة نهاية المركبات غير مُهيأة في خادم Flask الخاص بك.',
  'vehicles.backendEnableHint': 'لتفعيل إدارة المركبات، أضِف نقطة النهاية /vehicle إلى واجهة برمجة تطبيقات الخادم.',
  'vehicles.noVehiclesFound': 'لا توجد مركبات',
  'vehicles.noVehiclesMatch': 'لا توجد مركبات مطابقة لعوامل التصفية الحالية.',
  'vehicles.paginationInfo': 'صفحة {page} من {pages} ({total} مركبة إجمالاً)',

  // fields
  'vehicles.plateNumber': 'رقم اللوحة',
  'vehicles.make': 'الصانع',
  'vehicles.model': 'الطراز',
  'vehicles.year': 'السنة',
  'vehicles.color': 'اللون',
  'vehicles.vin': 'رقم الهيكل',
  'vehicles.vinOptional': 'رقم الهيكل (اختياري)',
  'vehicles.notesOptional': 'ملاحظات (اختياري)',
  'vehicles.uuid': 'المعرّف الفريد',
  'vehicles.createdBy': 'أنشئ بواسطة',
  'vehicles.metadata': 'البيانات الوصفية',
  'vehicles.vehicleInformation': 'معلومات المركبة',

  // placeholders
  'vehicles.platePlaceholder': 'أدخل رقم اللوحة',
  'vehicles.makePlaceholder': 'مثال: تويوتا، فورد، هوندا',
  'vehicles.modelPlaceholder': 'مثال: كامري، F-150، سيفيك',
  'vehicles.yearPlaceholder': 'أدخل السنة',
  'vehicles.colorPlaceholder': 'أدخل اللون',
  'vehicles.vinPlaceholder': 'أدخل رقم تعريف المركبة',
  'vehicles.notesPlaceholder': 'أدخل أي ملاحظات إضافية',
  'vehicles.selectStatus': 'اختر الحالة',

  // add dialog
  'vehicles.addVehicle': 'إضافة مركبة',
  'vehicles.addNewVehicle': 'إضافة مركبة جديدة',
  'vehicles.addDescription': 'أنشئ مركبة جديدة في أسطولك.',
  'vehicles.createVehicle': 'إنشاء مركبة',

  // detail page actions
  'vehicles.loadingDetails': 'جارٍ تحميل تفاصيل المركبة...',
  'vehicles.notFound': 'المركبة غير موجودة',
  'vehicles.notFoundDesc': 'المركبة التي تبحث عنها غير موجودة.',
  'vehicles.goBack': 'رجوع',
  'vehicles.saveChanges': 'حفظ التغييرات',
  'vehicles.deleteVehicle': 'حذف المركبة',
  'vehicles.deleteConfirmDesc': 'سيؤدي هذا إلى حذف المركبة "{plate}" نهائياً. لا يمكن التراجع عن هذا الإجراء.',

  // filters
  'vehicles.filterVehicles': 'تصفية المركبات',
  'vehicles.filterDescription': 'طبّق عوامل التصفية لتضييق قائمة المركبات',
  'vehicles.searchByPlate': 'البحث حسب رقم اللوحة',
  'vehicles.searchByMake': 'البحث حسب الصانع (مثال: تويوتا)',
  'vehicles.searchByModel': 'البحث حسب الطراز (مثال: كامري)',
  'vehicles.searchByYear': 'البحث حسب السنة',
  'vehicles.searchByColor': 'البحث حسب اللون',
  'vehicles.searchByVin': 'البحث حسب رقم الهيكل',
  'vehicles.allStatuses': 'جميع الحالات',
  'vehicles.itemsPerPage': 'عناصر لكل صفحة',
  'vehicles.perPageOption': '{count} لكل صفحة',
  'vehicles.applyFilters': 'تطبيق عوامل التصفية',

  // validation messages
  'vehicles.plateRequired': 'رقم اللوحة مطلوب',
  'vehicles.makeRequired': 'الصانع مطلوب',
  'vehicles.modelRequired': 'الطراز مطلوب',
  'vehicles.colorRequired': 'اللون مطلوب',
  'vehicles.invalidYear': 'سنة غير صالحة',
  'vehicles.yearMin': 'يجب أن تكون السنة 1900 أو بعدها',
  'vehicles.yearFuture': 'لا يمكن أن تكون السنة في المستقبل',

  // toasts
  'vehicles.createSuccess': 'تم إنشاء المركبة بنجاح',
  'vehicles.createFailed': 'فشل إنشاء المركبة',
  'vehicles.updateSuccess': 'تم تحديث المركبة بنجاح',
  'vehicles.updateFailed': 'فشل تحديث المركبة',
  'vehicles.deleteSuccess': 'تم حذف المركبة بنجاح',
  'vehicles.deleteFailed': 'فشل حذف المركبة',
  'vehicles.confirmDelete': 'هل أنت متأكد من حذف المركبة "{plate}"؟ لا يمكن التراجع عن هذا الإجراء.',
  'vehicles.copiedTitle': 'تم النسخ إلى الحافظة',
  'vehicles.copiedDesc': 'تم نسخ {field} بنجاح.',
  'vehicles.copyFailedTitle': 'فشل النسخ',
  'vehicles.copyFailedDesc': 'فشل النسخ إلى الحافظة. يرجى المحاولة مرة أخرى.',

  // inventory table
  'vehicles.currentInventory': 'المخزون الحالي',
  'vehicles.material': 'المادة',
  'vehicles.onHand': 'المتوفر',
  'vehicles.unit': 'الوحدة',
  'vehicles.noInventory': 'لا يوجد مخزون على هذه المركبة بعد.',

  // inventory dialog
  'vehicles.vehicleInventory': 'مخزون المركبة',
  'vehicles.addMaterial': 'إضافة مادة',
  'vehicles.selectMaterial': 'اختر المادة...',
  'vehicles.noInventoryAddHint': 'لا يوجد مخزون على هذه المركبة بعد. أضِف مادة أعلاه للبدء.',
  'vehicles.eventAddManual': 'إضافة (يدوي)',
  'vehicles.eventAdjust': 'تعديل (+/-)',
  'vehicles.eventUnload': 'تفريغ',
  'vehicles.qty': 'الكمية',
  'vehicles.materialAddedTitle': 'تمت الإضافة',
  'vehicles.materialAddedDesc': 'تمت إضافة المادة إلى المركبة.',
  'vehicles.stockUpdatedTitle': 'تم التحديث',
  'vehicles.stockUpdatedDesc': 'تم تحديث مخزون المركبة.',

  // inventory chart
  'vehicles.inventoryOverTime': 'المخزون عبر الزمن',
  'vehicles.range': 'النطاق',
  'vehicles.from': 'من',
  'vehicles.to': 'إلى',
  'vehicles.noInventoryEvents': 'لا توجد حركات مخزون في هذا النطاق.',
  'vehicles.rangeAll': 'كل الوقت',
  'vehicles.range15m': 'آخر 15 دقيقة',
  'vehicles.range30m': 'آخر 30 دقيقة',
  'vehicles.range1h': 'آخر ساعة',
  'vehicles.range6h': 'آخر 6 ساعات',
  'vehicles.range12h': 'آخر 12 ساعة',
  'vehicles.range24h': 'آخر 24 ساعة',
  'vehicles.range7d': 'آخر 7 أيام',
  'vehicles.range30d': 'آخر 30 يوماً',
  'vehicles.range90d': 'آخر 90 يوماً',
  'vehicles.rangeCustom': 'نطاق مخصص',

  // vehicle status enum values (via te()); active/inactive live in common
  'enum.sold': 'مباعة',
  'enum.maintenance': 'صيانة',
  'enum.retired': 'مسحوبة من الخدمة',
  'enum.utilized': 'قيد الاستخدام',
};
