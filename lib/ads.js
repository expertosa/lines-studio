// «إعلانات»: ad localization for the Saudi market. Page copy, the request form and the MCP tool read this file.
// Kinds, presets and dialects match services/creative-api/src/engines/localize.js (a test keeps them in sync).

export const adSwapKinds = [
  { id: 'character', ar: 'الشخصيات', en: 'Characters', dAr: 'نبدّل الممثلين بشخصيات سعودية، رجال ونساء وعوائل.', dEn: 'Swap the cast for Saudi characters: men, women and families.' },
  { id: 'outfit', ar: 'اللبس', en: 'Outfits', dAr: 'ثوب وشماغ، عباية، أو لبس كاجوال يناسب الشارع هنا.', dEn: 'Thobe and shemagh, abaya, or casual wear that fits here.' },
  { id: 'product', ar: 'المنتج', en: 'Product', dAr: 'نحط منتجك أو عبوتك مكان المنتج اللي في الإعلان الأصلي.', dEn: 'Put your product or pack in place of the one in the original ad.' },
  { id: 'background', ar: 'الخلفية', en: 'Background', dAr: 'البوليفارد، الكورنيش، العلا، أبها، أو مجلس بيت سعودي.', dEn: 'Boulevard, Corniche, AlUla, Abha, or a Saudi home majlis.' },
];

export const adPresets = {
  character: [
    { id: 'saudi-man', ar: 'رجل سعودي', en: 'Saudi man' },
    { id: 'saudi-woman', ar: 'امرأة سعودية', en: 'Saudi woman' },
    { id: 'saudi-family', ar: 'عائلة سعودية', en: 'Saudi family' },
    { id: 'saudi-youth', ar: 'شباب سعوديين', en: 'Saudi youth' },
  ],
  outfit: [
    { id: 'thobe-shemagh', ar: 'ثوب وشماغ', en: 'Thobe and shemagh' },
    { id: 'thobe-ghutra', ar: 'ثوب وغترة', en: 'Thobe and ghutra' },
    { id: 'abaya', ar: 'عباية', en: 'Abaya' },
    { id: 'saudi-casual', ar: 'كاجوال', en: 'Casual' },
    { id: 'saudi-sport', ar: 'رياضي', en: 'Sportswear' },
  ],
  product: [],
  background: [
    { id: 'riyadh-boulevard', ar: 'بوليفارد الرياض', en: 'Riyadh Boulevard' },
    { id: 'riyadh-kafd', ar: 'المركز المالي بالرياض', en: 'KAFD, Riyadh' },
    { id: 'jeddah-corniche', ar: 'كورنيش جدة', en: 'Jeddah Corniche' },
    { id: 'alula', ar: 'العلا', en: 'AlUla' },
    { id: 'abha', ar: 'أبها', en: 'Abha' },
    { id: 'saudi-home-majlis', ar: 'مجلس بيت سعودي', en: 'Saudi home majlis' },
    { id: 'saudi-cafe', ar: 'مقهى سعودي', en: 'Saudi café' },
  ],
};

export const adDialects = [
  { id: 'najdi', ar: 'نجدي', en: 'Najdi' },
  { id: 'hijazi', ar: 'حجازي', en: 'Hijazi' },
  { id: 'janoubi', ar: 'جنوبي', en: 'Southern' },
  { id: 'sharqawi', ar: 'شرقاوي', en: 'Eastern' },
  { id: 'white', ar: 'لهجة بيضاء', en: 'Neutral Saudi' },
];

/** Kinds that change a person or a voice. They need the client's confirmation that they hold the rights. */
export function needsLikenessConsent({ kinds = [], dub = false }) {
  return dub || kinds.includes('character');
}

const label = (list, id, lang) => list.find((x) => x.id === id)?.[lang] || id;

/** WhatsApp text for an ad localization request. Same text from the page form and the MCP tool. */
export function adRequestMessage({ lang = 'ar', name, phone, city, adUrl, kinds = [], presets = {}, dialect, captions, dub, details, consent, viaAgent = false }) {
  const ar = lang === 'ar';
  const kindText = kinds.map((k) => {
    const base = label(adSwapKinds, k, lang);
    const preset = presets[k] ? label(adPresets[k] || [], presets[k], lang) : null;
    return preset ? `${base} (${preset})` : base;
  }).join('، ');
  return [
    ar ? 'السلام عليكم، أبي أوطّن إعلان فيديو للسوق السعودي:' : 'Hi, I want to localize a video ad for the Saudi market:',
    `• ${ar ? 'الاسم' : 'Name'}: ${name}`,
    city && `• ${ar ? 'المدينة' : 'City'}: ${city}`,
    `• ${ar ? 'الجوال' : 'Mobile'}: ${phone}`,
    adUrl && `• ${ar ? 'رابط الإعلان' : 'Ad link'}: ${adUrl}`,
    kinds.length > 0 && `• ${ar ? 'وش نبدّل' : 'Swap'}: ${kindText}`,
    dialect && `• ${ar ? 'اللهجة' : 'Dialect'}: ${label(adDialects, dialect, lang)}`,
    captions && `• ${ar ? 'ترجمة على الفيديو' : 'Captions'}: ${ar ? 'نعم' : 'Yes'}`,
    dub && `• ${ar ? 'تعليق صوتي باللهجة' : 'Dialect voice-over'}: ${ar ? 'نعم' : 'Yes'}`,
    details && `• ${ar ? 'تفاصيل' : 'Details'}: ${details}`,
    consent && `• ${ar ? 'أؤكد إن عندي حق تعديل الأشخاص والأصوات في الإعلان' : 'I confirm I hold the rights to change the people and voices in this ad'}`,
    viaAgent && (ar ? '(الطلب من وكيل ذكاء اصطناعي عبر MCP)' : '(Sent from an AI agent via MCP)'),
  ].filter(Boolean).join('\n');
}

export const adsCopy = {
  ar: {
    nav: 'إعلانات',
    metaTitle: 'إعلانات | توطين إعلانات الفيديو للسوق السعودي · خطوط ستوديو',
    metaDesc: 'عندك إعلان فيديو جاهز؟ نطلع منه نسخة سعودية: شخصيات ولبس محلي، منتجاتك، خلفيات من مدن المملكة، وترجمة باللهجة.',
    badge: 'إعلانات · توطين للسوق السعودي',
    t1: 'إعلانك الجاهز،',
    t2: 'بنسخة سعودية',
    sub: 'بدل ما تصوّر من جديد، نطلع من إعلانك الحالي نسخة تناسب السوق هنا: شخصيات سعودية، لبس محلي، منتجاتك مكان المنتج الأصلي، وخلفيات من الرياض وجدة والعلا، مع ترجمة وتعليق صوتي باللهجة.',
    cta: 'اطلب نسخة سعودية',
    swapT: 'وش نقدر نبدّل',
    swapS: 'تختار وش يتغيّر في الإعلان، والباقي يبقى زي ما هو.',
    howT: 'كيف نشتغل',
    how: [
      { t: 'ترسل الإعلان', d: 'رابط الإعلان ووش تبي يتغيّر فيه، من النموذج تحت أو على الواتساب.' },
      { t: 'نراجع الحقوق والإمكانية', d: 'نتأكد إن عندك حق تعديل الإعلان والأشخاص اللي فيه، ونرد عليك بعرض سعر ومدة.' },
      { t: 'تراجع قبل النشر', d: 'تستلم النسخة السعودية وتعتمدها أو تطلب تعديل قبل ما تنشرها.' },
    ],
    rulesT: 'قواعدنا في تعديل الأشخاص',
    rules: [
      'ما نبدّل وجه أو صوت شخص حقيقي بدون موافقة مكتوبة منه أو ممن يملك حقوق الإعلان.',
      'ما نسوي نسخ تنسب كلام أو موقف لشخص ما قاله.',
      'نوضح لك في التسليم إن الإعلان معدّل بالذكاء الاصطناعي، عشان تقرر كيف تفصح عنه في منصات الإعلان.',
    ],
    formT: 'اطلب نسخة سعودية من إعلانك',
    formS: 'الطلب يوصلنا على الواتساب، والسعر حسب الطلب بعد ما نشوف الإعلان.',
    name: 'اسم النشاط', namePh: 'مثال: محمصة الديرة',
    phone: 'رقم الجوال', phonePh: '05XXXXXXXX',
    city: 'المدينة', cityPh: 'الرياض',
    adUrl: 'رابط الإعلان', adUrlPh: 'https://…', adUrlHint: 'رابط يوتيوب أو درايف أو أي رابط نقدر نفتحه. لو ما عندك رابط، أرسله لنا على الواتساب.',
    kindsL: 'وش تبي نبدّل؟',
    presetL: 'الاختيار',
    presetAny: 'نقترح عليك',
    dialectL: 'اللهجة',
    captions: 'ترجمة عربية على الفيديو',
    dub: 'تعليق صوتي باللهجة',
    details: 'تفاصيل إضافية', detailsPh: 'مثال: المنتج علبة قهوة 250 جرام، والإعلان لرمضان',
    consent: 'أؤكد إن عندي حق تعديل الأشخاص والأصوات في هذا الإعلان',
    errName: 'اكتب اسم النشاط',
    errPhone: 'اكتب رقم الجوال',
    errPhoneFormat: 'اكتب رقم جوال سعودي صحيح يبدأ بـ 05',
    errUrl: 'الرابط لازم يبدأ بـ https://',
    errKinds: 'اختر شي واحد على الأقل نبدّله، أو اطلب ترجمة أو تعليق صوتي',
    errConsent: 'تبديل الشخصيات أو الصوت يحتاج تأكيدك إن عندك الحق',
    required: 'كمّل الحقول المطلوبة',
    price: 'السعر: حسب الطلب',
    submit: 'أرسل الطلب على الواتساب',
    note: 'ما يوصلنا شي إلا لما ترسل الرسالة من الواتساب.',
    faqT: 'أسئلة متكررة',
    faq: [
      { q: 'كم السعر؟', a: 'حسب طول الإعلان وعدد العناصر اللي تتبدّل. نرسل لك عرض سعر بعد ما نشوف الإعلان، وما تدفع شي قبل ما توافق عليه.' },
      { q: 'وش نوع الإعلانات اللي تنفع؟', a: 'إعلانات فيديو قصيرة مصوّرة، مثل إعلانات السوشال ميديا. نرد عليك بصراحة لو الإعلان ما ينفع يتعدّل بجودة كويسة.' },
      { q: 'أقدر أطلبها من وكيل ذكاء اصطناعي؟', a: 'إيه. خدمة MCP حقتنا فيها أداة request_ad_localization، تجهّز رابط طلب على الواتساب وأنت ترسله بنفسك.' },
    ],
  },
  en: {
    nav: 'Ads',
    metaTitle: 'Ads | Localize video ads for Saudi Arabia · Lines Studio',
    metaDesc: 'Have a video ad already? We make a Saudi version: local characters and outfits, your products, backgrounds from Saudi cities, and dialect captions.',
    badge: 'Ads · Saudi localization',
    t1: 'Your existing ad,',
    t2: 'in a Saudi version',
    sub: 'Instead of a new shoot, we turn your current ad into one that fits here: Saudi characters, local outfits, your product in place of the original, and backgrounds from Riyadh, Jeddah and AlUla, with dialect captions and voice-over.',
    cta: 'Request a Saudi version',
    swapT: 'What we can swap',
    swapS: 'You pick what changes. The rest of the ad stays as it is.',
    howT: 'How it works',
    how: [
      { t: 'Send the ad', d: 'The ad link and what you want changed, from the form below or on WhatsApp.' },
      { t: 'We check rights and feasibility', d: 'We confirm you hold the rights to edit the ad and the people in it, then reply with a quote and timeline.' },
      { t: 'Review before you publish', d: 'You get the Saudi version and approve it or ask for changes before it goes out.' },
    ],
    rulesT: 'Our rules for changing people',
    rules: [
      'We do not swap a real person’s face or voice without written consent from them or the ad’s rights holder.',
      'We do not make versions that put words or positions in someone’s mouth.',
      'We tell you at delivery that the ad was edited with AI, so you can decide how to disclose it on ad platforms.',
    ],
    formT: 'Request a Saudi version of your ad',
    formS: 'The request reaches us on WhatsApp. Pricing is per request, after we see the ad.',
    name: 'Business name', namePh: 'e.g. Al Deira Roastery',
    phone: 'Mobile', phonePh: '05XXXXXXXX',
    city: 'City', cityPh: 'Riyadh',
    adUrl: 'Ad link', adUrlPh: 'https://…', adUrlHint: 'YouTube, Drive or any link we can open. No link? Send the file on WhatsApp.',
    kindsL: 'What should we swap?',
    presetL: 'Choice',
    presetAny: 'Suggest one',
    dialectL: 'Dialect',
    captions: 'Arabic captions on the video',
    dub: 'Dialect voice-over',
    details: 'More details', detailsPh: 'e.g. the product is a 250 g coffee pack, the ad is for Ramadan',
    consent: 'I confirm I hold the rights to change the people and voices in this ad',
    errName: 'Enter the business name',
    errPhone: 'Enter a mobile number',
    errPhoneFormat: 'Enter a valid Saudi mobile starting with 05',
    errUrl: 'The link must start with https://',
    errKinds: 'Pick at least one thing to swap, or ask for captions or a voice-over',
    errConsent: 'Swapping characters or the voice needs your confirmation that you hold the rights',
    required: 'Complete the required fields',
    price: 'Price: per request',
    submit: 'Send the request on WhatsApp',
    note: 'Nothing reaches us until you send the message from WhatsApp.',
    faqT: 'FAQ',
    faq: [
      { q: 'How much is it?', a: 'It depends on the ad length and how many elements change. We send a quote after we see the ad, and you pay nothing before you approve it.' },
      { q: 'Which ads work?', a: 'Short filmed video ads, like social media ads. We tell you plainly if an ad cannot be edited at good quality.' },
      { q: 'Can an AI agent request it?', a: 'Yes. Our MCP server has a request_ad_localization tool that prepares a WhatsApp request link; you send it yourself.' },
    ],
  },
};
