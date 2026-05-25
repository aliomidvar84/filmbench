import PDFDocument from "pdfkit";

import type { ExecutiveReportContext } from "./executive-data.js";

type PdfDoc = InstanceType<typeof PDFDocument>;

function ensureSpace(doc: PdfDoc, minY = 720): void {
  if (doc.y > minY) doc.addPage();
}

function sectionTitle(doc: PdfDoc, title: string): void {
  ensureSpace(doc);
  doc.moveDown(0.6).fontSize(12).font("Helvetica-Bold").text(title);
  doc.font("Helvetica").fontSize(9);
}

function sectionRows(doc: PdfDoc, headers: string[], rows: string[][]): void {
  ensureSpace(doc);
  doc.font("Helvetica-Bold").text(headers.join(" · "));
  doc.font("Helvetica");
  for (const row of rows) {
    ensureSpace(doc, 740);
    doc.text(row.join(" · "), { width: 500 });
  }
}

export function buildExecutiveReportPdf(ctx: ExecutiveReportContext): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const periodLabel = ctx.period_label ?? ctx.period_end;
    const scope = ctx.line_code ? `Line ${ctx.line_code}` : "All lines";

    doc.fontSize(18).font("Helvetica-Bold").text("FilmBench Executive Report");
    doc.fontSize(10).font("Helvetica");
    doc.text(`Factory: ${ctx.factory_name}`);
    doc.text(`Reporting period: ${periodLabel}`);
    doc.text(`Scope: ${scope}`);
    doc.text(`Generated at (UTC): ${ctx.generated_at_iso}`);

    sectionTitle(doc, "Summary counts");
    sectionRows(doc, ["metric", "value"], [
      ["lines", String(ctx.counts.lines)],
      ["kpi_results", String(ctx.counts.kpi_results)],
      ["validation_errors", String(ctx.counts.validation_errors)],
      ["validation_warnings", String(ctx.counts.validation_warnings)],
      ["below_factory_target", String(ctx.counts.below_target)],
      ["below_peer_median", String(ctx.counts.below_peer_median)],
      ["insufficient_peer_sample", String(ctx.counts.insufficient_peer_sample)],
      ["targets_defined", String(ctx.counts.targets_defined)],
    ]);

    sectionTitle(doc, "Priority items (top 50)");
    sectionRows(
      doc,
      ["kind", "line", "ref", "message", "severity", "value"],
      ctx.priorities.map((p) => [
        String(p.kind ?? ""),
        String(p.line_code ?? ""),
        String(p.ref_code ?? ""),
        String(p.message ?? ""),
        String(p.severity ?? ""),
        String(p.metric_value ?? ""),
      ]),
    );

    sectionTitle(doc, "Below factory target");
    sectionRows(
      doc,
      ["line", "kpi", "name", "current", "target", "gap"],
      ctx.below_target.map((r) => [
        String(r.line_code ?? ""),
        String(r.kpi_code ?? ""),
        String(r.kpi_name ?? ""),
        String(r.current_value ?? ""),
        String(r.target_value ?? ""),
        String(r.gap_to_target_signed ?? ""),
      ]),
    );

    sectionTitle(doc, "Benchmark gaps (below peer median)");
    sectionRows(
      doc,
      ["line", "kpi", "current", "peer_p50", "gap_median", "gap_best"],
      ctx.benchmark_gaps.map((r) => [
        String(r.line_code ?? ""),
        String(r.kpi_code ?? ""),
        String(r.current_value ?? ""),
        String(r.peer_p50 ?? ""),
        String(r.gap_to_median_signed ?? ""),
        String(r.gap_to_best_practice_signed ?? ""),
      ]),
    );

    doc.end();
  });
}

/** Rough size hint for UI before generation. */
export function estimateExecutiveReportBytes(
  ctx: ExecutiveReportContext,
  format: "csv" | "pdf",
): number {
  const rowCount =
    ctx.priorities.length + ctx.below_target.length + ctx.benchmark_gaps.length + 12;
  if (format === "pdf") {
    return Math.max(12_000, 8_000 + rowCount * 120);
  }
  return Math.max(2_000, 800 + rowCount * 80);
}
