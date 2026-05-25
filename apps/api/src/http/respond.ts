import type { ServerResponse } from "node:http";

const corsOrigin = process.env.CORS_ORIGIN ?? "*";

export function corsHeaders(): Record<string, string> {
  return {
    "access-control-allow-origin": corsOrigin,
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type, authorization, accept",
    "access-control-max-age": "86400",
  };
}

export function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
): void {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    ...corsHeaders(),
  });
  res.end(JSON.stringify(body));
}

export function sendOptions(res: ServerResponse): void {
  res.writeHead(204, corsHeaders());
  res.end();
}

export function sendBinary(
  res: ServerResponse,
  status: number,
  body: Buffer,
  contentType: string,
  extraHeaders?: Record<string, string>,
): void {
  res.writeHead(status, {
    "content-type": contentType,
    ...corsHeaders(),
    ...extraHeaders,
  });
  res.end(body);
}

export function sendText(
  res: ServerResponse,
  status: number,
  body: string,
  mimeType: string,
  extraHeaders?: Record<string, string>,
): void {
  res.writeHead(status, {
    "content-type": `${mimeType}; charset=utf-8`,
    ...corsHeaders(),
    ...extraHeaders,
  });
  res.end(body, "utf8");
}
