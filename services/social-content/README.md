# محتوى السوشال ميديا | Social content

أداة فريق إدارة الحسابات: من ملف وصف واحد للعميل تطلع خطة شهر كاملة بالعربي (بلهجة سعودية أو فصحى بسيطة):

1. **التقويم** (`--plan-only`، مجاني): كل منشور وريلز وستوري بتاريخه ومنصته ومحوره، حسب الباقة، مع اليوم الوطني ويوم التأسيس والمناسبات اللي تعطيها في الوصف (رمضان والعيد تواريخها تتغير، فتنكتب في `occasions`).
2. **الكتابة**: طلب واحد لـ Claude يكتب كل القطع بالشكل المطلوب (الافتتاحية، النص، الهاشتاقات، الدعوة، وصف للمصمم، شرائح الكاروسيل، نص الريلز).
3. **المراجعة**: فحص تلقائي يعلّم القطع اللي تحتاج نظرة (طول X، عدد الهاشتاقات، ادعاءات مثل «الأفضل»، نص ريلز طويل). ما يعيد الطلب تلقائياً لأن كل طلب مدفوع.

The team tool behind the social media plans on `/social/`. A client brief → a month's calendar → every piece written by Claude in one streamed, structured-output request → review sheet, scheduler CSV and UGC video jobs for the reels.

```bash
npm install
node src/cli.js examples/experto-dec.json --plan-only     # the slots, no API call
node src/cli.js examples/experto-dec.json --out out/      # writes the month
```

Outputs in `--out`:

| File | For |
|---|---|
| `<name>.md` | Review sheet for the content manager and the client's approval |
| `<name>.csv` | Import into the scheduling tool (UTF-8 with BOM so Excel shows Arabic) |
| `<name>.json` | Everything, including review flags |
| `<name>-video-jobs.json` | Reel scripts as `style: "ugc"` jobs for `POST /v1/jobs` on the video API. **Not sent**: someone reviews them and posts them, since each UGC clip is a paid render. |

## Brief

See `examples/experto-dec.json`. `package` is `content`, `basic`, `growth` or `full` (volumes in `src/brief.js`, matching `lib/social.js` on the site). `about` and `offers` are the only facts the writer may use: it is told never to invent numbers, prices, awards or reviews.

## Model and cost

- Claude Opus 5.5 (`claude-opus-5-5`), effort `medium` (`--effort` to change), streaming, `max_tokens` 64000, JSON schema output.
- Server-side fallbacks are on (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`): if the model declines a brief, the API reruns it on a fallback model in the same call. A refusal of the whole chain fails with code `refused`.
- The fixed system prompt is cached, so a second client in the same few minutes reads it from cache.
- Rough size: a Growth month is 46 pieces, about 4–5K input and 15–25K output tokens.

Credentials come from the SDK's usual chain: `ANTHROPIC_API_KEY`, or an `ant auth login` profile. Never put the key in a brief, a plist or a log.

## Tests

```bash
npm test    # fake client, no key, no spend
```
