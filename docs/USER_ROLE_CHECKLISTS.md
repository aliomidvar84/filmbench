# FilmBench — چک‌لیست یک‌صفحه‌ای (قابل چاپ)

قبل از شروع: در **نوار بالا** همیشه **Factory** و **Period** (ماه گزارش) را درست انتخاب کنید.

---

## Analyst — ورود و کیفیت داده

| # | کار | صفحه | انجام شد |
|---|-----|------|:--------:|
| 1 | کارخانهٔ درست در نوار بالا | (همه صفحات) | ☐ |
| 2 | دانلود قالب Excel | Upload → Download template | ☐ |
| 3 | پر کردن دادهٔ ماه در Excel | (خارج از اپ) | ☐ |
| 4 | آپلود فایل | Upload → انتخاب فایل → Upload | ☐ |
| 5 | خواندن پیام نتیجه (موفق / خطا) | Upload | ☐ |
| 6 | بررسی خطاهای اعتبارسنجی | Data quality → Load | ☐ |
| 7 | رفع errorها در Excel و آپلود مجدد (در صورت نیاز) | Upload | ☐ |
| 8 | اطلاع به مدیر: «داده آماده است» | — | ☐ |

**یادآوری:** Analyst معمولاً به Dashboard / Benchmark / Reports دسترسی ندارد. اگر منویی نمی‌بینید، طبیعی است.

**مسیر سریع:** `Upload` → `Data quality` → (در صورت خطا) دوباره `Upload`

---

## Manager — بستن ماه و گزارش به مدیریت

| # | کار | صفحه | انجام شد |
|---|-----|------|:--------:|
| 1 | کارخانه + دورهٔ ماه جاری در نوار بالا | (همه صفحات) | ☐ |
| 2 | تأیید آپلود analyst (یا خودتان Upload) | Upload / Team → تاریخچه | ☐ |
| 3 | صفر بودن error در کیفیت داده | Data quality | ☐ |
| 4 | به‌روزرسانی بنچمارک | Benchmark → Refresh benchmarks | ☐ |
| 5 | تولید insightها | Insights → Refresh insights | ☐ |
| 6 | مرور خلاصه ماه | Overview → Load summary | ☐ |
| 7 | بررسی KPIهای ضعیف | Benchmark → Load (+ فیلتر laggard) | ☐ |
| 8 | ثبت اقدامات از insightهای مهم | Insights → Track as action | ☐ |
| 9 | پیگیری اقدامات باز | Actions | ☐ |
| 10 | ساخت گزارش اجرایی | Reports → Generate (PDF یا CSV) | ☐ |
| 11 | دانلود و ارسال گزارش | Reports → Download | ☐ |
| 12 | تیک چک‌لیست بستن ماه | Getting started | ☐ |

**مسیر سریع:** `Overview` → `Benchmark` → `Insights` → `Reports`

**قبل از جلسهٔ مدیریت:** Overview + Reports (PDF) + ۲–۳ insight بحرانی از Actions

---

## Admin — علاوه بر Manager (یک‌بار / ماهانه)

| # | کار | صفحه | انجام شد |
|---|-----|------|:--------:|
| 1 | اعضای تیم و نقش‌ها | Team | ☐ |
| 2 | اهداف KPI (در صورت تغییر) | Targets | ☐ |
| 3 | تنظیمات کارخانه (واحد پول و …) | Settings | ☐ |
| 4 | بررسی audit رویدادها | Team → Audit | ☐ |

---

## عیب‌یابی سریع

| مشکل | اقدام |
|------|--------|
| صفحه خالی است | Factory + Period را در نوار بالا انتخاب کنید |
| Insights خالی | Insights → Refresh insights |
| Benchmark خالی | ابتدا Upload؛ سپس Benchmark → Refresh benchmarks |
| نمی‌توانم آپلود کنم | نقش Analyst/Admin لازم است؛ کارخانه را عوض کنید |
| گزارش قدیمی است | Reports → Generate دوباره برای همان دوره |

---

*FilmBench — راهنمای کاربری کامل در گفت‌وگوی قبلی یا از تیم پشتیبانی.*
