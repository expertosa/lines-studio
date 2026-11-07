// Gallery items. Each one drives a card preview and the order page.
export const categories = [
  { id: 'all', ar: 'الكل', en: 'All' },
  { id: 'clinic', ar: 'عيادات', en: 'Clinics' },
  { id: 'food', ar: 'مطاعم ومقاهي', en: 'Food & cafés' },
  { id: 'realestate', ar: 'عقار', en: 'Real estate' },
  { id: 'startup', ar: 'شركات ناشئة', en: 'Startups' },
  { id: 'store', ar: 'متاجر', en: 'Stores' },
];

export const designs = [
  {
    id: 'naqaa', cat: 'clinic',
    name: { ar: 'نقاء', en: 'Naqaa' },
    desc: { ar: 'عيادة أسنان: حجز مواعيد، فريق الأطباء، الخدمات والأسعار.', en: 'Dental clinic: bookings, doctors, services and prices.' },
    c: { accent: '#2B7A9C', tint: '#E3F0F5', bg: '#FFFFFF', ink: '#D9E2E6', head: '#111111' },
  },
  {
    id: 'afia', cat: 'clinic',
    name: { ar: 'عافية', en: 'Afia' },
    desc: { ar: 'مركز تجميل وجلدية: قبل وبعد، الباقات، واتساب مباشر.', en: 'Derma & beauty center: before/after, packages, WhatsApp.' },
    c: { accent: '#B5577A', tint: '#F7E6EC', bg: '#FFFDFB', ink: '#EADDE2', head: '#111111' },
  },
  {
    id: 'sufra', cat: 'food',
    name: { ar: 'سفرة', en: 'Sufra' },
    desc: { ar: 'مطعم: منيو بالصور، الفروع على الخريطة، روابط التوصيل.', en: 'Restaurant: photo menu, branches map, delivery links.' },
    c: { accent: '#E0A526', tint: '#3A2E1A', bg: '#1B1712', ink: '#3B342B', head: '#F2F2F2' },
  },
  {
    id: 'qahwa', cat: 'food',
    name: { ar: 'قهوة الحي', en: 'Qahwat Alhay' },
    desc: { ar: 'مقهى مختص: قائمة المحاصيل، برنامج الولاء، المواقع.', en: 'Specialty café: origins, loyalty program, locations.' },
    c: { accent: '#8A5A3B', tint: '#F2E8DF', bg: '#FBF8F4', ink: '#E7DED5', head: '#111111' },
  },
  {
    id: 'muftah', cat: 'realestate',
    name: { ar: 'مفتاح', en: 'Muftah' },
    desc: { ar: 'مكتب عقاري: عروض بالفلاتر، صفحة لكل عقار، تواصل سريع.', en: 'Real estate office: filtered listings, property pages.' },
    c: { accent: '#0F6B4F', tint: '#E4F1EC', bg: '#FFFFFF', ink: '#DDE5E1', head: '#111111' },
  },
  {
    id: 'ofoq', cat: 'realestate',
    name: { ar: 'أفق', en: 'Ofoq' },
    desc: { ar: 'مشروع سكني: مخططات الوحدات، جولة بالصور، تسجيل اهتمام.', en: 'Residential project: unit plans, photo tour, interest form.' },
    c: { accent: '#C9A86A', tint: '#26303B', bg: '#141A21', ink: '#2C3540', head: '#F2F2F2' },
  },
  {
    id: 'itlaq', cat: 'startup',
    name: { ar: 'إطلاق', en: 'Itlaq' },
    desc: { ar: 'شركة SaaS: صفحة هبوط، الأسعار، الأسئلة الشائعة، قائمة انتظار.', en: 'SaaS: landing page, pricing, FAQ, waitlist.' },
    c: { accent: '#4B4FD8', tint: '#ECECFB', bg: '#FFFFFF', ink: '#E1E1EC', head: '#111111' },
  },
  {
    id: 'souq', cat: 'store',
    name: { ar: 'سوق', en: 'Souq' },
    desc: { ar: 'متجر أزياء: واجهة منتجات، مجموعات موسمية، يربط مع سلة أو زد.', en: 'Fashion store: product grid, seasonal drops, Salla/Zid ready.' },
    c: { accent: '#111111', tint: '#F0EDE6', bg: '#FFFFFF', ink: '#E3E3DE', head: '#111111' },
  },
];

export const sizes = [
  { id: 'one', price: 1900, days: 3, label: { ar: 'صفحة وحدة', en: 'One page' }, hint: { ar: 'صفحة هبوط لنشاطك', en: 'A landing page for your business' } },
  { id: 'five', price: 4900, days: 4, label: { ar: 'حتى 5 صفحات', en: 'Up to 5 pages' }, hint: { ar: 'الرئيسية، الخدمات، من نحن، تواصل…', en: 'Home, services, about, contact…' } },
  { id: 'ten', price: 8900, days: 5, label: { ar: '10 صفحات أو أكثر', en: '10+ pages' }, hint: { ar: 'موقع كامل مع مدونة أو فروع', en: 'Full site with blog or branches' } },
];
