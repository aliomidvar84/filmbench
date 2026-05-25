"use client";

import type { FormEvent } from "react";
import { useState } from "react";

import { PageContainer } from "../../../components/PageContainer";
import { apiBase, getAccessToken } from "../../../lib/api";
import { useFactoryPeriod } from "../../../lib/factory-period-context";

interface IngestSuccess {
  ingestion_batch_id: string;
  rows_ingested: number;
  reporting_periods_touched: number;
  reporting_period_ids?: string[];
  line_period_pairs_refreshed: number;
  refresh_errors?: string[];
}

type UploadFeedback = {
  kind: "success" | "error" | "info";
  title: string;
  detail?: string;
  bullets?: string[];
};

const ERROR_LABELS: Record<string, string> = {
  unauthorized: "Sign in again to upload.",
  forbidden: "Your role cannot upload for this factory.",
  invalid_factory_id: "Invalid factory. Pick one in the top bar.",
  expected_multipart_form_data: "Upload failed — try again.",
  file_too_large: "File is too large. Use a smaller workbook.",
  file_required: "Choose an Excel file before uploading.",
  upload_parse_failed: "Could not read the upload. Try again.",
  validation_failed: "The workbook has validation errors. Fix the template and re-upload.",
  unknown_line_codes: "Some line codes in the file are not registered for this factory.",
  ingest_failed: "Ingestion failed on the server. Try again or contact support.",
  database_unconfigured: "Server database is not configured.",
};

function formatUploadError(data: Record<string, unknown>): UploadFeedback {
  const code = typeof data.error === "string" ? data.error : "upload_failed";
  const title = ERROR_LABELS[code] ?? `Upload failed (${code}).`;
  const bullets: string[] = [];

  if (code === "validation_failed" && Array.isArray(data.issues)) {
    for (const issue of data.issues) {
      if (typeof issue === "string") bullets.push(issue);
    }
  }
  if (code === "unknown_line_codes" && Array.isArray(data.line_codes)) {
    bullets.push(
      `Unknown codes: ${data.line_codes.filter((c) => typeof c === "string").join(", ")}`,
    );
  }
  const message =
    typeof data.message === "string" ? data.message : undefined;

  return { kind: "error", title, detail: message, bullets: bullets.length ? bullets : undefined };
}

function formatUploadSuccess(data: IngestSuccess): UploadFeedback {
  const rows = data.rows_ingested;
  const periods = data.reporting_periods_touched;
  const pairs = data.line_period_pairs_refreshed;
  const rowWord = rows === 1 ? "row" : "rows";
  const periodWord = periods === 1 ? "period" : "periods";

  let title = `Upload complete. ${rows} ${rowWord} ingested across ${periods} reporting ${periodWord}.`;
  let detail = `KPIs and benchmarks were refreshed for ${pairs} line–period pair${pairs === 1 ? "" : "s"}.`;

  if (data.refresh_errors?.length) {
    title = `Upload saved, but some refreshes had warnings.`;
    detail = `${rows} ${rowWord} ingested. Review data quality if KPIs look stale.`;
    return {
      kind: "success",
      title,
      detail,
      bullets: data.refresh_errors.slice(0, 5),
    };
  }

  return { kind: "success", title, detail };
}

export default function UploadPage() {
  const { factoryId, selectedFactory, authMessage, refreshPeriods } =
    useFactoryPeriod();
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [feedback, setFeedback] = useState<UploadFeedback | null>(null);
  const [loading, setLoading] = useState(false);

  const canUpload = selectedFactory?.can_upload ?? false;

  async function downloadTemplate() {
    setFeedback(null);
    const token = getAccessToken();
    if (!token || !factoryId) {
      setFeedback({
        kind: "info",
        title: "Pick a factory in the top bar and sign in.",
      });
      return;
    }
    const res = await fetch(
      `${apiBase}/v1/factories/${factoryId}/ingestion/monthly-template.xlsx`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      const code = err.error ?? `template_download_failed_${res.status}`;
      setFeedback({
        kind: "error",
        title: ERROR_LABELS[code] ?? `Could not download template (${code}).`,
      });
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "filmbench-monthly-template.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFeedback(null);
    const token = getAccessToken();
    if (!token || !factoryId || !file) {
      setFeedback({
        kind: "info",
        title: "Factory (top bar), file, and sign-in are required.",
      });
      return;
    }
    if (!canUpload) {
      setFeedback({
        kind: "error",
        title: "Your role cannot upload for this factory.",
      });
      return;
    }
    setLoading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(
        `${apiBase}/v1/factories/${factoryId}/ingestion/monthly-excel`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${token}` },
          body,
        },
      );
      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        setFeedback(formatUploadError(data));
        return;
      }
      setFeedback(formatUploadSuccess(data as unknown as IngestSuccess));
      setFile(null);
      setFileInputKey((k) => k + 1);
      const periodIds = Array.isArray(data.reporting_period_ids)
        ? data.reporting_period_ids.filter((id): id is string => typeof id === "string")
        : [];
      await refreshPeriods(periodIds[0]);
    } catch {
      setFeedback({
        kind: "error",
        title: "Network error. Check your connection and try again.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageContainer
      title="Monthly Excel ingestion"
      subtitle="Factory is selected in the top bar. Admin and analyst roles can upload."
    >
      {authMessage ? (
        <p className="mb-4 text-sm text-amber-800 dark:text-amber-200">
          {authMessage}
        </p>
      ) : null}
      {!canUpload && selectedFactory ? (
        <p className="mb-4 text-sm text-amber-800 dark:text-amber-200">
          Your role ({selectedFactory.role}) cannot upload for this factory.
        </p>
      ) : null}

      <form
        className="flex max-w-lg flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
        onSubmit={onSubmit}
      >
        <button
          type="button"
          onClick={() => void downloadTemplate()}
          className="w-fit rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600"
        >
          Download template
        </button>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Excel file (.xlsx)</span>
          <input
            key={fileInputKey}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(ev) => setFile(ev.target.files?.[0] ?? null)}
            required
          />
        </label>
        <button
          type="submit"
          disabled={loading || !canUpload}
          className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {loading ? "Uploading…" : "Upload and ingest"}
        </button>
      </form>
      {feedback ? (
        <div
          className={`mt-6 max-w-lg rounded-xl border p-4 text-sm ${
            feedback.kind === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"
              : feedback.kind === "error"
                ? "border-red-200 bg-red-50 text-red-950 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100"
                : "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
          }`}
          role="status"
        >
          <p className="font-medium">{feedback.title}</p>
          {feedback.detail ? (
            <p className="mt-1 text-[0.8125rem] opacity-90">{feedback.detail}</p>
          ) : null}
          {feedback.bullets?.length ? (
            <ul className="mt-2 list-inside list-disc space-y-0.5 text-[0.8125rem] opacity-90">
              {feedback.bullets.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </PageContainer>
  );
}
