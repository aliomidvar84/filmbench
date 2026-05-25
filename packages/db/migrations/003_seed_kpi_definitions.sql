-- KPI catalog seed (Annex A2 tiers + Annex A3 sample definitions)
INSERT INTO kpi_definitions (
  kpi_code,
  name,
  category,
  unit,
  direction,
  formula_text,
  description,
  tier
)
VALUES
  (
    'SCRAP_RATE',
    'Scrap rate',
    'quality',
    'ratio',
    'lower',
    'scrap_kg / NULLIF(total_output_kg, 0)',
    'Scrap mass divided by total output (stored as decimal, e.g. 0.05 = 5%).',
    1
  ),
  (
    'YIELD_RATE',
    'Yield',
    'quality',
    'ratio',
    'higher',
    'good_output_kg / NULLIF(total_input_kg, 0)',
    'Good output divided by total material input.',
    2
  ),
  (
    'THROUGHPUT_KG_H',
    'Throughput',
    'production',
    'kg_per_h',
    'higher',
    'total_output_kg / NULLIF(runtime_hours, 0)',
    'Output per runtime hour.',
    1
  ),
  (
    'DOWNTIME_RATIO',
    'Downtime ratio',
    'operations',
    'ratio',
    'lower',
    '(planned_downtime_hours + unplanned_downtime_hours) / NULLIF(total_available_hours, 0)',
    'Share of available time lost to downtime.',
    2
  ),
  (
    'AVAILABILITY',
    'Availability',
    'oee',
    'ratio',
    'higher',
    'runtime_hours / NULLIF(total_available_hours, 0)',
    'Run time divided by available time.',
    3
  ),
  (
    'PERFORMANCE',
    'Performance (speed)',
    'oee',
    'ratio',
    'higher',
    'LEAST(1, actual_speed / NULLIF(design_speed, 0))',
    'Speed ratio capped at 100% when design_speed is provided.',
    3
  ),
  (
    'QUALITY',
    'Quality (first-pass good)',
    'oee',
    'ratio',
    'higher',
    'good_output_kg / NULLIF(total_output_kg, 0)',
    'Good output divided by total output.',
    3
  ),
  (
    'OEE',
    'OEE',
    'oee',
    'ratio',
    'higher',
    'availability * performance * quality (NULL if any factor NULL)',
    'Overall equipment effectiveness as product of A × P × Q.',
    1
  ),
  (
    'ENERGY_PER_KG',
    'Energy per kg',
    'energy',
    'kwh_per_kg',
    'lower',
    'total_energy_kwh / NULLIF(total_output_kg, 0)',
    'kWh per kilogram of output.',
    2
  ),
  (
    'ENERGY_COST_PER_KG',
    'Energy cost per kg',
    'energy',
    'money_per_kg',
    'lower',
    'energy_cost_amount / NULLIF(total_output_kg, 0)',
    'Energy cost per kilogram of output (currency from fact row).',
    3
  ),
  (
    'COST_PER_KG',
    'Cost per kg',
    'finance',
    'money_per_kg',
    'lower',
    'total_cost_amount / NULLIF(total_output_kg, 0)',
    'Total manufacturing cost per kilogram of output.',
    1
  ),
  (
    'MATERIAL_COST_RATIO',
    'Material cost ratio',
    'finance',
    'ratio',
    'lower',
    'raw_material_cost_amount / NULLIF(total_cost_amount, 0)',
    'Share of total cost from raw material.',
    3
  ),
  (
    'CONVERSION_COST_PER_KG',
    'Conversion cost per kg',
    'finance',
    'money_per_kg',
    'lower',
    '(total_cost_amount - raw_material_cost_amount) / NULLIF(total_output_kg, 0)',
    'Non-material cost per kilogram of output.',
    3
  ),
  (
    'REWORK_RATE',
    'Rework rate',
    'quality',
    'ratio',
    'lower',
    'rework_kg / NULLIF(total_output_kg, 0)',
    'Rework mass divided by total output.',
    3
  ),
  (
    'STARTUP_WASTE_RATIO',
    'Startup waste ratio',
    'quality',
    'ratio',
    'lower',
    'startup_waste_kg / NULLIF(scrap_kg, 0)',
    'Startup waste share of total scrap.',
    3
  ),
  (
    'BREAK_RATE_PER_H',
    'Break rate',
    'operations',
    'per_hour',
    'lower',
    'line_break_count::numeric / NULLIF(runtime_hours, 0)',
    'Line breaks per runtime hour.',
    3
  );
