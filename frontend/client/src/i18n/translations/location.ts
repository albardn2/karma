// Location domain: live map, trip/user location playback, tracking settings,
// and the entity map popups (customer / vendor / warehouse / trip stops).
// Arabic is Modern Standard Arabic, terminology kept consistent with the
// mobile app (expo_app/i18n/translations.ts): live=مباشر, playback=إعادة العرض,
// stops=المحطات, driver=السائق.

export const en: Record<string, string> = {
  // live map (LiveMap.tsx)
  'location.liveSubtitle': 'Live positions of location-tracked drivers',
  'location.connecting': 'Connecting',
  'location.connected': 'Connected',
  'location.disconnected': 'Disconnected',
  'location.driverVisible': '{count} driver visible',
  'location.driversVisible': '{count} drivers visible',
  'location.notConfigured': 'Location tracking is not configured (missing broker settings).',
  'location.failedLoadConfig': 'Failed to load location tracking configuration',
  'location.lastSeenSecondsAgo': 'Last seen {n}s ago',
  'location.lastSeenMinutesAgo': 'Last seen {n}m ago',
  'location.lastSeenHoursAgo': 'Last seen {n}h ago',
  'location.kmh': '{speed} km/h',

  // user location history (UserLocationHistory.tsx)
  'location.historyTitle': 'Location History',
  'location.timeRange': 'Time Range',
  'location.from': 'From',
  'location.to': 'To',
  'location.adminsOnly': 'Admins only',
  'location.loadingHistory': 'Loading location history...',
  'location.failedLoadHistory': 'Failed to load location history.',
  'location.noPointsInWindow': 'No location points in this window.',
  'location.pointCountOne': '{count} point',
  'location.pointCountOther': '{count} points',
  'location.pointOfTotal': ' (of {total} total)',

  // tracking settings (LocationTrackingSettings.tsx)
  'location.errMustBeNumber': 'Must be a number',
  'location.errMustBeWholeNumber': 'Must be a whole number',
  'location.errMinOneSecond': 'Must be at least 1 second',
  'location.errMinOneDay': 'Must be at least 1 day',
  'location.settingsUpdated': 'Location tracking settings updated successfully',
  'location.failedUpdateSettings': 'Failed to update location tracking settings',
  'location.loadingSettings': 'Loading location tracking settings...',
  'location.settingsTitle': 'Location Tracking Settings',
  'location.settingsSubtitle':
    'Global configuration for how user location data is stored and retained.',
  'location.settingsNote':
    "These settings apply to all users. The live publish cadence (how often the mobile app sends location updates for a specific user) is configured per user on the user's page.",
  'location.storageConfig': 'Storage Configuration',
  'location.tripCadence': 'Trip cadence (seconds)',
  'location.tripCadencePlaceholder': 'Enter trip cadence in seconds',
  'location.tripCadenceDesc': 'Spacing of stored points during a trip',
  'location.historyCadence': 'History cadence (seconds)',
  'location.historyCadencePlaceholder': 'Enter history cadence in seconds',
  'location.historyCadenceDesc': 'Spacing of stored points outside trips',
  'location.historyRetention': 'History retention (days)',
  'location.historyRetentionPlaceholder': 'Enter retention period in days',
  'location.historyRetentionDesc':
    'How far back user history is kept; trip points are kept forever',
  'location.lastUpdated': 'Last updated: {date}',
  'location.saveSettings': 'Save Settings',

  // playback (LocationPlayback.tsx)
  'location.noPointsRecorded': 'No location points recorded.',
  'location.pause': 'Pause',
  'location.play': 'Play',
  'location.playbackSpeed': '{speed}x',

  // trip / user live+playback (TripLocationMap.tsx, UserLocationMap.tsx)
  'location.live': 'Live',
  'location.playback': 'Playback',
  'location.noTripPoints': 'No location points recorded for this trip.',
  'location.liveUnavailableNoDriver':
    'Live tracking is unavailable: this trip has no assigned driver.',
  'location.resolvingDriver': 'Resolving the assigned driver…',
  'location.connectingEllipsis': 'Connecting…',
  'location.driver': 'Driver',
  'location.lastSeenSeconds': 'last seen {sec}s ago',
  'location.waitingDriver': "Waiting for the driver's app to report…",
  'location.trailLegend':
    'Grey line: stored trip path · Green line: live movement since this page opened',
  'location.liveOffNote':
    'Live is off — location tracking is disabled for this user. ',
  'location.playbackLast7Days': 'Playback shows the last 7 days',
  'location.customRange': 'custom range',
  'location.noPointsLast7Days': 'No location points in the last 7 days.',

  // entity map popups / empty states (components/map/*)
  'location.noCustomerLocation': 'No location data available for this customer',
  'location.invalidCustomerCoords': 'Invalid customer coordinates',
  'location.customerLocation': 'Customer Location',
  'location.latitudeLabel': 'Latitude: {value}',
  'location.longitudeLabel': 'Longitude: {value}',
  'location.noWaypoints': 'No waypoints available for this trip',
  'location.invalidWaypoints': 'Invalid waypoint data',
  'location.fullRoute': 'Full Route',
  'location.animatedRoute': 'Animated Route',
  'location.stopXofY': 'Stop {current} of {total}',
  'location.stopN': 'Stop {n}',
  'location.noStopLocations': 'No stop locations for this trip.',
  'location.showAll': 'Show all',
  'location.stopsProgress': '{shown} / {total} stops',
  'location.unknownCustomer': 'Unknown customer',
  'location.completedAt': 'Completed {time}',
  'location.noWarehouseLocation': 'No location data available for this warehouse',
  'location.createdLabel': 'Created: {date}',

  // vendor category enum values (te())
  'enum.raw_materials': 'Raw Materials',
  'enum.equipment': 'Equipment',
  'enum.services': 'Services',
  'enum.other': 'Other',
};

export const ar: Record<string, string> = {
  // live map (LiveMap.tsx)
  'location.liveSubtitle': 'المواقع المباشرة للسائقين المتتبَّعين',
  'location.connecting': 'جارٍ الاتصال',
  'location.connected': 'متصل',
  'location.disconnected': 'غير متصل',
  'location.driverVisible': 'سائق واحد ظاهر',
  'location.driversVisible': 'السائقون الظاهرون: {count}',
  'location.notConfigured': 'تتبّع الموقع غير مُهيأ (إعدادات الوسيط مفقودة).',
  'location.failedLoadConfig': 'فشل تحميل إعدادات تتبّع الموقع',
  'location.lastSeenSecondsAgo': 'آخر ظهور قبل {n} ث',
  'location.lastSeenMinutesAgo': 'آخر ظهور قبل {n} د',
  'location.lastSeenHoursAgo': 'آخر ظهور قبل {n} س',
  'location.kmh': '{speed} كم/س',

  // user location history (UserLocationHistory.tsx)
  'location.historyTitle': 'سجل المواقع',
  'location.timeRange': 'النطاق الزمني',
  'location.from': 'من',
  'location.to': 'إلى',
  'location.adminsOnly': 'للمدراء فقط',
  'location.loadingHistory': 'جارٍ تحميل سجل المواقع...',
  'location.failedLoadHistory': 'فشل تحميل سجل المواقع.',
  'location.noPointsInWindow': 'لا توجد نقاط مواقع في هذه الفترة.',
  'location.pointCountOne': '{count} نقطة',
  'location.pointCountOther': '{count} نقطة',
  'location.pointOfTotal': ' (من أصل {total})',

  // tracking settings (LocationTrackingSettings.tsx)
  'location.errMustBeNumber': 'يجب أن يكون رقماً',
  'location.errMustBeWholeNumber': 'يجب أن يكون رقماً صحيحاً',
  'location.errMinOneSecond': 'يجب ألا يقل عن ثانية واحدة',
  'location.errMinOneDay': 'يجب ألا يقل عن يوم واحد',
  'location.settingsUpdated': 'تم تحديث إعدادات تتبّع الموقع بنجاح',
  'location.failedUpdateSettings': 'فشل تحديث إعدادات تتبّع الموقع',
  'location.loadingSettings': 'جارٍ تحميل إعدادات تتبّع الموقع...',
  'location.settingsTitle': 'إعدادات تتبّع الموقع',
  'location.settingsSubtitle':
    'الإعدادات العامة لكيفية تخزين بيانات مواقع المستخدمين والاحتفاظ بها.',
  'location.settingsNote':
    'تنطبق هذه الإعدادات على جميع المستخدمين. أما وتيرة النشر المباشر (كم مرة يرسل تطبيق الجوال تحديثات الموقع لمستخدم محدد) فتُضبط لكل مستخدم على صفحته.',
  'location.storageConfig': 'إعدادات التخزين',
  'location.tripCadence': 'وتيرة الرحلة (بالثواني)',
  'location.tripCadencePlaceholder': 'أدخل وتيرة الرحلة بالثواني',
  'location.tripCadenceDesc': 'المسافة الزمنية بين النقاط المخزنة أثناء الرحلة',
  'location.historyCadence': 'وتيرة السجل (بالثواني)',
  'location.historyCadencePlaceholder': 'أدخل وتيرة السجل بالثواني',
  'location.historyCadenceDesc': 'المسافة الزمنية بين النقاط المخزنة خارج الرحلات',
  'location.historyRetention': 'مدة الاحتفاظ بالسجل (بالأيام)',
  'location.historyRetentionPlaceholder': 'أدخل مدة الاحتفاظ بالأيام',
  'location.historyRetentionDesc':
    'إلى أي مدى يُحتفظ بسجل المستخدم؛ أما نقاط الرحلات فتُحفظ إلى الأبد',
  'location.lastUpdated': 'آخر تحديث: {date}',
  'location.saveSettings': 'حفظ الإعدادات',

  // playback (LocationPlayback.tsx)
  'location.noPointsRecorded': 'لا توجد نقاط مواقع مسجلة.',
  'location.pause': 'إيقاف مؤقت',
  'location.play': 'تشغيل',
  'location.playbackSpeed': '{speed}x',

  // trip / user live+playback (TripLocationMap.tsx, UserLocationMap.tsx)
  'location.live': 'مباشر',
  'location.playback': 'إعادة العرض',
  'location.noTripPoints': 'لا توجد نقاط مواقع مسجلة لهذه الرحلة.',
  'location.liveUnavailableNoDriver':
    'التتبّع المباشر غير متاح: لا يوجد سائق معيّن لهذه الرحلة.',
  'location.resolvingDriver': 'جارٍ تحديد السائق المعيّن…',
  'location.connectingEllipsis': 'جارٍ الاتصال…',
  'location.driver': 'السائق',
  'location.lastSeenSeconds': 'آخر ظهور قبل {sec} ث',
  'location.waitingDriver': 'بانتظار إشارة تطبيق السائق…',
  'location.trailLegend':
    'الخط الرمادي: مسار الرحلة المخزّن · الخط الأخضر: الحركة المباشرة منذ فتح هذه الصفحة',
  'location.liveOffNote':
    'التتبّع المباشر متوقف — تتبّع الموقع معطّل لهذا المستخدم. ',
  'location.playbackLast7Days': 'تعرض إعادة العرض آخر 7 أيام',
  'location.customRange': 'نطاق مخصص',
  'location.noPointsLast7Days': 'لا توجد نقاط مواقع في آخر 7 أيام.',

  // entity map popups / empty states (components/map/*)
  'location.noCustomerLocation': 'لا تتوفر بيانات موقع لهذا العميل',
  'location.invalidCustomerCoords': 'إحداثيات العميل غير صالحة',
  'location.customerLocation': 'موقع العميل',
  'location.latitudeLabel': 'خط العرض: {value}',
  'location.longitudeLabel': 'خط الطول: {value}',
  'location.noWaypoints': 'لا توجد نقاط مسار لهذه الرحلة',
  'location.invalidWaypoints': 'بيانات نقاط المسار غير صالحة',
  'location.fullRoute': 'المسار الكامل',
  'location.animatedRoute': 'مسار متحرك',
  'location.stopXofY': 'المحطة {current} من {total}',
  'location.stopN': 'المحطة {n}',
  'location.noStopLocations': 'لا توجد مواقع محطات لهذه الرحلة.',
  'location.showAll': 'عرض الكل',
  'location.stopsProgress': '{shown} / {total} محطة',
  'location.unknownCustomer': 'عميل غير معروف',
  'location.completedAt': 'اكتملت في {time}',
  'location.noWarehouseLocation': 'لا تتوفر بيانات موقع لهذا المستودع',
  'location.createdLabel': 'تاريخ الإنشاء: {date}',

  // vendor category enum values (te())
  'enum.raw_materials': 'مواد خام',
  'enum.equipment': 'معدات',
  'enum.services': 'خدمات',
  'enum.other': 'أخرى',
};
