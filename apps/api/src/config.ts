import path from "node:path";

export function jwtSecret(): string {
  const s = process.env.JWT_SECRET ?? "";
  if (!s) {
    throw new Error("JWT_SECRET is not configured");
  }
  return s;
}

export function accessTtlMinutes(): number {
  return Number(process.env.JWT_ACCESS_TTL_MIN ?? "15");
}

export function refreshTtlDays(): number {
  return Number(process.env.JWT_REFRESH_TTL_DAYS ?? "7");
}

export function uploadDir(): string {
  const raw = process.env.UPLOAD_DIR?.trim();
  return raw ? path.resolve(raw) : path.resolve(process.cwd(), "uploads");
}

export function reportsDir(): string {
  const raw = process.env.REPORTS_DIR?.trim();
  return raw ? path.resolve(raw) : path.join(uploadDir(), "reports");
}

export function maxUploadBytes(): number {
  return Number(process.env.UPLOAD_MAX_BYTES ?? String(15 * 1024 * 1024));
}
