-- F09: candidate sets, deterministic validation, priority scoring, and immutable comparisons.
-- Model never creates candidates: they come from the catalog or from analysts, with origin recorded.

CREATE TABLE analyst_candidates (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid NOT NULL REFERENCES projects(id),
  finding_id        uuid NOT NULL REFERENCES findings(id),
  version           int NOT NULL DEFAULT 1,
  payload           jsonb NOT NULL,
  addressed_problem text NOT NULL,
  source_reason     text NOT NULL,
  created_by        uuid REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE candidate_sets (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          uuid NOT NULL REFERENCES projects(id),
  finding_id          uuid NOT NULL REFERENCES findings(id),
  context_package_id  uuid NOT NULL REFERENCES context_packages(id),
  status              text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'validating', 'completed', 'failed')),
  requested_by        uuid REFERENCES users(id),
  error_message       text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  completed_at        timestamptz
);
CREATE INDEX candidate_sets_finding_idx ON candidate_sets (project_id, finding_id, created_at DESC);

CREATE TABLE priority_policies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id),
  version     int NOT NULL,
  weights     jsonb NOT NULL,
  created_by  uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, version)
);

CREATE TABLE candidate_validations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          uuid NOT NULL REFERENCES projects(id),
  candidate_set_id    uuid NOT NULL REFERENCES candidate_sets(id),
  candidate_link_id   uuid NOT NULL REFERENCES candidate_links(id),
  status              text NOT NULL CHECK (status IN ('queued', 'validating', 'validated', 'needs_review', 'insufficient_information', 'not_eligible', 'failed')),
  dataset_version_id  uuid NOT NULL REFERENCES dataset_versions(id),
  context_package_id  uuid NOT NULL REFERENCES context_packages(id),
  assessment_id       uuid REFERENCES assessments(id),
  evidence_bundle_id  uuid REFERENCES evidence_bundles(id),
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX candidate_validations_link_idx ON candidate_validations (candidate_link_id, created_at DESC);

CREATE TABLE validation_checks (
  validation_id   uuid NOT NULL REFERENCES candidate_validations(id),
  check_key       text NOT NULL,
  status          text NOT NULL CHECK (status IN ('pass', 'fail', 'not_evaluable')),
  failure_status  text,
  reason          text NOT NULL,
  details         jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (validation_id, check_key)
);

CREATE TABLE candidate_scores (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES projects(id),
  validation_id   uuid NOT NULL REFERENCES candidate_validations(id),
  policy_id       uuid REFERENCES priority_policies(id),
  policy_version  int NOT NULL,
  weights         jsonb NOT NULL,
  components      jsonb NOT NULL,
  missing         jsonb NOT NULL,
  partial         boolean NOT NULL,
  score           double precision,
  rank            int,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX candidate_scores_validation_idx ON candidate_scores (validation_id, created_at DESC);

CREATE TABLE candidate_comparisons (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid NOT NULL REFERENCES projects(id),
  finding_id        uuid NOT NULL REFERENCES findings(id),
  hash              text NOT NULL,
  candidate_link_ids uuid[] NOT NULL,
  validation_ids    uuid[] NOT NULL,
  assessment_ids    uuid[] NOT NULL,
  score_ids         uuid[] NOT NULL,
  bundle_ids        uuid[] NOT NULL,
  payload           jsonb NOT NULL,
  requested_by      uuid REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, hash)
);
CREATE TRIGGER candidate_comparisons_outbox AFTER INSERT ON candidate_comparisons FOR EACH ROW EXECUTE FUNCTION outbox_capture();

-- Validation, score and comparison records are historical: recompute means a new row.
CREATE FUNCTION recommendation_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'candidate_validations' AND OLD.status IN ('queued', 'validating') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION '% rows are immutable', TG_TABLE_NAME;
END $$;
CREATE TRIGGER candidate_validations_immutable BEFORE UPDATE OR DELETE ON candidate_validations FOR EACH ROW EXECUTE FUNCTION recommendation_immutable();
CREATE TRIGGER candidate_scores_immutable BEFORE UPDATE OR DELETE ON candidate_scores FOR EACH ROW EXECUTE FUNCTION recommendation_immutable();
CREATE TRIGGER candidate_comparisons_immutable BEFORE UPDATE OR DELETE ON candidate_comparisons FOR EACH ROW EXECUTE FUNCTION recommendation_immutable();

ALTER TABLE candidate_links DROP CONSTRAINT candidate_links_candidate_type_check;
ALTER TABLE candidate_links ADD CONSTRAINT candidate_links_candidate_type_check CHECK (candidate_type IN ('intervention', 'analyst'));
