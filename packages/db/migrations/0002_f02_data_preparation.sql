-- F02: sources, snapshots, mapping versions, dataset versions and their quality review.
-- Event rows stay in Parquet (datasets/{id}/events.parquet); PostgreSQL keeps status, lineage and summaries.

CREATE TABLE sources (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id),
  name        text NOT NULL,
  kind        text NOT NULL DEFAULT 'file' CHECK (kind IN ('file')),
  created_by  uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX sources_project_name_key ON sources (project_id, lower(name));

CREATE TABLE source_snapshots (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         uuid NOT NULL REFERENCES projects(id),
  source_id          uuid NOT NULL REFERENCES sources(id),
  status             text NOT NULL DEFAULT 'awaiting_upload'
                     CHECK (status IN ('awaiting_upload', 'validating', 'ready_for_mapping', 'needs_review', 'failed', 'cancelled')),
  file_name          text NOT NULL,
  declared_size      bigint NOT NULL,
  raw_key            text NOT NULL UNIQUE,
  staging_key        text,
  report_key         text,
  size_bytes         bigint,
  sha256             text,
  format             text,
  encoding           text,
  delimiter          text,
  row_count          bigint,
  invalid_row_count  bigint,
  columns            jsonb,
  preview            jsonb,
  suggested_mapping  jsonb,
  review_reasons     jsonb,
  error_code         text,
  error_message      text,
  reused_from        uuid REFERENCES source_snapshots(id),
  project_status_changed boolean NOT NULL DEFAULT false,
  created_by         uuid REFERENCES users(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  upload_completed_at timestamptz,
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX source_snapshots_source_idx ON source_snapshots (source_id, created_at DESC);
CREATE INDEX source_snapshots_checksum_idx ON source_snapshots (source_id, sha256) WHERE sha256 IS NOT NULL;

CREATE TABLE ingest_error_samples (
  id           bigserial PRIMARY KEY,
  project_id   uuid NOT NULL REFERENCES projects(id),
  snapshot_id  uuid NOT NULL REFERENCES source_snapshots(id),
  row_number   bigint,
  message      text NOT NULL
);
CREATE INDEX ingest_error_samples_snapshot_idx ON ingest_error_samples (snapshot_id);

-- Label map and repair rules are versioned inside the mapping config (JSONB): a change is a new version.
CREATE TABLE mapping_versions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id),
  source_id   uuid NOT NULL REFERENCES sources(id),
  version     int NOT NULL,
  config      jsonb NOT NULL,
  note        text NOT NULL DEFAULT '',
  created_by  uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, version)
);

CREATE TABLE dataset_versions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            uuid NOT NULL REFERENCES projects(id),
  source_id             uuid NOT NULL REFERENCES sources(id),
  snapshot_id           uuid NOT NULL REFERENCES source_snapshots(id),
  mapping_version_id    uuid NOT NULL REFERENCES mapping_versions(id),
  name                  text NOT NULL,
  version               int NOT NULL,
  status                text NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'processing', 'quality_review', 'published', 'superseded', 'failed')),
  quality_status        text CHECK (quality_status IN ('ready', 'ready_with_notes', 'not_ready')),
  content_hash          text NOT NULL,
  algorithm_version     text NOT NULL,
  event_count           bigint,
  case_count            bigint,
  excluded_event_count  bigint,
  activity_labels       jsonb,
  period_start          timestamptz,
  period_end            timestamptz,
  events_key            text NOT NULL,
  cases_key             text NOT NULL,
  report_key            text NOT NULL,
  error_message         text,
  created_by            uuid REFERENCES users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  processed_at          timestamptz,
  published_at          timestamptz,
  published_by          uuid REFERENCES users(id),
  UNIQUE (source_id, version)
);
CREATE INDEX dataset_versions_project_idx ON dataset_versions (project_id, status, published_at DESC);

-- Published datasets are immutable: only the published -> superseded transition may touch them.
CREATE FUNCTION dataset_versions_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('published', 'superseded') THEN
    IF NOT (OLD.status = 'published' AND NEW.status = 'superseded'
            AND NEW.content_hash = OLD.content_hash AND NEW.events_key = OLD.events_key AND NEW.mapping_version_id = OLD.mapping_version_id) THEN
      RAISE EXCEPTION 'published dataset % is immutable', OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER dataset_versions_immutable BEFORE UPDATE ON dataset_versions FOR EACH ROW EXECUTE FUNCTION dataset_versions_immutable();

CREATE TABLE quality_findings (
  id                  bigserial PRIMARY KEY,
  project_id          uuid NOT NULL REFERENCES projects(id),
  dataset_version_id  uuid NOT NULL REFERENCES dataset_versions(id),
  check_key           text NOT NULL,
  severity            text NOT NULL CHECK (severity IN ('high', 'medium', 'info')),
  event_count         bigint NOT NULL,
  case_count          bigint NOT NULL,
  event_share         double precision NOT NULL,
  case_share          double precision NOT NULL,
  excluded_event_count bigint NOT NULL DEFAULT 0,
  samples             jsonb NOT NULL
);
CREATE INDEX quality_findings_dataset_idx ON quality_findings (dataset_version_id);

CREATE TABLE capability_matrix (
  dataset_version_id  uuid PRIMARY KEY REFERENCES dataset_versions(id),
  project_id          uuid NOT NULL REFERENCES projects(id),
  capabilities        jsonb NOT NULL
);
