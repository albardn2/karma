// Platform-owner editing of what each role means by default.
//
// Distinct from the per-user permission strings in users.ts: those describe one
// person's checklist, these describe the default every user of a role inherits.

export const en: Record<string, string> = {
  'rolePresets.tab': 'Roles',
  'rolePresets.intro':
    "Default permissions for each role. Anyone with that role and no permissions of their own is governed by these, and changes apply immediately — no deploy needed. Editing a user's own checklist still overrides their role.",
  'rolePresets.loadFailed': 'Could not load role defaults.',
  'rolePresets.saved': 'Role defaults updated',
  'rolePresets.reset': 'Role returned to its generated default',
  'rolePresets.saveFailed': 'Could not save role defaults.',
  'rolePresets.customised': 'Customised',
  'rolePresets.default': 'Generated default',
  'rolePresets.following': '{count} user(s) follow this role',
  'rolePresets.summary': '{modules} menu module(s), {resources} resource(s) granted',
  'rolePresets.resetToDefault': 'Reset to default',
  'rolePresets.loadBaseline': 'Load generated default',
  'rolePresets.affectsWarning':
    'Saving changes what {count} user(s) can do, on their next request.',
};

export const ar: Record<string, string> = {
  'rolePresets.tab': 'الأدوار',
  'rolePresets.intro':
    'الصلاحيات الافتراضية لكل دور. كل مستخدم يحمل هذا الدور وليست له صلاحيات خاصة يخضع لهذه الإعدادات، والتغييرات تُطبَّق فوراً دون نشر. تعديل صلاحيات مستخدم بعينه يبقى مقدَّماً على دوره.',
  'rolePresets.loadFailed': 'تعذر تحميل إعدادات الأدوار الافتراضية.',
  'rolePresets.saved': 'تم تحديث الصلاحيات الافتراضية للدور',
  'rolePresets.reset': 'تمت إعادة الدور إلى إعداده الأصلي',
  'rolePresets.saveFailed': 'تعذر حفظ الصلاحيات الافتراضية للدور.',
  'rolePresets.customised': 'مُعدَّل',
  'rolePresets.default': 'الإعداد الأصلي',
  'rolePresets.following': '{count} مستخدم يتبع هذا الدور',
  'rolePresets.summary': '{modules} وحدة قائمة، {resources} مورد مسموح',
  'rolePresets.resetToDefault': 'إعادة إلى الأصل',
  'rolePresets.loadBaseline': 'تحميل الإعداد الأصلي',
  'rolePresets.affectsWarning':
    'الحفظ سيغيّر ما يمكن لـ {count} مستخدم فعله، عند طلبهم التالي.',
};
