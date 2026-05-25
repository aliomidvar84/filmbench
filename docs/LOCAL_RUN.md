# اجرای لوکال FilmBench (بدون Vercel)

## ۱. پیش‌نیاز

- Node.js 20+
- PostgreSQL (مثلاً `docker compose up -d postgres`)

## ۲. تنظیم `.env`

از `.env.example` کپی کنید. حداقل:

```env
DATABASE_URL=postgresql://filmbench:filmbench@127.0.0.1:5432/filmbench
JWT_SECRET=change-me-in-staging-and-production
NEXT_PUBLIC_API_URL=http://127.0.0.1:4000
API_PORT=4000
```

اگر کاربر Postgres شما `postgres` است، همان را در URL بگذارید (مثل `.env` فعلی شما).

## ۳. دیتابیس

```powershell
npm run db:migrate
```

این کار migration `031_presentation_sample_data` را هم اجرا می‌کند:

- **۱۲ ماه** داده (Jun 2025 – May 2026)
- کارخانه دمو + **۵ کارخانه هم‌رده** برای benchmark
- خطوط **LINE-A** و **LINE-B**، اهداف KPI، چند action نمونه
- بعد از migrate برای insightها: `npm run db:seed-insights`

در اپ: کارخانه **Demo Film Plant**، دوره **May 2026** را در نوار بالا انتخاب کنید.

## ۴. دو سرویس (وب + API)

**روش A — یک دستور (دو پنجره PowerShell):**

```powershell
npm run dev:local
```

**روش B — دو ترمینال:**

```powershell
# ترمینال ۱
npm run dev:api

# ترمینال ۲
npm run dev:web
```

## ۵. باز کردن اپ

- آدرس: http://127.0.0.1:3000 → به `/login` هدایت می‌شود
- ورود دمو: `admin@filmbench.local` / `ChangeMe123!`
- بعد از لاگین: `/dashboard`

## عیب‌یابی

| مشکل | راه‌حل |
|------|--------|
| صفحه Vercel «Deploy Now» | ریشه `/` الان به `/login` redirect می‌شود؛ `npm run dev:web` را restart کنید |
| Login خطا / network | API را چک کنید: http://127.0.0.1:4000/health/ready |
| database error | Postgres روشن + `DATABASE_URL` درست + `npm run db:migrate` |
| فقط وب بالا است | حتماً `npm run dev:api` هم اجرا شود |

ClickHouse **اختیاری** است؛ برای کار روزمره لازم نیست.

## Vercel (بعداً)

فعلاً API جدا روی Node اجرا می‌شود؛ برای Vercel معمولاً باید API را روی Railway/Render/Fly یا همان سرور Postgres host کنید و `NEXT_PUBLIC_API_URL` را در Vercel تنظیم کنید. جزئیات در `docs/DEPLOY.md`.
