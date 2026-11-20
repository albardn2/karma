// Public legal and support pages (/privacy, /support). Keys are prefixed with
// "legal.". Section bodies are plain text: a blank line starts a new paragraph
// and a line starting with "• " is a bullet. Arabic is Modern Standard Arabic,
// business register. In Arabic strings, Latin text (the domain, the email) is wrapped in
// U+2068/U+2069 isolation marks so the bidi algorithm keeps it in one piece, and the domain
// uses a non-breaking hyphen (U+2011) so it never wraps mid-word.

export const SUPPORT_EMAIL = 'zaid@karma-grp.com';

export const PRIVACY_SECTION_COUNT = 10;
export const SUPPORT_FAQ_COUNT = 5;

export const en: Record<string, string> = {
  'legal.brand': 'Karma Group',
  'legal.privacyLink': 'Privacy Policy',
  'legal.supportLink': 'Support',
  'legal.lastUpdated': 'Last updated: November 20, 2026',

  'legal.privacy.title': 'Privacy Policy',
  'legal.privacy.intro':
    'This policy explains what information the Karma Group app and website (crm-prod.karma-grp.com) collect, how it is used, and the choices you have. Karma Group is based in Syria. If you have any question about this policy, email us at {email}.',

  'legal.privacy.s1.title': 'Who we are',
  'legal.privacy.s1.body':
    'Karma Group provides software for companies that sell and deliver to their own customers. A company signs up, and its administrators invite their staff (for example sales staff and drivers). Each company only ever sees its own data.',

  'legal.privacy.s2.title': 'Information we collect',
  'legal.privacy.s2.body':
    '• Account information: your company name, first and last name, username, and password. An email address and phone number are optional. Passwords are stored as a one-way hash, never in readable form.\n• Business information your company enters: customers (names, phone numbers, addresses and map locations), orders, invoices, payments, stock, vehicles, trips, expenses and notes.\n• Location: see the next section.\n• Karma Assistant: if your company has the assistant turned on, the questions you type or say to it and its answers (including charts and maps) are saved so you can come back to them. When you speak to it, your phone\'s own speech service turns your voice into text; we receive only the text, never the recording. Using the microphone is optional and needs your permission.\n• Technical information: our servers record basic request data (such as IP address, time and the page or feature requested) to keep the service secure and to fix problems.',

  'legal.privacy.s3.title': 'Location information',
  'legal.privacy.s3.body':
    'The app uses your precise location to show your position on the trip map and to list the nearest customers when you add a stop.\n\nIf your company administrator turns on location tracking for your user (typically for drivers), the app also shares your location while you work, including when the app is in the background, so your company can follow trip progress on its live map. Points recorded during a trip are kept with that trip; other location history is deleted after a period your company sets (14 days by default).\n\nYour location is shown only to your own company. You can stop the app from using your location at any time in your device settings (Settings → Karma Group → Location).',

  'legal.privacy.s4.title': 'How we use information',
  'legal.privacy.s4.body':
    '• To provide the service: accounts, orders, invoices, trips, dashboards and live maps for your company.\n• To answer the questions you ask the Karma Assistant and, only after you approve each one, to make the changes you ask it to make.\n• To keep the service secure and working, and to answer support requests.\n• To manage your company\'s subscription.\n\nWe do not sell your information, we do not show advertising, and we do not track you across other companies\' apps or websites.',

  'legal.privacy.s5.title': 'Who can see your information',
  'legal.privacy.s5.body':
    '• Users of your own company, according to the roles and permissions your administrators set.\n• Karma Group administrators, only as needed to verify companies, provide support and manage billing.\n• Service providers that run parts of the service for us: server hosting, map display (Apple Maps or Google Maps), a real-time messaging service that relays live positions to your company\'s map, and an AI service (Anthropic) that the Karma Assistant uses to understand your questions and write its answers. For each question, it receives the question and the business information needed to answer it. They may only use the information to provide those services.\n\nWe may disclose information if the law requires it.',

  'legal.privacy.s6.title': 'How long we keep information',
  'legal.privacy.s6.body':
    'We keep your information while your company\'s account is active. Location history outside trips is deleted automatically as described above. Karma Assistant conversations are kept until you clear them in the assistant (Clear history) or your company\'s account is deleted. When a company account is deleted, its users can no longer sign in and its data is no longer available in the app; business records may be kept for as long as needed for legal and accounting purposes. You can ask us to erase them by emailing {email}.',

  'legal.privacy.s7.title': 'Deleting your account',
  'legal.privacy.s7.body':
    'A company administrator can delete the company account at any time in the app: Menu → Account settings → Delete company account. This signs out every user of the company and prevents them from signing in again. If you are not an administrator, ask your company\'s administrator, or email us at {email}.',

  'legal.privacy.s8.title': 'Your rights',
  'legal.privacy.s8.body':
    'You can ask us for a copy of your personal information, ask us to correct it, or ask us to delete it, by emailing {email}. Your company administrator can also update or remove your user.',

  'legal.privacy.s9.title': 'Security and children',
  'legal.privacy.s9.body':
    'Information is sent over encrypted connections (HTTPS), and access is limited by roles and permissions. No system is perfectly secure, so please keep your password private.\n\nThe service is for businesses and is not directed at children under 13.',

  'legal.privacy.s10.title': 'Changes to this policy',
  'legal.privacy.s10.body':
    'We may update this policy. The date at the top shows when it last changed. If a change is significant, we will let company administrators know in the app or by email.',

  'legal.support.title': 'Support',
  'legal.support.intro':
    'Need help with the Karma Group app or website? Email us and we will get back to you.',
  'legal.support.contactTitle': 'Contact us',
  'legal.support.contactBody':
    'Email {email} and include your company name, your username and what you need help with. A screenshot helps.',
  'legal.support.emailButton': 'Email support',
  'legal.support.faqTitle': 'Common questions',

  'legal.support.q1': 'How do I create an account?',
  'legal.support.a1':
    'Open the app or crm-prod.karma-grp.com and choose "Create a company account". You become the company\'s administrator and can add your staff afterwards.',
  'legal.support.q2': 'My app says "Account pending verification". What now?',
  'legal.support.a2':
    'Every new company is reviewed by our team before it can use the system. Once it is verified, tap "Check again" and the app opens. If it is taking long, email us.',
  'legal.support.q3': 'I forgot my password.',
  'legal.support.a3':
    'Ask your company administrator to set a new password for your user. If you are the administrator, email us from the address on your account.',
  'legal.support.q4': 'How do I delete my account?',
  'legal.support.a4':
    'A company administrator can delete the company account in the app: Menu → Account settings → Delete company account. See the Privacy Policy for what happens to your data.',
  'legal.support.q5': 'Why does the app ask for my location?',
  'legal.support.a5':
    'To show you on the trip map and find nearby customers. If your company tracks your trips, your position is shared with your company while you work. You can change location access in your device settings.',
};

export const ar: Record<string, string> = {
  'legal.brand': 'Karma Group',
  'legal.privacyLink': 'سياسة الخصوصية',
  'legal.supportLink': 'الدعم',
  'legal.lastUpdated': 'آخر تحديث: 20 نوفمبر 2026',

  'legal.privacy.title': 'سياسة الخصوصية',
  'legal.privacy.intro':
    'توضح هذه السياسة المعلومات التي يجمعها تطبيق Karma Group وموقعه (\u2068crm\u2011prod.karma\u2011grp.com\u2069)، وكيفية استخدامها، والخيارات المتاحة لك. مقر Karma Group في سوريا. لأي سؤال حول هذه السياسة، راسلنا على \u2068{email}\u2069.',

  'legal.privacy.s1.title': 'من نحن',
  'legal.privacy.s1.body':
    'تقدّم Karma Group برنامجًا للشركات التي تبيع وتوزّع لعملائها. تسجّل الشركة حسابها، ثم يضيف مسؤولوها موظفيهم (مثل مندوبي المبيعات والسائقين). ولا ترى كل شركة إلا بياناتها الخاصة.',

  'legal.privacy.s2.title': 'المعلومات التي نجمعها',
  'legal.privacy.s2.body':
    '• معلومات الحساب: اسم الشركة، والاسم الأول واسم العائلة، واسم المستخدم، وكلمة المرور. البريد الإلكتروني ورقم الهاتف اختياريان. تُحفظ كلمات المرور بتشفير أحادي الاتجاه ولا تُخزَّن أبدًا بشكل مقروء.\n• المعلومات التجارية التي تُدخلها شركتك: العملاء (الأسماء وأرقام الهواتف والعناوين ومواقعهم على الخريطة)، والطلبات، والفواتير، والدفعات، والمخزون، والمركبات، والرحلات، والمصاريف، والملاحظات.\n• الموقع: انظر القسم التالي.\n• مساعد Karma: إذا فعّلت شركتك المساعد، تُحفظ الأسئلة التي تكتبها له أو تقولها وإجاباته (بما فيها الرسوم البيانية والخرائط) لتتمكن من الرجوع إليها. عندما تتحدث إليه، تحوّل خدمة الكلام في هاتفك صوتك إلى نص؛ ولا نستلم إلا النص، ولا نستلم التسجيل الصوتي أبدًا. استخدام الميكروفون اختياري ويتطلب إذنك.\n• المعلومات التقنية: تسجّل خوادمنا بيانات أساسية عن الطلبات (مثل عنوان IP والوقت والصفحة أو الميزة المطلوبة) للحفاظ على أمان الخدمة وإصلاح المشكلات.',

  'legal.privacy.s3.title': 'معلومات الموقع',
  'legal.privacy.s3.body':
    'يستخدم التطبيق موقعك الدقيق لعرض موقعك على خريطة الرحلة ولإظهار أقرب العملاء عند إضافة محطة.\n\nإذا فعّل مسؤول شركتك تتبّع الموقع لمستخدمك (عادةً للسائقين)، يشارك التطبيق موقعك أيضًا أثناء العمل، بما في ذلك عندما يكون التطبيق في الخلفية، لتتمكن شركتك من متابعة سير الرحلة على خريطتها المباشرة. تُحفظ النقاط المسجّلة أثناء الرحلة مع تلك الرحلة، أما سجل المواقع الآخر فيُحذف بعد مدة تحددها شركتك (14 يومًا افتراضيًا).\n\nلا يظهر موقعك إلا لشركتك. يمكنك منع التطبيق من استخدام موقعك في أي وقت من إعدادات جهازك (الإعدادات ← Karma Group ← الموقع).',

  'legal.privacy.s4.title': 'كيف نستخدم المعلومات',
  'legal.privacy.s4.body':
    '• لتقديم الخدمة: الحسابات والطلبات والفواتير والرحلات ولوحات المعلومات والخرائط المباشرة لشركتك.\n• للإجابة عن الأسئلة التي تطرحها على مساعد Karma، ولإجراء التغييرات التي تطلبها منه، وذلك فقط بعد موافقتك على كل تغيير.\n• للحفاظ على أمان الخدمة وعملها، وللرد على طلبات الدعم.\n• لإدارة اشتراك شركتك.\n\nنحن لا نبيع معلوماتك، ولا نعرض إعلانات، ولا نتتبّعك عبر تطبيقات أو مواقع شركات أخرى.',

  'legal.privacy.s5.title': 'من يمكنه رؤية معلوماتك',
  'legal.privacy.s5.body':
    '• مستخدمو شركتك، حسب الأدوار والصلاحيات التي يحددها مسؤولوك.\n• مسؤولو Karma Group، فقط بالقدر اللازم للتحقق من الشركات وتقديم الدعم وإدارة الفوترة.\n• مزوّدو خدمات يشغّلون أجزاء من الخدمة لصالحنا: استضافة الخوادم، وعرض الخرائط (خرائط Apple أو خرائط Google)، وخدمة مراسلة فورية تنقل المواقع المباشرة إلى خريطة شركتك، وخدمة ذكاء اصطناعي (Anthropic) يستخدمها مساعد Karma لفهم أسئلتك وكتابة إجاباته. وتستلم هذه الخدمة مع كل سؤال نصَّ السؤال والمعلومات التجارية اللازمة للإجابة عنه. ولا يحق لهم استخدام المعلومات إلا لتقديم تلك الخدمات.\n\nقد نفصح عن المعلومات إذا اقتضى القانون ذلك.',

  'legal.privacy.s6.title': 'مدة الاحتفاظ بالمعلومات',
  'legal.privacy.s6.body':
    'نحتفظ بمعلوماتك ما دام حساب شركتك نشطًا. ويُحذف سجل المواقع خارج الرحلات تلقائيًا كما هو موضح أعلاه. وتُحفظ محادثات مساعد Karma إلى أن تمسحها من المساعد (مسح السجل) أو يُحذف حساب شركتك. عند حذف حساب شركة، لا يعود بإمكان مستخدميها تسجيل الدخول ولا تبقى بياناتها متاحة في التطبيق، وقد نحتفظ بالسجلات التجارية للمدة اللازمة لأغراض قانونية ومحاسبية. ويمكنك أن تطلب منا محوها بمراسلتنا على \u2068{email}\u2069.',

  'legal.privacy.s7.title': 'حذف حسابك',
  'legal.privacy.s7.body':
    'يمكن لمسؤول الشركة حذف حساب الشركة في أي وقت من التطبيق: القائمة ← إعدادات الحساب ← حذف حساب الشركة. يؤدي ذلك إلى تسجيل خروج جميع مستخدمي الشركة ومنعهم من تسجيل الدخول مجددًا. إن لم تكن مسؤولًا، فاطلب ذلك من مسؤول شركتك، أو راسلنا على \u2068{email}\u2069.',

  'legal.privacy.s8.title': 'حقوقك',
  'legal.privacy.s8.body':
    'يمكنك أن تطلب منا نسخة من معلوماتك الشخصية، أو تصحيحها، أو حذفها، بمراسلتنا على \u2068{email}\u2069. كما يمكن لمسؤول شركتك تعديل مستخدمك أو إزالته.',

  'legal.privacy.s9.title': 'الأمان والأطفال',
  'legal.privacy.s9.body':
    'تُرسَل المعلومات عبر اتصالات مشفّرة (HTTPS)، ويُقيَّد الوصول بالأدوار والصلاحيات. لا يوجد نظام آمن تمامًا، لذا يُرجى الحفاظ على سرية كلمة مرورك.\n\nالخدمة موجّهة للشركات وليست موجّهة للأطفال دون 13 عامًا.',

  'legal.privacy.s10.title': 'التغييرات على هذه السياسة',
  'legal.privacy.s10.body':
    'قد نحدّث هذه السياسة. يوضح التاريخ في الأعلى آخر تغيير لها. وإذا كان التغيير جوهريًا، فسنُعلم مسؤولي الشركات في التطبيق أو عبر البريد الإلكتروني.',

  'legal.support.title': 'الدعم',
  'legal.support.intro': 'هل تحتاج إلى مساعدة في تطبيق Karma Group أو موقعه؟ راسلنا وسنرد عليك.',
  'legal.support.contactTitle': 'تواصل معنا',
  'legal.support.contactBody':
    'راسلنا على \u2068{email}\u2069 واذكر اسم شركتك واسم المستخدم وما تحتاج المساعدة فيه. ولقطة شاشة تساعدنا كثيرًا.',
  'legal.support.emailButton': 'راسل الدعم',
  'legal.support.faqTitle': 'أسئلة شائعة',

  'legal.support.q1': 'كيف أنشئ حسابًا؟',
  'legal.support.a1':
    'افتح التطبيق أو \u2068crm\u2011prod.karma\u2011grp.com\u2069 واختر "إنشاء حساب شركة". تصبح مسؤول الشركة ويمكنك إضافة موظفيك بعد ذلك.',
  'legal.support.q2': 'يظهر في التطبيق "الحساب بانتظار التحقق". ماذا أفعل؟',
  'legal.support.a2':
    'يراجع فريقنا كل شركة جديدة قبل أن تتمكن من استخدام النظام. بعد التحقق، اضغط "التحقق مرة أخرى" فيُفتح التطبيق. وإن طال الأمر، راسلنا.',
  'legal.support.q3': 'نسيت كلمة المرور.',
  'legal.support.a3':
    'اطلب من مسؤول شركتك تعيين كلمة مرور جديدة لمستخدمك. وإن كنت أنت المسؤول، فراسلنا من البريد المسجّل في حسابك.',
  'legal.support.q4': 'كيف أحذف حسابي؟',
  'legal.support.a4':
    'يمكن لمسؤول الشركة حذف حساب الشركة من التطبيق: القائمة ← إعدادات الحساب ← حذف حساب الشركة. راجع سياسة الخصوصية لمعرفة ما يحدث لبياناتك.',
  'legal.support.q5': 'لماذا يطلب التطبيق موقعي؟',
  'legal.support.a5':
    'لعرضك على خريطة الرحلة وإيجاد العملاء القريبين. وإذا كانت شركتك تتابع رحلاتك، فيُشارَك موقعك مع شركتك أثناء العمل. ويمكنك تغيير صلاحية الموقع من إعدادات جهازك.',
};
