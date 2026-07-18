// "misc" domain: login, legacy Orders/Invoices/Reports pages, the 404 page
// and the app-wide error boundary. Arabic is Modern Standard Arabic in a
// business register, kept consistent with the mobile app (login wording ported
// from expo_app/i18n/translations.ts).

export const en: Record<string, string> = {
  // shared across the legacy list pages
  'misc.customer': 'Customer',
  'misc.searchAdjust': 'Try adjusting your search terms',

  // login page
  'misc.login.invalidRfidTitle': 'Invalid RFID',
  'misc.login.invalidRfidDesc': 'RFID code is too short',
  'misc.login.failedTitle': 'Login Failed',
  'misc.login.invalidRfidCode': 'Invalid RFID code. Please try again or use manual login.',
  'misc.login.networkErrorTitle': 'Network Error',
  'misc.login.networkErrorDesc': 'Unable to connect to the server. Please check your connection.',
  'misc.login.fillAllFields': 'Please fill in all fields',
  'misc.login.invalidCredentials': 'Invalid username or password. Please check your credentials.',
  'misc.login.rfidAuth': 'RFID Authentication',
  'misc.login.welcomeBack': 'Welcome Back',
  'misc.login.rfidSubtitle': 'Tap your card to continue',
  'misc.login.subtitle': 'Sign in to continue to your account',
  'misc.login.rfidTab': 'RFID Scan',
  'misc.login.manualTab': 'Username & Password',
  'misc.login.authenticating': 'Authenticating...',
  'misc.login.scanning': 'Scanning...',
  'misc.login.readyToScan': 'Ready to scan',
  'misc.login.positionCard': 'Position your RFID card near the reader',
  'misc.login.usernameOrEmail': 'Username or Email',
  'misc.login.usernamePlaceholder': 'Enter your username or email',
  'misc.login.passwordPlaceholder': 'Enter your password',
  'misc.login.signingIn': 'Signing In...',
  'misc.login.useManualInstead': 'Use username and password instead',

  // orders page
  'misc.orders.title': 'Orders',
  'misc.orders.subtitle': 'Manage customer orders and fulfillment',
  'misc.orders.create': 'Create Order',
  'misc.orders.searchPlaceholder': 'Search orders...',
  'misc.orders.orderId': 'Order ID',
  'misc.orders.created': 'Created',
  'misc.orders.noneFound': 'No orders found',
  'misc.orders.emptyHint': 'Get started by creating your first order',

  // invoices page
  'misc.invoices.title': 'Invoices',
  'misc.invoices.subtitle': 'Manage invoices and payments',
  'misc.invoices.generate': 'Generate Invoice',
  'misc.invoices.searchPlaceholder': 'Search invoices...',
  'misc.invoices.invoiceId': 'Invoice ID',
  'misc.invoices.dueDate': 'Due Date',
  'misc.invoices.noDueDate': 'No due date',
  'misc.invoices.noneFound': 'No invoices found',
  'misc.invoices.emptyHint': 'Get started by generating your first invoice',

  // reports page
  'misc.reports.title': 'Reports',
  'misc.reports.subtitle': 'Analyze your business performance and trends',
  'misc.reports.revenueReport': 'Revenue Report',
  'misc.reports.revenueReportDesc': 'Monthly and yearly revenue analysis',
  'misc.reports.customerAnalytics': 'Customer Analytics',
  'misc.reports.customerAnalyticsDesc': 'Customer acquisition and retention metrics',
  'misc.reports.salesPerformance': 'Sales Performance',
  'misc.reports.salesPerformanceDesc': 'Sales trends and performance indicators',
  'misc.reports.inventoryReport': 'Inventory Report',
  'misc.reports.inventoryReportDesc': 'Material usage and inventory levels',
  'misc.reports.totalRevenue': 'Total Revenue',
  'misc.reports.revenueChange': '+12.5% from last month',
  'misc.reports.activeOrders': 'Active Orders',
  'misc.reports.pendingFulfillment': '8 pending fulfillment',
  'misc.reports.totalCustomers': 'Total Customers',
  'misc.reports.newThisWeek': '+6 new this week',
  'misc.reports.overdueInvoices': 'Overdue Invoices',
  'misc.reports.totalDue': '$8,450 total due',
  'misc.reports.viewReport': 'View Report',
  'misc.reports.revenueTrend': 'Revenue Trend',
  'misc.reports.revenueChart': 'Revenue Chart',
  'misc.reports.chartPlaceholder': 'Chart implementation needed',
  'misc.reports.customerGrowth': 'Customer Growth',
  'misc.reports.customerGrowthChart': 'Customer Growth Chart',

  // 404 page
  'misc.notFound.title': '404 Page Not Found',
  'misc.notFound.hint': 'Did you forget to add the page to the router?',

  // error boundary
  'misc.error.goBack': 'Go back',
  'misc.error.reload': 'Reload',
};

export const ar: Record<string, string> = {
  // shared across the legacy list pages
  'misc.customer': 'العميل',
  'misc.searchAdjust': 'حاول تعديل مصطلحات البحث',

  // login page
  'misc.login.invalidRfidTitle': 'بطاقة RFID غير صالحة',
  'misc.login.invalidRfidDesc': 'رمز RFID قصير جداً',
  'misc.login.failedTitle': 'فشل تسجيل الدخول',
  'misc.login.invalidRfidCode': 'رمز RFID غير صالح. يرجى المحاولة مرة أخرى أو استخدام تسجيل الدخول اليدوي.',
  'misc.login.networkErrorTitle': 'خطأ في الشبكة',
  'misc.login.networkErrorDesc': 'تعذر الاتصال بالخادم. يرجى التحقق من اتصالك.',
  'misc.login.fillAllFields': 'يرجى تعبئة جميع الحقول',
  'misc.login.invalidCredentials': 'اسم المستخدم أو كلمة المرور غير صحيحة. يرجى التحقق من بياناتك.',
  'misc.login.rfidAuth': 'مصادقة RFID',
  'misc.login.welcomeBack': 'مرحباً بعودتك',
  'misc.login.rfidSubtitle': 'المس بطاقتك للمتابعة',
  'misc.login.subtitle': 'سجّل الدخول للمتابعة إلى حسابك',
  'misc.login.rfidTab': 'مسح RFID',
  'misc.login.manualTab': 'اسم المستخدم وكلمة المرور',
  'misc.login.authenticating': 'جارٍ المصادقة...',
  'misc.login.scanning': 'جارٍ المسح...',
  'misc.login.readyToScan': 'جاهز للمسح',
  'misc.login.positionCard': 'ضع بطاقة RFID بالقرب من القارئ',
  'misc.login.usernameOrEmail': 'اسم المستخدم أو البريد الإلكتروني',
  'misc.login.usernamePlaceholder': 'أدخل اسم المستخدم أو البريد الإلكتروني',
  'misc.login.passwordPlaceholder': 'أدخل كلمة المرور',
  'misc.login.signingIn': 'جارٍ تسجيل الدخول...',
  'misc.login.useManualInstead': 'استخدم اسم المستخدم وكلمة المرور بدلاً من ذلك',

  // orders page
  'misc.orders.title': 'الطلبات',
  'misc.orders.subtitle': 'إدارة طلبات العملاء وتنفيذها',
  'misc.orders.create': 'إنشاء طلب',
  'misc.orders.searchPlaceholder': 'البحث في الطلبات...',
  'misc.orders.orderId': 'رقم الطلب',
  'misc.orders.created': 'تاريخ الإنشاء',
  'misc.orders.noneFound': 'لا توجد طلبات',
  'misc.orders.emptyHint': 'ابدأ بإنشاء طلبك الأول',

  // invoices page
  'misc.invoices.title': 'الفواتير',
  'misc.invoices.subtitle': 'إدارة الفواتير والمدفوعات',
  'misc.invoices.generate': 'إنشاء فاتورة',
  'misc.invoices.searchPlaceholder': 'البحث في الفواتير...',
  'misc.invoices.invoiceId': 'رقم الفاتورة',
  'misc.invoices.dueDate': 'تاريخ الاستحقاق',
  'misc.invoices.noDueDate': 'لا يوجد تاريخ استحقاق',
  'misc.invoices.noneFound': 'لا توجد فواتير',
  'misc.invoices.emptyHint': 'ابدأ بإنشاء فاتورتك الأولى',

  // reports page
  'misc.reports.title': 'التقارير',
  'misc.reports.subtitle': 'حلّل أداء عملك واتجاهاته',
  'misc.reports.revenueReport': 'تقرير الإيرادات',
  'misc.reports.revenueReportDesc': 'تحليل الإيرادات الشهرية والسنوية',
  'misc.reports.customerAnalytics': 'تحليلات العملاء',
  'misc.reports.customerAnalyticsDesc': 'مقاييس اكتساب العملاء والاحتفاظ بهم',
  'misc.reports.salesPerformance': 'أداء المبيعات',
  'misc.reports.salesPerformanceDesc': 'اتجاهات المبيعات ومؤشرات الأداء',
  'misc.reports.inventoryReport': 'تقرير المخزون',
  'misc.reports.inventoryReportDesc': 'استخدام المواد ومستويات المخزون',
  'misc.reports.totalRevenue': 'إجمالي الإيرادات',
  'misc.reports.revenueChange': '+12.5% عن الشهر الماضي',
  'misc.reports.activeOrders': 'الطلبات النشطة',
  'misc.reports.pendingFulfillment': '8 قيد التنفيذ',
  'misc.reports.totalCustomers': 'إجمالي العملاء',
  'misc.reports.newThisWeek': '+6 جدد هذا الأسبوع',
  'misc.reports.overdueInvoices': 'الفواتير المتأخرة',
  'misc.reports.totalDue': '$8,450 مستحقة إجمالاً',
  'misc.reports.viewReport': 'عرض التقرير',
  'misc.reports.revenueTrend': 'اتجاه الإيرادات',
  'misc.reports.revenueChart': 'مخطط الإيرادات',
  'misc.reports.chartPlaceholder': 'يلزم تنفيذ المخطط',
  'misc.reports.customerGrowth': 'نمو العملاء',
  'misc.reports.customerGrowthChart': 'مخطط نمو العملاء',

  // 404 page
  'misc.notFound.title': '404 الصفحة غير موجودة',
  'misc.notFound.hint': 'هل نسيت إضافة الصفحة إلى الموجّه؟',

  // error boundary
  'misc.error.goBack': 'العودة',
  'misc.error.reload': 'إعادة التحميل',
};
