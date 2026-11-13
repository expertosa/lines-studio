// Live products shown on the work page. Screenshots live in /public/work.
// The only shipped vertical film is the Experto launch sample; other cards use their screenshot.
export const launchVideo = {
  src: '/video/launch-3d-ar.mp4',
  poster: '/video/launch-3d-ar.webp',
};

export const workCategories = [
  { id: 'all', ar: 'الكل', en: 'All' },
  { id: 'ai', ar: 'ذكاء اصطناعي', en: 'AI' },
  { id: 'business', ar: 'أعمال', en: 'Business' },
  { id: 'apps', ar: 'تطبيقات', en: 'Apps' },
  { id: 'platforms', ar: 'منصات', en: 'Platforms' },
];

export const works = [
  {
    id: 'mashhad',
    cat: 'ai',
    featured: 1,
    url: 'https://video.opps.dev',
    image: '/work/mashhad.webp',
    name: { ar: 'مَشهد', en: 'Mashhad' },
    alt: { ar: 'معاينة واجهة مشهد، استوديو فيديو عربي', en: 'Preview of the Mashhad video studio homepage' },
    desc: {
      ar: 'استوديو فيديو عربي: تكتب الفكرة، ونسلّم فيديو جاهز بسعر ثابت.',
      en: 'An Arabic video studio: write the idea, get a finished video at a fixed price.',
    },
  },
  {
    id: 'abeet',
    cat: 'platforms',
    featured: 2,
    url: 'https://abeet.ai',
    image: '/work/abeet.webp',
    name: { ar: 'أبيت', en: 'Abeet' },
    alt: { ar: 'معاينة واجهة أبيت للبحث عن العقار', en: 'Preview of the Abeet property search homepage' },
    desc: {
      ar: 'محرك بحث للعقارات في مدن السعودية: بيع، إيجار، ومزادات.',
      en: 'A property search for Saudi cities: sales, rentals and auctions.',
    },
  },
  {
    id: 'logis',
    cat: 'business',
    featured: 3,
    url: 'https://logis.experto.sa',
    image: '/work/logis.webp',
    name: { ar: 'لوجيس', en: 'Logis' },
    alt: { ar: 'معاينة واجهة لوجيس لتشغيل نقل البضائع', en: 'Preview of the Logis freight homepage' },
    desc: {
      ar: 'تشغيل نقل البضائع من التعيين حتى إثبات التسليم والفاتورة.',
      en: 'Freight operations from assignment to proof of delivery and the invoice.',
    },
  },
  {
    id: 'salis',
    cat: 'apps',
    featured: 4,
    url: 'https://salis.apps.experto.sa',
    image: '/work/salis.webp',
    name: { ar: 'سَلِس', en: 'Salis' },
    alt: { ar: 'معاينة واجهة تطبيق سلس للمهام والأهداف', en: 'Preview of the Salis tasks app homepage' },
    desc: {
      ar: 'مهامك وتقويمك واجتماعاتك وأهدافك في تطبيق واحد.',
      en: 'Tasks, calendar, meetings and goals in one app.',
    },
  },
  {
    id: 'skilloop',
    cat: 'ai',
    url: 'https://skilloop.opps.dev',
    image: '/work/skilloop.webp',
    name: { ar: 'سكيلوب', en: 'Skilloop' },
    alt: { ar: 'معاينة واجهة سكيلوب للتدريب اليومي على الذكاء الاصطناعي', en: 'Preview of the Skilloop daily AI practice homepage' },
    desc: {
      ar: 'حلقة يومية من عشر دقائق تخلي الذكاء الاصطناعي عادة في شغلك.',
      en: 'A daily ten-minute loop that turns AI into a work habit.',
    },
  },
  {
    id: 'ai-ads',
    cat: 'ai',
    url: 'https://ai-ads.apps.experto.sa',
    image: '/work/ai-ads.webp',
    name: { ar: 'إيه آي أدز', en: 'AI Ads' },
    alt: { ar: 'معاينة واجهة إيه آي أدز لصناعة الإعلانات', en: 'Preview of the AI Ads homepage' },
    desc: {
      ar: 'من رابط منتجك إلى إعلان جاهز بمقاسات الشبكات، بدون تسجيل.',
      en: 'Turn a product link into ready-to-post ads, with no sign-up.',
    },
  },
  {
    id: 'marketeer',
    cat: 'ai',
    url: 'https://marketeer.opps.dev',
    image: '/work/marketeer.webp',
    name: { ar: 'ماركتير', en: 'Marketeer' },
    alt: { ar: 'معاينة واجهة ماركتير للوصول إلى العملاء', en: 'Preview of the Marketeer homepage' },
    desc: {
      ar: 'يجد العملاء المحتملين ويراسلهم ويتابع الردود في منصة واحدة.',
      en: 'Finds prospects, reaches them and tracks replies in one platform.',
    },
  },
  {
    id: 'saudibot',
    cat: 'ai',
    url: 'https://saudibot.apps.experto.sa',
    image: '/work/saudibot.webp',
    name: { ar: 'سعودي بوت', en: 'SaudiBot' },
    alt: { ar: 'معاينة واجهة سعودي بوت للسؤال عن الأنظمة', en: 'Preview of the SaudiBot regulations homepage' },
    desc: {
      ar: 'اسأل عن الأنظمة السعودية واطلع على المادة من مصدرها الرسمي.',
      en: 'Ask about Saudi regulations and open the article from its official source.',
    },
  },
  {
    id: 'mizan',
    cat: 'business',
    url: 'https://mizan.experto.sa',
    image: '/work/mizan.webp',
    name: { ar: 'ميزان', en: 'Mizan' },
    alt: { ar: 'معاينة واجهة ميزان للخدمات القانونية', en: 'Preview of the Mizan legal services homepage' },
    desc: {
      ar: 'منظومة سحابية للاستشارات والخدمات القانونية ومكاتب المحاماة.',
      en: 'A cloud system for legal consultations, services and law firms.',
    },
  },
  {
    id: 'hi',
    cat: 'business',
    url: 'https://hi.experto.sa',
    image: '/work/hi.webp',
    name: { ar: 'دعم اكسبرتو', en: 'Experto Support' },
    alt: { ar: 'معاينة واجهة دعم اكسبرتو لصندوق محادثات العملاء', en: 'Preview of the Experto Support inbox homepage' },
    desc: {
      ar: 'صندوق واحد لواتساب وتذاكر الموقع ودردشة العملاء.',
      en: 'One inbox for WhatsApp, site tickets and customer chat.',
    },
  },
  {
    id: 'randevu',
    cat: 'business',
    url: 'https://hajzat.apps.experto.sa',
    image: '/work/randevu.webp',
    name: { ar: 'رندفو', en: 'Randevu' },
    alt: { ar: 'معاينة واجهة رندفو لحجوزات الصالونات والعيادات', en: 'Preview of the Randevu bookings homepage' },
    desc: {
      ar: 'حجوزات الصالونات والعيادات: مواعيد، فروع، وفريق في لوحة واحدة.',
      en: 'Bookings for salons and clinics: appointments, branches and staff in one desk.',
    },
  },
  {
    id: 'experto',
    cat: 'business',
    url: 'https://experto.sa',
    image: '/work/experto.webp',
    video: launchVideo.src,
    poster: launchVideo.poster,
    name: { ar: 'اكسبرتو', en: 'Experto' },
    alt: { ar: 'معاينة واجهة موقع اكسبرتو لخدمات الذكاء الاصطناعي', en: 'Preview of the Experto company homepage' },
    desc: {
      ar: 'موقع الشركة لخدمات الذكاء الاصطناعي وتطوير البرمجيات.',
      en: 'The company site for AI services and custom software.',
    },
  },
  {
    id: 'qwam',
    cat: 'apps',
    url: 'https://qwam.opps.dev',
    image: '/work/qwam.webp',
    name: { ar: 'قَوام', en: 'Qwam' },
    alt: { ar: 'معاينة واجهة تطبيق قوام للتأهيل واللياقة', en: 'Preview of the Qwam fitness app homepage' },
    desc: {
      ar: 'تأهيل ولياقة بالعربية على الجوال، والكاميرا تعدّ التكرار على جهازك.',
      en: 'Arabic rehab and fitness on your phone, with on-device rep counting.',
    },
  },
  {
    id: 'terminalctrl',
    cat: 'apps',
    url: 'https://terminalctrl.apps.experto.sa',
    image: '/work/terminalctrl.webp',
    name: { ar: 'تيرمنال سي تي آر إل', en: 'Terminal CTRL' },
    alt: { ar: 'معاينة واجهة تيرمنال سي تي آر إل لطرفية SSH', en: 'Preview of the Terminal CTRL homepage' },
    desc: {
      ar: 'طرفية SSH عربية تتصل بخادمك مباشرة، بلا حساب.',
      en: 'An Arabic SSH terminal that connects straight to your server, with no account.',
    },
  },
  {
    id: 'dhad',
    cat: 'platforms',
    url: 'https://dhad.opps.dev',
    image: '/work/dhad.webp',
    name: { ar: 'خدمات لغة الضاد', en: 'Dhad Hub' },
    alt: { ar: 'معاينة واجهة منصة خدمات لغة الضاد', en: 'Preview of the Dhad Hub homepage' },
    desc: {
      ar: 'منصة عربية للأدوات والنماذج والجهات التي تخدم اللغة.',
      en: 'An Arabic hub for language tools, models and institutions.',
    },
  },
  {
    id: 'nashr',
    cat: 'platforms',
    url: 'https://opps.dev',
    image: '/work/nashr.webp',
    name: { ar: 'نشر', en: 'Nashr' },
    alt: { ar: 'معاينة واجهة نشر من GitHub إلى رابط حي', en: 'Preview of the Nashr deploy homepage' },
    desc: {
      ar: 'من مستودع GitHub إلى رابط حي مع HTTPS خلال ثوانٍ.',
      en: 'From a GitHub repo to a live HTTPS URL in seconds.',
    },
  },
];

export const featuredWorks = works.filter((item) => item.featured).sort((a, b) => a.featured - b.featured);
