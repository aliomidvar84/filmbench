export const apiBase =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ??
  "http://127.0.0.1:4000";

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("filmbench_access_token");
}

export function authHeaders(): HeadersInit | null {
  const token = getAccessToken();
  if (!token) return null;
  return { authorization: `Bearer ${token}` };
}
