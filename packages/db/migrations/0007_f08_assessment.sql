-- F08: structured Jev assessments of catalog candidates against findings.
-- Model output is immutable; human confirmation/correction lives in its own table.

-- Candidates come only from the catalog (and, from F09, analyst additions); one row per finding × candidate.
CREATE TABLE candidate_links (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          uuid NOT NULL REFERENCES projects(id),
  finding_id          uuid NOT NULL REFERENCES findings(id),
  context_package_id  uuid NOT NULL REFERENCES context_packages(id),
  candidate_type      text NOT NULL CHECK (candidate_type IN ('intervention', 'analyst')),
  candidate_id        uuid NOT NULL,
  candidate_key       text NOT NULL,
  candidate_version   int NOT NULL,
  origin              text NOT NULL,
  precondition_status text NOT NULL CHECK (precondition_status IN ('eligible', 'not_eligible', 'insufficient_information')),
  precondition_checks jsonb NOT NULL,
  latest_status       text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (finding_id, candidate_id)
);
CREATE INDEX candidate_links_finding_idx ON candidate_links (project_id, finding_id);

CREATE TABLE question_specs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid NOT NULL REFERENCES projects(id),
  task              text NOT NULL,
  primitive         text NOT NULL,
  version           int NOT NULL,
  spec              jsonb NOT NULL,
  status            text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded')),
  created_by        uuid REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, task, version)
);

CREATE TABLE assessment_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id),
  finding_id    uuid NOT NULL REFERENCES findings(id),
  trigger       text NOT NULL CHECK (trigger IN ('manual', 'recommendation_refresh')),
  requested_by  uuid REFERENCES users(id),
  status        text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  evidence_bundle_id uuid REFERENCES evidence_bundles(id),
  error_message text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz
);

CREATE TABLE assessments (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id              uuid NOT NULL REFERENCES projects(id),
  assessment_run_id       uuid NOT NULL REFERENCES assessment_runs(id),
  finding_id              uuid NOT NULL REFERENCES findings(id),
  candidate_link_id       uuid NOT NULL REFERENCES candidate_links(id),
  evidence_bundle_id      uuid REFERENCES evidence_bundles(id),
  question_specs          jsonb NOT NULL,
  rubric_id               uuid REFERENCES rubrics(id),
  rubric_version          int,
  adapter                 text NOT NULL,
  model                   text,
  model_version           text,
  idempotency_key         text NOT NULL,
  status                  text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'automatic', 'needs_review', 'insufficient_information', 'failed')),
  sufficiency_probability double precision,
  conclusion              text,
  distribution            jsonb,
  top_probability         double precision,
  margin                  double precision,
  total_score             double precision,
  missing_criteria        jsonb NOT NULL DEFAULT '[]'::jsonb,
  context_maybe_stale     boolean NOT NULL DEFAULT false,
  context_limited         boolean NOT NULL DEFAULT false,
  error_message           text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  completed_at            timestamptz
);
CREATE INDEX assessments_finding_idx ON assessments (project_id, finding_id, created_at DESC);
CREATE INDEX assessments_key_idx ON assessments (project_id, idempotency_key);
CREATE TRIGGER assessments_outbox AFTER INSERT OR UPDATE ON assessments FOR EACH ROW EXECUTE FUNCTION outbox_capture();

-- Once a result is final the model output never changes; corrections are separate rows.
CREATE FUNCTION assessments_final() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('automatic', 'needs_review', 'insufficient_information', 'failed') THEN
    RAISE EXCEPTION 'assessment % is final and immutable', OLD.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER assessments_final BEFORE UPDATE ON assessments FOR EACH ROW EXECUTE FUNCTION assessments_final();

CREATE TABLE assessment_criterion_results (
  assessment_id   uuid NOT NULL REFERENCES assessments(id),
  criterion_key   text NOT NULL,
  weight          double precision NOT NULL,
  score           int,
  normalized      double precision,
  probability     double precision,
  distribution    jsonb,
  PRIMARY KEY (assessment_id, criterion_key)
);

CREATE TABLE assessment_corrections (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid NOT NULL REFERENCES projects(id),
  assessment_id     uuid NOT NULL REFERENCES assessments(id),
  kind              text NOT NULL CHECK (kind IN ('confirm', 'correct')),
  conclusion        text,
  criteria          jsonb,
  reason            text NOT NULL,
  gold_candidate    boolean NOT NULL DEFAULT false,
  created_by        uuid REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER assessment_corrections_outbox AFTER INSERT ON assessment_corrections FOR EACH ROW EXECUTE FUNCTION outbox_capture();

CREATE FUNCTION corrections_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'assessment corrections are append-only';
END $$;
CREATE TRIGGER assessment_corrections_immutable BEFORE UPDATE OR DELETE ON assessment_corrections FOR EACH ROW EXECUTE FUNCTION corrections_immutable();

CREATE TABLE gold_set_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES projects(id),
  assessment_id   uuid NOT NULL REFERENCES assessments(id),
  correction_id   uuid NOT NULL REFERENCES assessment_corrections(id),
  label           text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assessment_id)
);

CREATE TABLE evaluation_runs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id),
  metrics     jsonb NOT NULL,
  created_by  uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE model_usage_events (
  id            bigserial PRIMARY KEY,
  project_id    uuid NOT NULL REFERENCES projects(id),
  kind          text NOT NULL CHECK (kind IN ('jev', 'llm')),
  provider      text NOT NULL,
  model         text,
  model_version text,
  request_id    text,
  operation     text NOT NULL,
  latency_ms    int,
  input_tokens  int,
  output_tokens int,
  cost          double precision,
  raw_key       text,
  subject_id    uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX model_usage_project_idx ON model_usage_events (project_id, kind, created_at);
