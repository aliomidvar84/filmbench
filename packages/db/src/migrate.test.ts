import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "..", "migrations");

describe("db package layout", () => {
  it("has migrations directory with SQL files", () => {
    expect(existsSync(migrationsDir)).toBe(true);
    expect(existsSync(path.join(migrationsDir, "001_extensions_and_core.sql"))).toBe(
      true,
    );
    expect(
      existsSync(path.join(migrationsDir, "006_sprint2_cohort_config_and_aggregates.sql")),
    ).toBe(true);
    expect(
      existsSync(path.join(migrationsDir, "009_sprint3_seed_demo_user.sql")),
    ).toBe(true);
    expect(
      existsSync(path.join(migrationsDir, "010_sprint4_ingestion_batches.sql")),
    ).toBe(true);
    expect(
      existsSync(path.join(migrationsDir, "011_sprint4_soft_validation_batch.sql")),
    ).toBe(true);
    expect(
      existsSync(path.join(migrationsDir, "012_sprint5_kpi_read_indexes.sql")),
    ).toBe(true);
    expect(
      existsSync(path.join(migrationsDir, "013_sprint8_audit_events.sql")),
    ).toBe(true);
    expect(
      existsSync(
        path.join(migrationsDir, "014_sprint9_validation_listing_indexes.sql"),
      ),
    ).toBe(true);
    expect(
      existsSync(
        path.join(migrationsDir, "015_sprint10_factory_kpi_targets.sql"),
      ),
    ).toBe(true);
    expect(
      existsSync(
        path.join(migrationsDir, "016_sprint11_factory_summary_view.sql"),
      ),
    ).toBe(true);
    expect(
      existsSync(
        path.join(migrationsDir, "017_sprint12_improvement_actions.sql"),
      ),
    ).toBe(true);
    expect(
      existsSync(
        path.join(migrationsDir, "018_sprint13_user_password_changed_at.sql"),
      ),
    ).toBe(true);
    expect(
      existsSync(
        path.join(migrationsDir, "019_sprint14_period_compare_indexes.sql"),
      ),
    ).toBe(true);
    expect(
      existsSync(
        path.join(migrationsDir, "020_sprint15_user_notifications.sql"),
      ),
    ).toBe(true);
    expect(
      existsSync(
        path.join(migrationsDir, "021_sprint16_factory_reports.sql"),
      ),
    ).toBe(true);
    expect(
      existsSync(
        path.join(migrationsDir, "022_sprint18_benchmark_filter_indexes.sql"),
      ),
    ).toBe(true);
    expect(
      existsSync(
        path.join(migrationsDir, "023_sprint19_insight_engine.sql"),
      ),
    ).toBe(true);
    expect(
      existsSync(
        path.join(migrationsDir, "024_sprint19_seed_insight_rules.sql"),
      ),
    ).toBe(true);
    expect(
      existsSync(
        path.join(migrationsDir, "025_sprint20_factory_settings.sql"),
      ),
    ).toBe(true);
    expect(
      existsSync(
        path.join(migrationsDir, "026_sprint21_factory_reports_format.sql"),
      ),
    ).toBe(true);
    expect(
      existsSync(
        path.join(migrationsDir, "027_sprint22_integration_events.sql"),
      ),
    ).toBe(true);
    expect(
      existsSync(
        path.join(migrationsDir, "028_sprint23_benchmark_a5.sql"),
      ),
    ).toBe(true);
    expect(
      existsSync(
        path.join(migrationsDir, "029_sprint28_impact_calculator_settings.sql"),
      ),
    ).toBe(true);
    expect(
      existsSync(
        path.join(migrationsDir, "030_sprint26_analytics_sync_log.sql"),
      ),
    ).toBe(true);
    expect(
      existsSync(
        path.join(migrationsDir, "031_presentation_sample_data.sql"),
      ),
    ).toBe(true);
  });
});
