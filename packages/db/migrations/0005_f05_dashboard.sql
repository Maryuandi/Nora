-- F05: metric registry, monitoring thresholds, measured results per run, and code-templated findings.
-- Dashboard aggregates live here; per-case artifacts stay in object storage, except finding_cases references.

CREATE TABLE metric_definitions (
  key                     text NOT NULL,
  version                 int NOT NULL,
  name                    text NOT NULL,
  description             text NOT NULL,
  formula                 text NOT NULL,
  population              text NOT NULL,
  unit                    text NOT NULL,
  implementation_version  text NOT NULL,
  reference_test          text NOT NULL,
  PRIMARY KEY (key, version)
);

CREATE TABLE monitoring_configs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id),
  version     int NOT NULL,
  config      jsonb NOT NULL,
  created_by  uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, version)
);

ALTER TABLE analysis_runs
  ADD COLUMN monitoring_config_id uuid REFERENCES monitoring_configs(id),
  ADD COLUMN monitoring_config jsonb,
  ADD COLUMN monitoring_status text NOT NULL DEFAULT 'pending' CHECK (monitoring_status IN ('pending', 'running', 'completed', 'failed')),
  ADD COLUMN monitoring_error text;

CREATE TABLE analysis_metrics (
  run_id          uuid NOT NULL REFERENCES analysis_runs(id),
  project_id      uuid NOT NULL REFERENCES projects(id),
  metric_key      text NOT NULL,
  metric_version  int NOT NULL,
  value           double precision,
  unit            text NOT NULL,
  available       boolean NOT NULL,
  reason          text,
  small_sample    boolean NOT NULL,
  population      jsonb NOT NULL,
  PRIMARY KEY (run_id, metric_key),
  FOREIGN KEY (metric_key, metric_version) REFERENCES metric_definitions (key, version)
);

CREATE TABLE analysis_metric_series (
  run_id          uuid NOT NULL REFERENCES analysis_runs(id),
  bucket          date NOT NULL,
  started         int NOT NULL,
  completed       int,
  median_duration_s double precision,
  PRIMARY KEY (run_id, bucket)
);

CREATE TABLE transition_metrics (
  run_id              uuid NOT NULL REFERENCES analysis_runs(id),
  project_id          uuid NOT NULL REFERENCES projects(id),
  from_activity       text NOT NULL,
  to_activity         text NOT NULL,
  rank                int NOT NULL,
  occurrences         bigint NOT NULL,
  case_count          bigint NOT NULL,
  median_wait_s       double precision,
  p90_wait_s          double precision,
  total_wait_s        double precision,
  contribution_share  double precision NOT NULL,
  affected_case_share double precision NOT NULL,
  delay_excess        double precision NOT NULL,
  severity            int NOT NULL,
  is_bottleneck       boolean NOT NULL,
  PRIMARY KEY (run_id, from_activity, to_activity)
);

CREATE TABLE rework_results (
  run_id        uuid PRIMARY KEY REFERENCES analysis_runs(id),
  project_id    uuid NOT NULL REFERENCES projects(id),
  result        jsonb NOT NULL
);

CREATE TABLE rule_evaluations (
  run_id          uuid NOT NULL REFERENCES analysis_runs(id),
  project_id      uuid NOT NULL REFERENCES projects(id),
  rule_id         uuid NOT NULL REFERENCES rules(id),
  rule_key        text NOT NULL,
  rule_version    int NOT NULL,
  name            text NOT NULL,
  compliant       int NOT NULL,
  non_compliant   int NOT NULL,
  not_evaluable   int NOT NULL,
  reasons         jsonb NOT NULL,
  PRIMARY KEY (run_id, rule_id)
);

CREATE TABLE conformance_results (
  run_id          uuid PRIMARY KEY REFERENCES analysis_runs(id),
  project_id      uuid NOT NULL REFERENCES projects(id),
  status          text NOT NULL CHECK (status IN ('available', 'unavailable', 'failed')),
  reason          text,
  bpmn_model_id   uuid REFERENCES bpmn_models(id),
  bpmn_mapping_id uuid REFERENCES bpmn_mappings(id),
  mapping_version int,
  fitness         double precision,
  variants        jsonb NOT NULL DEFAULT '[]'::jsonb,
  mismatches      jsonb NOT NULL DEFAULT '[]'::jsonb
);

-- Findings are immutable records of one run; only their presentation may change elsewhere.
CREATE TABLE findings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          uuid NOT NULL REFERENCES projects(id),
  analysis_run_id     uuid NOT NULL REFERENCES analysis_runs(id),
  type                text NOT NULL CHECK (type IN ('bottleneck_indication', 'high_rework', 'rule_non_compliance', 'bpmn_deviation', 'aging_backlog', 'worsening_trend')),
  title               text NOT NULL,
  summary             text NOT NULL,
  metric_key          text NOT NULL,
  metric_version      int NOT NULL,
  metrics             jsonb NOT NULL,
  population          jsonb NOT NULL,
  thresholds          jsonb NOT NULL,
  subject             jsonb NOT NULL,
  severity_score      int NOT NULL,
  severity_label      text NOT NULL,
  dataset_version_id  uuid NOT NULL REFERENCES dataset_versions(id),
  context_package_id  uuid NOT NULL REFERENCES context_packages(id),
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX findings_project_idx ON findings (project_id, analysis_run_id);

CREATE FUNCTION findings_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'finding % is immutable', OLD.id;
END $$;
CREATE TRIGGER findings_immutable BEFORE UPDATE ON findings FOR EACH ROW EXECUTE FUNCTION findings_immutable();

CREATE TABLE finding_cases (
  finding_id      uuid NOT NULL REFERENCES findings(id),
  project_id      uuid NOT NULL REFERENCES projects(id),
  case_uid        text NOT NULL,
  case_id         text NOT NULL,
  rank            int NOT NULL,
  support_metric  text NOT NULL,
  support_value   double precision,
  PRIMARY KEY (finding_id, case_uid)
);
CREATE INDEX finding_cases_rank_idx ON finding_cases (finding_id, rank);
