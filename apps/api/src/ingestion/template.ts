import * as XLSX from "xlsx";

import { MONTHLY_EXCEL_HEADERS } from "./columns.js";

/** Optional second row in the template workbook (users replace with real data). */
export const MONTHLY_TEMPLATE_EXAMPLE_ROW: (string | number)[] = [
  "LINE-A",
  "2024-01-01",
  "2024-01-31",
  1000,
  950,
  900,
  40,
  10,
  700,
  50,
  30,
  780,
  120,
  150,
  5000,
  100,
  400,
  200,
  50,
  10,
  760,
  5,
  2,
  1,
  0,
  "EUR",
];

export function buildMonthlyTemplateBuffer(): Buffer {
  const wb = XLSX.utils.book_new();
  const header = [...MONTHLY_EXCEL_HEADERS];
  const ws = XLSX.utils.aoa_to_sheet([header, MONTHLY_TEMPLATE_EXAMPLE_ROW]);
  ws["!cols"] = header.map(() => ({ wch: 18 }));
  XLSX.utils.book_append_sheet(wb, ws, "monthly");
  return XLSX.write(wb, { bookType: "xlsx", type: "buffer" }) as Buffer;
}
