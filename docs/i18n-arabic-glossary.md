# Arabic terminology glossary (Corez interface)

Use these terms consistently in `src/i18n/ar/*.js`. Consistency beats variety: a
button labelled «نشر» in one panel and «إطلاق» in another reads as two features.

## Core actions

| English | Arabic |
| --- | --- |
| Chat / conversation | محادثة |
| New chat | محادثة جديدة |
| Message | رسالة |
| Send | إرسال |
| Stop | إيقاف |
| Copy | نسخ |
| Copied | تم النسخ |
| Save | حفظ |
| Cancel | إلغاء |
| Delete | حذف |
| Close | إغلاق |
| Retry | إعادة المحاولة |
| Download | تنزيل |
| Dismiss | تجاهل |
| View | عرض |
| Edit | تعديل |
| Revise | تحسين |

## The product

| English | Arabic |
| --- | --- |
| Build / create (verb) | بناء / إنشاء |
| Creation (artifact) | إنشاء |
| Preview | معاينة |
| Live preview | معاينة مباشرة |
| Publish | نشر |
| Publishing | النشر |
| Published | منشور |
| Unpublish | إلغاء النشر |
| Share link | رابط المشاركة |
| Website | موقع |
| App / application | تطبيق |
| Game | لعبة |
| Code | الشيفرة |
| Source code | الشيفرة المصدرية |
| Fullscreen | ملء الشاشة |
| Device / viewport | الجهاز |
| Canvas | اللوحة |

## Account and money

| English | Arabic |
| --- | --- |
| Sign in | تسجيل الدخول |
| Sign up | إنشاء حساب |
| Log out | تسجيل الخروج |
| Password | كلمة المرور |
| Email | البريد الإلكتروني |
| Account | الحساب |
| Profile | الملف الشخصي |
| Settings | الإعدادات |
| Plan | الخطة |
| Free | مجاني |
| Standard | القياسي |
| Premium | المميز |
| Upgrade | ترقية |
| Downgrade | تخفيض الخطة |
| Subscription | الاشتراك |
| Billing | الفواتير |
| Invoice | الفاتورة |
| Payment | الدفع |
| Usage | الاستخدام |
| Limit | الحد |
| Add-on pack | حزمة إضافية |
| Period end / renews on | تاريخ التجديد |
| Upgrade required | الترقية مطلوبة |

## Status and errors

| English | Arabic |
| --- | --- |
| Loading… | جارٍ التحميل… |
| Thinking… | يجري التفكير… |
| Building… | جارٍ البناء… |
| Verifying… | جارٍ التحقق… |
| Ready | جاهز |
| Failed | فشل |
| Something went wrong | حدث خطأ ما |
| Try again | حاول مرة أخرى |
| Not signed in | لم تسجّل الدخول |
| Offline | غير متصل |
| Required | مطلوب |

## Privacy and consent

| English | Arabic |
| --- | --- |
| Privacy | الخصوصية |
| Cookies | ملفات تعريف الارتباط |
| Consent | الموافقة |
| Accept all | قبول الكل |
| Reject non-essential | رفض غير الضروري |
| Necessary / required | ضروري |
| Preferences | التفضيلات |
| Analytics | التحليلات |
| Marketing | التسويق |
| Embeds | التضمينات |

## Style rules

- Use logical, modern marketing Arabic (as used by Gulf tech products), not a
  literal word-for-word translation.
- Keep the product name **Corez** in Latin script, exactly as it appears in
  English.
- Keep currency codes (AED, USD) and technical tokens (HTML, CSS, JS, JSON, API,
  URL, PDF) in Latin script.
- Keep every `{placeholder}` exactly as it is, including its spelling and count.
- Do not add the definite article to a button label unless the English has one:
  "Save" → «حفظ», not «الحفظ»; "Delete chat" → «حذف المحادثة».
- Use «» for quoted UI values inside a sentence (the Arabic counterpart of “”).
- Ellipsis: use … (single character), matching English.
- Keep labels short enough for a button or tab (aim for the same or fewer
  characters than the English string where practical).
