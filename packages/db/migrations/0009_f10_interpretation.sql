-- F10: LLM interpretation drafts. The model explains an evidence bundle; code checks and renders every number.
-- Original drafts, attempts, and check reports are never overwritten; acceptance is a separate version.

CREATE TABLE prompt_templates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id),
  target_type   text NOT NULL CHECK (target_type IN ('finding', 'assessment', 'candidate_comparison')),
  audience      text NOT NULL CHECK (audience IN ('analyst', 'process_owner')),
  version       int NOT NULL,
  body          jsonb NOT NULL,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded')),
  created_by    uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, target_type, audience, version)
);

CREATE TABLE interpretations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          uuid NOT NULL REFERENCES projects(id),
  target_type         text NOT NULL CHECK (target_type IN ('finding', 'assessment', 'candidate_comparison')),
  target_id           uuid NOT NULL,
  -- finding the target belongs to, for history and stale checks
  finding_id          uuid REFERENCES findings(id),
  audience            text NOT NULL CHECK (audience IN ('analyst', 'process_owner')),
  status              text NOT NULL DEFAULT 'queued'
                        CHECK (status IN ('queued', 'generating', 'checking', 'repairing', 'passed', 'failed_check', 'failed', 'accepted', 'flagged')),
  evidence_bundle_id  uuid REFERENCES evidence_bundles(id),
  prompt_template_id  uuid REFERENCES prompt_templates(id),
  template_version    int,
  provider            text,
  model               text,
  model_version       text,
  parameters          jsonb,
  checker_version     text,
  interpretation_key  text,
  nonce               text,
  regenerated_from    uuid REFERENCES interpretations(id),
  reused_from         uuid REFERENCES interpretations(id),
  attempts            int NOT NULL DEFAULT 0,
  -- structured model output (templates), offered metrics, and the code-rendered sections
  output              jsonb,
  offered             jsonb,
  rendered            jsonb,
  check_report        jsonb,
  input_tokens        int,
  output_tokens       int,
  cost                double precision,
  error_message       text,
  requested_by        uuid REFERENCES users(id),
  accepted_by         uuid REFERENCES users(id),
  accepted_at         timestamptz,
  flagged_by          uuid REFERENCES users(id),
  flagged_at          timestamptz,
  flag_reason         text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  completed_at        timestamptz
);
CREATE INDEX interpretations_target_idx ON interpretations (project_id, target_id, created_at DESC);
CREATE INDEX interpretations_key_idx ON interpretations (project_id, interpretation_key);
CREATE TRIGGER interpretations_outbox AFTER INSERT OR UPDATE ON interpretations FOR EACH ROW EXECUTE FUNCTION outbox_capture();

-- After checking finishes, the model draft and its report are frozen; only review fields may change.
CREATE FUNCTION interpretations_final() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('passed', 'failed_check', 'failed', 'accepted', 'flagged') THEN
    IF NEW.output IS DISTINCT FROM OLD.output OR NEW.rendered IS DISTINCT FROM OLD.rendered OR NEW.check_report IS DISTINCT FROM OLD.check_report
       OR NEW.evidence_bundle_id IS DISTINCT FROM OLD.evidence_bundle_id OR NEW.model IS DISTINCT FROM OLD.model OR NEW.offered IS DISTINCT FROM OLD.offered THEN
      RAISE EXCEPTION 'interpretation % draft is immutable', OLD.id;
    END IF;
    IF OLD.status IN ('failed_check', 'failed') AND NEW.status <> OLD.status THEN
      RAISE EXCEPTION 'interpretation % failed and cannot be reviewed', OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER interpretations_final BEFORE UPDATE ON interpretations FOR EACH ROW EXECUTE FUNCTION interpretations_final();

CREATE TABLE interpretation_attempts (
  interpretation_id uuid NOT NULL REFERENCES interpretations(id),
  attempt           int NOT NULL,
  request_id        text,
  model             text,
  finish_reason     text,
  latency_ms        int,
  input_tokens      int,
  output_tokens     int,
  raw_key           text NOT NULL,
  ok                boolean NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (interpretation_id, attempt)
);

CREATE TABLE check_reports (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interpretation_id uuid NOT NULL REFERENCES interpretations(id),
  attempt           int NOT NULL,
  checker_version   text NOT NULL,
  ok                boolean NOT NULL,
  violations        jsonb NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (interpretation_id, attempt)
);

CREATE TABLE interpretation_claims (
  interpretation_id uuid NOT NULL REFERENCES interpretations(id),
  ordinal           int NOT NULL,
  section_key       text NOT NULL,
  claim_type        text NOT NULL CHECK (claim_type IN ('measured_fact', 'interpretation', 'hypothesis', 'validated_recommendation')),
  text_template     text NOT NULL,
  text              text NOT NULL,
  citations         jsonb NOT NULL,
  metrics           jsonb NOT NULL,
  candidate_id      text,
  PRIMARY KEY (interpretation_id, ordinal)
);

-- Accepting writes a new version; the original model draft (version 1) stays as it was.
CREATE TABLE interpretation_versions (
  interpretation_id uuid NOT NULL REFERENCES interpretations(id),
  version           int NOT NULL,
  kind              text NOT NULL CHECK (kind IN ('model_draft', 'accepted_summary')),
  content           jsonb NOT NULL,
  created_by        uuid REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (interpretation_id, version)
);

CREATE FUNCTION interpretation_records_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END $$;
CREATE TRIGGER interpretation_attempts_immutable BEFORE UPDATE OR DELETE ON interpretation_attempts FOR EACH ROW EXECUTE FUNCTION interpretation_records_immutable();
CREATE TRIGGER check_reports_immutable BEFORE UPDATE OR DELETE ON check_reports FOR EACH ROW EXECUTE FUNCTION interpretation_records_immutable();
CREATE TRIGGER interpretation_claims_immutable BEFORE UPDATE OR DELETE ON interpretation_claims FOR EACH ROW EXECUTE FUNCTION interpretation_records_immutable();
CREATE TRIGGER interpretation_versions_immutable BEFORE UPDATE OR DELETE ON interpretation_versions FOR EACH ROW EXECUTE FUNCTION interpretation_records_immutable();
