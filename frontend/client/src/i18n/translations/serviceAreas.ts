// Service Areas domain strings (pages/ServiceAreas.tsx,
// pages/ServiceAreaDetail.tsx, components/service-areas/*).

export const en: Record<string, string> = {
  // List page
  'serviceAreas.areasCount': '{count} areas',
  'serviceAreas.listView': 'List View',
  'serviceAreas.mapView': 'Map View',
  'serviceAreas.noAreasFound': 'No service areas found',
  'serviceAreas.noMatchFilters': 'No service areas match your current filters. Try adjusting your search criteria.',
  'serviceAreas.emptyGetStarted': 'Get started by adding your first service area to define coverage regions.',
  'serviceAreas.areaId': 'Area ID: {id}',
  'serviceAreas.createdBy': 'Created By',
  'serviceAreas.na': 'N/A',
  'serviceAreas.active': 'Active',
  'serviceAreas.deleted': 'Deleted',
  'serviceAreas.firstPage': 'First',
  'serviceAreas.lastPage': 'Last',
  'serviceAreas.pageOf': 'Page {page} of {pages}',
  'serviceAreas.showingAreas': 'Showing {from} to {to} of {total} areas',

  // Detail page
  'serviceAreas.detailsTitle': 'Service Area Details',
  'serviceAreas.notFound': 'Service Area Not Found',
  'serviceAreas.backToServiceAreas': 'Back to Service Areas',
  'serviceAreas.deleteConfirmDescription': 'This action cannot be undone. This will permanently delete the service area.',
  'serviceAreas.information': 'Service Area Information',
  'serviceAreas.uuid': 'UUID',
  'serviceAreas.geometryWkt': 'Geometry (WKT)',
  'serviceAreas.geometry': 'Geometry',
  'serviceAreas.editPolygonHint': 'Edit the polygon on the map to update the service area',
  'serviceAreas.map': 'Service Area Map',

  // Toasts (create / update / delete / copy)
  'serviceAreas.updateSuccess': 'Service area updated successfully',
  'serviceAreas.deleteSuccess': 'Service area deleted successfully',
  'serviceAreas.createSuccess': 'Service area created successfully',
  'serviceAreas.drawPolygonError': 'Please draw a polygon on the map',
  'serviceAreas.copied': 'Copied',
  'serviceAreas.copiedToClipboard': '{label} copied to clipboard',
  'serviceAreas.copyFailed': 'Failed to copy to clipboard',

  // Add dialog
  'serviceAreas.addServiceArea': 'Add Service Area',
  'serviceAreas.addNew': 'Add New Service Area',
  'serviceAreas.enterName': 'Enter service area name',
  'serviceAreas.descriptionOptional': 'Description (Optional)',
  'serviceAreas.enterDescription': 'Enter service area description',
  'serviceAreas.drawPolygonHint': 'Draw a polygon on the map to define the service area',
  'serviceAreas.createServiceArea': 'Create Service Area',
  'serviceAreas.nameRequired': 'Name is required',
  'serviceAreas.geometryRequired': 'Geometry is required',

  // Maps
  'serviceAreas.invalidGeometry': 'Invalid geometry data',
  'serviceAreas.geometryValue': 'Geometry: {value}',
  'serviceAreas.boundary': 'Service Area Boundary',
  'serviceAreas.popupCreated': 'Created: {date}',
  'serviceAreas.popupId': 'ID: {id}',
  'serviceAreas.drawError': "<strong>Oh snap!</strong> you can't draw that!",

  // Filters sheet
  'serviceAreas.filterServiceAreas': 'Filter Service Areas',
  'serviceAreas.enterUuid': 'Enter service area UUID',
  'serviceAreas.createdByUuid': 'Created By UUID',
  'serviceAreas.enterCreatorUuid': 'Enter creator UUID',
  'serviceAreas.intersectsPolygon': 'Intersects Polygon (WKT)',
  'serviceAreas.enterWktPolygon': 'Enter WKT polygon',
  'serviceAreas.itemsPerPage': 'Items per page',
  'serviceAreas.selectItemsPerPage': 'Select items per page',
  'serviceAreas.perPageOption': '{count} per page',
  'serviceAreas.totalAreas': '{count} total areas',
  'serviceAreas.applyFilters': 'Apply Filters',
  'serviceAreas.clear': 'Clear',
};

export const ar: Record<string, string> = {
  // List page
  'serviceAreas.areasCount': 'عدد المناطق: {count}',
  'serviceAreas.listView': 'عرض القائمة',
  'serviceAreas.mapView': 'عرض الخريطة',
  'serviceAreas.noAreasFound': 'لم يتم العثور على مناطق خدمة',
  'serviceAreas.noMatchFilters': 'لا توجد مناطق خدمة تطابق عوامل التصفية الحالية. حاول تعديل معايير البحث.',
  'serviceAreas.emptyGetStarted': 'ابدأ بإضافة أول منطقة خدمة لتحديد مناطق التغطية.',
  'serviceAreas.areaId': 'معرّف المنطقة: {id}',
  'serviceAreas.createdBy': 'أُنشئت بواسطة',
  'serviceAreas.na': 'غير متوفر',
  'serviceAreas.active': 'فعّالة',
  'serviceAreas.deleted': 'محذوفة',
  'serviceAreas.firstPage': 'الأولى',
  'serviceAreas.lastPage': 'الأخيرة',
  'serviceAreas.pageOf': 'الصفحة {page} من {pages}',
  'serviceAreas.showingAreas': 'عرض {from} إلى {to} من {total} منطقة',

  // Detail page
  'serviceAreas.detailsTitle': 'تفاصيل منطقة الخدمة',
  'serviceAreas.notFound': 'منطقة الخدمة غير موجودة',
  'serviceAreas.backToServiceAreas': 'العودة إلى مناطق الخدمة',
  'serviceAreas.deleteConfirmDescription': 'لا يمكن التراجع عن هذا الإجراء. سيؤدي ذلك إلى حذف منطقة الخدمة نهائياً.',
  'serviceAreas.information': 'معلومات منطقة الخدمة',
  'serviceAreas.uuid': 'المعرّف الفريد (UUID)',
  'serviceAreas.geometryWkt': 'الشكل الهندسي (WKT)',
  'serviceAreas.geometry': 'الشكل الهندسي',
  'serviceAreas.editPolygonHint': 'عدّل المضلع على الخريطة لتحديث منطقة الخدمة',
  'serviceAreas.map': 'خريطة منطقة الخدمة',

  // Toasts (create / update / delete / copy)
  'serviceAreas.updateSuccess': 'تم تحديث منطقة الخدمة بنجاح',
  'serviceAreas.deleteSuccess': 'تم حذف منطقة الخدمة بنجاح',
  'serviceAreas.createSuccess': 'تم إنشاء منطقة الخدمة بنجاح',
  'serviceAreas.drawPolygonError': 'يرجى رسم مضلع على الخريطة',
  'serviceAreas.copied': 'تم النسخ',
  'serviceAreas.copiedToClipboard': 'تم نسخ {label} إلى الحافظة',
  'serviceAreas.copyFailed': 'فشل النسخ إلى الحافظة',

  // Add dialog
  'serviceAreas.addServiceArea': 'إضافة منطقة خدمة',
  'serviceAreas.addNew': 'إضافة منطقة خدمة جديدة',
  'serviceAreas.enterName': 'أدخل اسم منطقة الخدمة',
  'serviceAreas.descriptionOptional': 'الوصف (اختياري)',
  'serviceAreas.enterDescription': 'أدخل وصف منطقة الخدمة',
  'serviceAreas.drawPolygonHint': 'ارسم مضلعاً على الخريطة لتحديد منطقة الخدمة',
  'serviceAreas.createServiceArea': 'إنشاء منطقة الخدمة',
  'serviceAreas.nameRequired': 'الاسم مطلوب',
  'serviceAreas.geometryRequired': 'الشكل الهندسي مطلوب',

  // Maps
  'serviceAreas.invalidGeometry': 'بيانات الشكل الهندسي غير صالحة',
  'serviceAreas.geometryValue': 'الشكل الهندسي: {value}',
  'serviceAreas.boundary': 'حدود منطقة الخدمة',
  'serviceAreas.popupCreated': 'أُنشئت: {date}',
  'serviceAreas.popupId': 'المعرّف: {id}',
  'serviceAreas.drawError': '<strong>عذراً!</strong> لا يمكنك رسم ذلك!',

  // Filters sheet
  'serviceAreas.filterServiceAreas': 'تصفية مناطق الخدمة',
  'serviceAreas.enterUuid': 'أدخل معرّف منطقة الخدمة',
  'serviceAreas.createdByUuid': 'معرّف المُنشئ (UUID)',
  'serviceAreas.enterCreatorUuid': 'أدخل معرّف المُنشئ',
  'serviceAreas.intersectsPolygon': 'يتقاطع مع مضلع (WKT)',
  'serviceAreas.enterWktPolygon': 'أدخل مضلع WKT',
  'serviceAreas.itemsPerPage': 'عدد العناصر في الصفحة',
  'serviceAreas.selectItemsPerPage': 'اختر عدد العناصر في الصفحة',
  'serviceAreas.perPageOption': '{count} في الصفحة',
  'serviceAreas.totalAreas': 'إجمالي المناطق: {count}',
  'serviceAreas.applyFilters': 'تطبيق عوامل التصفية',
  'serviceAreas.clear': 'مسح',
};
