// Platform-owner assignment of which dashboards each role sees.
//
// Distinct from rolePresets.ts: that governs what a role may DO (menu modules and
// per-resource CRUD); this governs which dashboards a role is SHOWN. Both are
// platform-wide and take effect on the user's next request via the perms-version
// fingerprint — no deploy.

export const en: Record<string, string> = {
  'roleDashboards.tab': 'Dashboards per role',
  'roleDashboards.intro':
    'Which dashboards each role sees, in the app and the web. Admins and the platform owner always see every dashboard, so they are not listed. Changes apply on the user’s next request — no deploy needed.',
  'roleDashboards.loadFailed': 'Could not load dashboard assignments.',
  'roleDashboards.saved': 'Dashboard assignment updated',
  'roleDashboards.reset': 'Role returned to its default dashboards',
  'roleDashboards.saveFailed': 'Could not save dashboard assignment.',
  'roleDashboards.customised': 'Customised',
  'roleDashboards.default': 'Default',
  'roleDashboards.following': '{count} user(s) follow this role',
  'roleDashboards.assignedCount': '{count} of {total} dashboards',
  'roleDashboards.resetToDefault': 'Reset to default',
  'roleDashboards.affectsWarning':
    'Saving changes what {count} user(s) see, on their next request.',
};

export const ar: Record<string, string> = {
  'roleDashboards.tab': 'لوحات المعلومات حسب الدور',
  'roleDashboards.intro':
    'اللوحات التي يراها كل دور، في التطبيق والويب. يرى مديرو النظام ومالك المنصة كل اللوحات دائماً، لذا لا يظهرون هنا. تُطبَّق التغييرات عند الطلب التالي للمستخدم — دون نشر.',
  'roleDashboards.loadFailed': 'تعذر تحميل تخصيص اللوحات.',
  'roleDashboards.saved': 'تم تحديث تخصيص اللوحات',
  'roleDashboards.reset': 'تمت إعادة الدور إلى لوحاته الافتراضية',
  'roleDashboards.saveFailed': 'تعذر حفظ تخصيص اللوحات.',
  'roleDashboards.customised': 'مُعدَّل',
  'roleDashboards.default': 'الإعداد الافتراضي',
  'roleDashboards.following': '{count} مستخدم يتبع هذا الدور',
  'roleDashboards.assignedCount': '{count} من {total} لوحات',
  'roleDashboards.resetToDefault': 'إعادة إلى الافتراضي',
  'roleDashboards.affectsWarning':
    'الحفظ سيغيّر ما يراه {count} مستخدم، عند طلبهم التالي.',
};
