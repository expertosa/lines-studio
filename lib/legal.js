import { site } from './site';

const owner = {
  ar: `خطوط ستوديو، المملوك للمنشأة صاحبة السجل التجاري رقم ${site.crNumber} في المملكة العربية السعودية`,
  en: `Lines Studio, owned by the establishment holding Saudi commercial registration no. ${site.crNumber}`,
};

export const privacy = {
  ar: {
    title: 'سياسة الخصوصية',
    intro: `توضح هذه السياسة كيف يجمع ${owner.ar} بياناتك الشخصية ويستخدمها ويحميها، وفق نظام حماية البيانات الشخصية في المملكة العربية السعودية.`,
    sections: [
      { h: 'البيانات اللي نجمعها', p: ['عند طلب موقع أو التواصل معنا: اسم النشاط، ورقم الجوال، والمدينة، ووصف الخدمات، وأي ملفات ترسلها مثل الشعار.', 'لا نجمع بيانات الدفع على هذا الموقع. الدفع يتم عبر رابط من مزود دفع مرخّص.'] },
      { h: 'ليش نستخدمها', p: ['للرد على طلبك وتنفيذ المشروع، وإرسال عرض السعر ورابط الدفع، والتواصل معك بخصوص الطلب.', 'ما نستخدم بياناتك للتسويق إلا بموافقتك.'] },
      { h: 'مع مين نشاركها', p: ['ترسل الطلبات عبر واتساب، فتمر بخدمات شركة Meta حسب سياستها.', 'قد نستعين بمزودي خدمات (استضافة، أدوات تصميم وذكاء اصطناعي، مزود الدفع) بالقدر اللازم لتنفيذ مشروعك فقط.', 'في فيديوهات الذكاء الاصطناعي: نص الفيديو يُرسل لمزود توليد الصوت، وصورة المقدّم والصوت يُرسلان لمزود تحريك الصورة، لإنتاج الفيديو فقط.', 'ما نبيع بياناتك لأي طرف.'] },
      { h: 'إحصاءات الزيارات', p: ['نستخدم أداة إحصاءات مستضافة على خوادمنا، بدون ملفات تعريف ارتباط (كوكيز) وبدون تتبّع عبر المواقع. تحسب الزيارات والصفحات وضغطات أزرار التواصل، ولا تحفظ اسمك أو رقمك أو عنوان IP كامل.'] },
      { h: 'مدة الاحتفاظ', p: ['نحتفظ ببيانات الطلب طول مدة المشروع، وبعدها حسب ما تتطلبه الأنظمة المحاسبية والنظامية، ثم نحذفها.'] },
      { h: 'حقوقك', p: ['لك الحق تطلب الاطلاع على بياناتك، أو تصحيحها، أو حذفها، أو سحب موافقتك، أو نسخة منها.', `أرسل طلبك على ${site.email} ونرد خلال 30 يوم.`] },
      { h: 'حماية البيانات', p: ['نطبّق إجراءات معقولة لحماية بياناتك من الوصول غير المصرح به.'] },
      { h: 'التواصل', p: [`الإيميل: ${site.email}`, `واتساب: ${site.whatsappDisplay}`] },
    ],
  },
  en: {
    title: 'Privacy Policy',
    intro: `This policy explains how ${owner.en} collects, uses and protects your personal data, in line with Saudi Arabia's Personal Data Protection Law.`,
    sections: [
      { h: 'What we collect', p: ['When you order or contact us: business name, mobile number, city, a description of your services, and any files you send such as a logo.', 'We do not collect payment details on this site. Payment happens through a link from a licensed payment provider.'] },
      { h: 'Why we use it', p: ['To reply to your request, deliver your project, send quotes and payment links, and contact you about your order.', 'We do not use your data for marketing without your consent.'] },
      { h: 'Who we share it with', p: ['Orders are sent via WhatsApp and pass through Meta’s services under its policy.', 'We may use service providers (hosting, design and AI tools, payment provider) only as needed to deliver your project.', 'For AI videos: the script is sent to a voice generation provider, and the presenter photo and audio to an animation provider, only to produce the video.', 'We never sell your data.'] },
      { h: 'Visit statistics', p: ['We use a statistics tool hosted on our own servers, with no cookies and no cross-site tracking. It counts visits, pages and clicks on contact buttons, and does not store your name, number or full IP address.'] },
      { h: 'Retention', p: ['We keep order data for the duration of the project, then as required by accounting and legal obligations, and then delete it.'] },
      { h: 'Your rights', p: ['You may request access to, correction or deletion of your data, withdraw consent, or ask for a copy.', `Email ${site.email} and we will reply within 30 days.`] },
      { h: 'Security', p: ['We apply reasonable measures to protect your data from unauthorized access.'] },
      { h: 'Contact', p: [`Email: ${site.email}`, `WhatsApp: ${site.whatsappDisplay}`] },
    ],
  },
};

export const terms = {
  ar: {
    title: 'الشروط والأحكام',
    intro: `هذه الشروط تنظّم استخدامك لموقع ${owner.ar} وطلب خدماته. بطلبك لأي خدمة توافق عليها.`,
    sections: [
      { h: 'الخدمات', p: ['نقدم تصميم وتطوير المواقع وواجهات التطبيقات والهويات البصرية وفيديوهات الإطلاق، سواء من معرض التصاميم أو كمشاريع مخصصة أو باشتراك شهري.', 'نستخدم أدوات الذكاء الاصطناعي ضمن عملنا، وكل مشروع يراجعه مصمم قبل التسليم.'] },
      { h: 'الأسعار والدفع', p: ['الأسعار المعروضة بالريال السعودي. المنشأة غير مسجلة في ضريبة القيمة المضافة، فلا تضاف ضريبة على الأسعار.', 'مواقع المعرض: الدفع كامل قبل البدء. المشاريع المخصصة: 50% عند البدء و50% قبل التسليم. الاشتراك الشهري: يدفع مقدماً كل شهر.'] },
      { h: 'مدة التسليم', p: ['تبدأ مدة التسليم بعد استلام الدفعة وكل المحتوى المطلوب منك (الشعار، المعلومات، الصور).', 'التأخير في إرسال المحتوى أو الملاحظات يمدد مدة التسليم بنفس القدر.'] },
      { h: 'التعديلات', p: ['مواقع المعرض: جولتين تعديل بعد التسليم الأول ضمن نفس التصميم.', 'المشاريع المخصصة والاشتراك: حسب ما يتفق عليه في عرض السعر.', 'التعديلات الجوهرية أو الإضافات خارج النطاق تُسعّر بشكل منفصل.'] },
      { h: 'الملكية', p: ['تنتقل لك ملكية التصميم النهائي ومحتوى موقعك بعد سداد المبلغ كامل.', 'يبقى لنا حق عرض العمل في معرض أعمالنا، إلا إذا طلبت غير كذا كتابياً.', 'تصاميم المعرض قوالب قابلة للاستخدام لعملاء آخرين بمحتوى مختلف، والتخصيص الخاص بك لك وحدك.'] },
      { h: 'المحتوى', p: ['أنت مسؤول عن صحة المحتوى والصور والشعارات اللي ترسلها، وعن حقك في استخدامها.'] },
      { h: 'فيديوهات الذكاء الاصطناعي', p: [
        'نقدم فيديوهات ترويجية ثلاثية الأبعاد، وفيديوهات بأسلوب UGC يتكلم فيها مقدّم مولّد بالذكاء الاصطناعي.',
        'المقدّمون من مجموعة معتمدة عندنا: وجوه مولّدة أو أشخاص وقّعوا موافقة. ما نستخدم وجه أو صوت أي شخص حقيقي بدون موافقته المكتوبة.',
        'لو طلبت مقدّم بوجهك أو صوتك أو وجه شخص من فريقك، نطلب موافقة مكتوبة من صاحب الوجه أو الصوت قبل البدء، ويقدر يسحبها متى ما بغى للفيديوهات الجديدة.',
        'كل فيديو UGC يحمل علامة «مولّد بالذكاء الاصطناعي» ظاهرة طول الفيديو، وما نشيلها.',
        'أنت مسؤول عن صحة الادعاءات في نص الفيديو. ما ننتج فيديو يدّعي إن المقدّم عميل حقيقي جرّب المنتج، ولا محتوى مضلل أو مخالف لأنظمة الإعلان في المملكة.',
      ] },
      { h: 'الاسترجاع', p: ['قبل بدء العمل: يُسترجع المبلغ كامل.', 'بعد بدء العمل: لا يُسترجع المبلغ المدفوع عن العمل المنجز.', 'أسبوع التجربة غير قابل للاسترجاع، لكنه يُخصم كامل من أي باقة تطلبها بعده.'] },
      { h: 'الاشتراك الشهري', p: ['تقدر تلغيه أي وقت، ويسري الإلغاء من نهاية الشهر المدفوع.'] },
      { h: 'النظام المطبّق', p: ['تخضع هذه الشروط لأنظمة المملكة العربية السعودية.'] },
    ],
  },
  en: {
    title: 'Terms & Conditions',
    intro: `These terms govern your use of the website of ${owner.en} and your orders for its services. By ordering any service you agree to them.`,
    sections: [
      { h: 'Services', p: ['We design and build websites, app interfaces, brand identities and launch videos: from the design gallery, as custom projects, or by monthly subscription.', 'We use AI tools in our work, and a designer reviews every project before delivery.'] },
      { h: 'Prices & payment', p: ['Prices are in Saudi riyals. The establishment is not VAT-registered, so no VAT is added.', 'Gallery sites: paid in full before work starts. Custom projects: 50% upfront, 50% before delivery. Subscription: paid monthly in advance.'] },
      { h: 'Delivery', p: ['Delivery time starts once payment and all required content (logo, details, images) are received.', 'Delays in sending content or feedback extend delivery by the same amount.'] },
      { h: 'Revisions', p: ['Gallery sites: two revision rounds after first delivery, within the same design.', 'Custom projects and subscriptions: as agreed in the quote.', 'Major changes or out-of-scope additions are priced separately.'] },
      { h: 'Ownership', p: ['Ownership of the final design and your site content passes to you on full payment.', 'We may show the work in our portfolio unless you ask us in writing not to.', 'Gallery designs are templates that may be used for other clients with different content; your customization is yours alone.'] },
      { h: 'Content', p: ['You are responsible for the accuracy of the content, images and logos you send, and your right to use them.'] },
      { h: 'AI videos', p: [
        'We offer 3D promo videos, and UGC-style videos in which an AI-generated presenter speaks.',
        'Presenters come from our approved set: generated faces, or people who signed consent. We never use a real person’s face or voice without their written consent.',
        'If you want a presenter with your own face or voice, or that of someone on your team, we need written consent from that person before we start, and they can withdraw it for new videos at any time.',
        'Every UGC video carries a visible “AI-generated” label for its whole length, and we do not remove it.',
        'You are responsible for the accuracy of the claims in the script. We do not produce videos that claim the presenter is a real customer who used the product, or content that is misleading or breaks Saudi advertising rules.',
      ] },
      { h: 'Refunds', p: ['Before work starts: full refund.', 'After work starts: payments for completed work are non-refundable.', 'The trial week is non-refundable but fully credited to any package you order after it.'] },
      { h: 'Subscription', p: ['You can cancel anytime; cancellation takes effect at the end of the paid month.'] },
      { h: 'Governing law', p: ['These terms are governed by the laws of the Kingdom of Saudi Arabia.'] },
    ],
  },
};
