# Lines Studio MCP · خطوط ستوديو

سيرفر MCP يعطي وكلاء الذكاء الاصطناعي (Claude، Cursor، ChatGPT…) تصاميم خطوط العربية: المعرض، والألوان والخطوط، وتوليد صفحات RTL جاهزة، وفحص أخطاء العربي، والأسعار، ورابط طلب على واتساب.

**الرابط:** `https://mcp.lines.studio/mcp` (Streamable HTTP، بدون جلسات، بدون تسجيل دخول)

## الأدوات

| الأداة | وش تسوي |
|---|---|
| `list_designs` | تصاميم المعرض حسب النشاط |
| `get_design_kit` | الألوان والخطوط والمسافات ومتغيرات CSS وقواعد RTL لتصميم |
| `generate_page` | صفحة هبوط كاملة (HTML+CSS) بالعربي RTL أو الإنجليزي |
| `arabic_fonts` | خطوط عربية مختارة وتوليفات عنوان/نص |
| `rtl_audit` | يفحص HTML أو CSS ويطلع أخطاء العربي مع الحل |
| `get_pricing` | الباقات والأسعار |
| `create_order_link` | رابط واتساب جاهز بالطلب (ما يرسل شي لحاله) |

وفيه prompt اسمه `arabic_landing_page`.

البيانات تُقرأ من `lib/designs.js` و`lib/dict.js` و`lib/site.js`، فأي تعديل في الموقع ينعكس على السيرفر.

## التشغيل محلياً

```bash
cd mcp && npm install
npm start        # http://localhost:8080/mcp
npm test         # يشغّل كل الأدوات عبر عميل MCP حقيقي
```

## النشر على Coolify

1. **New Resource** ← نفس الريبو `expertosa/lines-studio`، فرع `main`.
2. **Build Pack:** Dockerfile، و**Dockerfile Location:** `/mcp/Dockerfile`، و**Base Directory:** `/` (لازم الجذر لأنه يقرأ `lib/`).
3. **Port:** `8080`. **Domain:** `https://mcp.lines.studio`.
4. سجل **A** لـ `mcp` يأشّر على السيرفر، ثم Deploy.
5. تأكد: `curl https://mcp.lines.studio/health`.
