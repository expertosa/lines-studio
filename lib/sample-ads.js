import data from './sample-ads.json';

export const adCategories = [
  { id: 'all', ar: 'الكل', en: 'All' },
  { id: 'restaurant', ar: 'مطاعم', en: 'Restaurants' },
  { id: 'cafe', ar: 'مقاهي', en: 'Cafés' },
  { id: 'perfume', ar: 'عطور', en: 'Perfumes' },
  { id: 'abaya', ar: 'عبايات', en: 'Abayas' },
  { id: 'estate', ar: 'عقار', en: 'Real estate' },
  { id: 'clinic', ar: 'عيادات', en: 'Clinics' },
  { id: 'shop', ar: 'متاجر', en: 'Shops' },
  { id: 'app', ar: 'تطبيقات', en: 'Apps' },
  { id: 'gym', ar: 'رياضة', en: 'Fitness' },
  { id: 'event', ar: 'فعاليات', en: 'Events' },
];

export const sampleAds = data.ads.map((ad) => ({
  ...ad,
  poster: `/ads/${ad.id}.webp`,
  video: `/ads/${ad.id}.mp4`,
}));

const byId = new Map(sampleAds.map((ad) => [ad.id, ad]));

export const featuredAds = data.featured.map((id) => byId.get(id)).filter(Boolean);

export function adCategory(id, lang) {
  return adCategories.find((item) => item.id === id)?.[lang] || '';
}
