/** RFC 4180-style CSV (UTF-8; callers may prepend BOM for Excel). */

export function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function toCsv(headers: string[], rows: string[][]): string {
  const head = headers.map(csvEscape).join(",");
  const body = rows.map((r) => r.map(csvEscape).join(",")).join("\r\n");
  return body ? `${head}\r\n${body}\r\n` : `${head}\r\n`;
}
