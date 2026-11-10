# خطوط ستوديو | Lines Studio

موقع الوكالة: الصفحة الرئيسية، ومعرض التصاميم، وصفحة طلب الموقع. بالعربي (`/ar/`) والإنجليزي (`/en/`).

## قبل الإطلاق

عدّل `lib/site.js`:

- `whatsapp`: رقم الواتساب بالصيغة الدولية بدون + (مثال `9665XXXXXXXX`). أزرار "خلنا نسولف" وطلبات المعرض كلها تروح له.
- `email` و`crNumber`: يظهرون في الفوتر.

## التشغيل محلياً

```bash
npm install
npm run dev      # http://localhost:3000/ar/
```

## البناء والنشر

```bash
npm run build    # يطلع موقع ثابت في مجلد out/
```

**على Coolify:** أضف المشروع من الريبو، واختر Dockerfile (موجود في المشروع). يبني الموقع ويقدمه عبر nginx على المنفذ 80. أو اختر Static وحدد مجلد النشر `out`.

## الملفات المهمة

| الملف | وش فيه |
|---|---|
| `lib/dict.js` | كل نصوص الموقع بالعربي والإنجليزي |
| `lib/designs.js` | تصاميم المعرض، والتصنيفات، وأحجام المواقع وأسعارها |
| `lib/site.js` | الواتساب والإيميل والسجل التجاري |
| `app/globals.css` | الهوية: الألوان والخطوط والأشكال |
| `components/OrderForm.jsx` | نموذج الطلب، يرسل ملخص الطلب على واتساب |

## واجهة الفيديو

الموقع الثابت يبقى على nginx كما هو. توليد الفيديو خدمة منفصلة: `services/creative-api/` على Coolify كتطبيق مستقل (الهدف `api.lines.studio`)، وعامل السحب على الماك ميني في `services/mac-video-worker/`. تطبيقات اكسبرتو تنادي الواجهة من خادمها. تطبيق الجوال لا يحمل مفتاح الواجهة. العقد في `docs/video-api.openapi.yaml` و`services/creative-api/README.md`.

## فيديوهات ترويجية ثلاثية الأبعاد (Blender)

مشروع `services/blender-3d-promo/`: فيديو ترويجي ثلاثي الأبعاد كامل من ملف JSON. الكود يبني مشهد Blender (جوال أو لابتوب يعرض لقطة الموقع، أو كرة بشعار) مع خطوط مضيئة وحركة كاميرا، ويكتب النص العربي فوقه بـ ffmpeg.

```bash
cd services/blender-3d-promo
BLENDER_BIN=/Applications/Blender.app/Contents/MacOS/Blender node src/cli.js examples/experto-ar.json --quality draft
```

ويشتغل أيضاً عبر واجهة الفيديو بـ `style: "promo3d"` مع عامل Blender على الماك ميني. التفاصيل في `services/blender-3d-promo/README.md`.

## إضافة تصميم جديد للمعرض

أضف عنصر في `designs` داخل `lib/designs.js` بنفس الشكل: `id` و`cat` والاسم والوصف بالعربي والإنجليزي، وألوان المعاينة.
