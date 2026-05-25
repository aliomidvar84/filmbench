import type { IncomingMessage } from "node:http";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

export function requestUrl(req: IncomingMessage): URL {
  const host = req.headers.host ?? "127.0.0.1";
  return new URL(req.url ?? "/", `http://${host}`);
}

export function extractBearer(
  authorization: string | undefined,
): string | null {
  if (!authorization) return null;
  const [scheme, token] = authorization.split(/\s+/);
  if (!scheme || scheme.toLowerCase() !== "bearer" || !token) return null;
  return token.trim();
}

export async function readJsonBody<T = unknown>(
  req: IncomingMessage,
): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {} as T;
  return JSON.parse(raw) as T;
}
