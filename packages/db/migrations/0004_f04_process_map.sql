-- F04: analysis runs over a published dataset and an active context package, with the process map aggregates.
-- Per-case drill-down rows are loaded here so map, drawer and API count the same cases; events stay in Parquet.

CREATE TABLE analysis_runs (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id             uuid NOT NULL REFERENCES projects(id),
  dataset_version_id     uuid NOT NULL REFERENCES dataset_versions(id),
  context_package_id     uuid NOT NULL REFERENCES context_packages(id),
  type                   text NOT NULL DEFAULT 'process',
  filter_spec            jsonb NOT NULL,
  algorithm_version      text NOT NULL,
  analysis_key           text NOT NULL,
  status                 text NOT NULL DEFAULT 'queued'
                         CHECK (status IN ('queued', 'running', 'result_ready', 'completed', 'failed', 'cancelled')),
  artifact_prefix        text NOT NULL,
  requested_by           uuid REFERENCES users(id),
  error_message          text,
  coverage               jsonb,
  warnings               jsonb NOT NULL DEFAULT '[]'::jsonb,
  project_status_changed boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  started_at             timestamptz,
  result_ready_at        timestamptz,
  completed_at           timestamptz
);
CREATE INDEX analysis_runs_project_idx ON analysis_runs (project_id, created_at DESC);
CREATE INDEX analysis_runs_key_idx ON analysis_runs (project_id, analysis_key);

CREATE TABLE process_nodes (
  run_id                uuid NOT NULL REFERENCES analysis_runs(id),
  project_id            uuid NOT NULL REFERENCES projects(id),
  activity              text NOT NULL,
  event_count           bigint NOT NULL,
  case_count            bigint NOT NULL,
  case_share            double precision NOT NULL,
  start_count           bigint NOT NULL,
  end_count             bigint NOT NULL,
  boundary_start        boolean NOT NULL,
  boundary_end          boolean NOT NULL,
  service_median_s      double precision,
  PRIMARY KEY (run_id, activity)
);

CREATE TABLE process_edges (
  run_id                uuid NOT NULL REFERENCES analysis_runs(id),
  project_id            uuid NOT NULL REFERENCES projects(id),
  from_activity         text NOT NULL,
  to_activity           text NOT NULL,
  occurrence_count      bigint NOT NULL,
  case_count            bigint NOT NULL,
  median_wait_s         double precision NOT NULL,
  p90_wait_s            double precision NOT NULL,
  total_wait_s          double precision NOT NULL,
  contribution_share    double precision NOT NULL,
  PRIMARY KEY (run_id, from_activity, to_activity)
);

CREATE TABLE variants (
  run_id                uuid NOT NULL REFERENCES analysis_runs(id),
  project_id            uuid NOT NULL REFERENCES projects(id),
  rank                  int NOT NULL,
  sequence_hash         text NOT NULL,
  sequence              jsonb NOT NULL,
  case_count            bigint NOT NULL,
  share                 double precision NOT NULL,
  cumulative_share      double precision NOT NULL,
  median_duration_s     double precision NOT NULL,
  PRIMARY KEY (run_id, sequence_hash)
);

CREATE TABLE analysis_cases (
  run_id          uuid NOT NULL REFERENCES analysis_runs(id),
  project_id      uuid NOT NULL REFERENCES projects(id),
  case_uid        text NOT NULL,
  case_id         text NOT NULL,
  start_time      timestamptz,
  end_time        timestamptz,
  duration_s      double precision,
  event_count     int NOT NULL,
  first_activity  text,
  last_activity   text,
  variant_hash    text NOT NULL,
  row_start       bigint NOT NULL,
  row_end         bigint NOT NULL,
  PRIMARY KEY (run_id, case_uid)
);

CREATE TABLE analysis_case_edges (
  run_id          uuid NOT NULL REFERENCES analysis_runs(id),
  case_uid        text NOT NULL,
  from_activity   text NOT NULL,
  to_activity     text NOT NULL,
  occurrences     int NOT NULL,
  total_wait_s    double precision NOT NULL,
  max_wait_s      double precision NOT NULL,
  PRIMARY KEY (run_id, from_activity, to_activity, case_uid)
);

CREATE TABLE analysis_case_nodes (
  run_id          uuid NOT NULL REFERENCES analysis_runs(id),
  case_uid        text NOT NULL,
  activity        text NOT NULL,
  occurrences     int NOT NULL,
  PRIMARY KEY (run_id, activity, case_uid)
);
