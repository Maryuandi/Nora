-- F07: transactional outbox feeding the Neo4j projection, projection state, and immutable evidence bundles.
-- PostgreSQL stays authoritative: the outbox only names the changed record; projectors re-read it, so replay = rebuild.

CREATE TABLE outbox_events (
  sequence          bigserial PRIMARY KEY,
  contract_version  int NOT NULL DEFAULT 1,
  project_id        uuid NOT NULL REFERENCES projects(id),
  aggregate_type    text NOT NULL,
  aggregate_id      uuid NOT NULL,
  event_type        text NOT NULL,
  occurred_at       timestamptz NOT NULL DEFAULT now(),
  payload           jsonb NOT NULL DEFAULT '{}'::jsonb,
  projected_at      timestamptz,
  attempts          int NOT NULL DEFAULT 0,
  last_error        text,
  dead_letter       boolean NOT NULL DEFAULT false
);
CREATE INDEX outbox_pending_idx ON outbox_events (project_id, sequence) WHERE projected_at IS NULL AND NOT dead_letter;

CREATE TABLE graph_projection_state (
  project_id         uuid PRIMARY KEY REFERENCES projects(id),
  last_sequence      bigint NOT NULL DEFAULT 0,
  last_projected_at  timestamptz,
  rebuild_requested_at timestamptz,
  rebuilt_at         timestamptz
);

-- Written in the same transaction as the authoritative mutation.
CREATE FUNCTION outbox_capture() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO outbox_events (project_id, aggregate_type, aggregate_id, event_type, payload)
  VALUES (NEW.project_id, TG_TABLE_NAME, NEW.id, lower(TG_OP), jsonb_build_object('status', to_jsonb(NEW)->'status'));
  RETURN NEW;
END $$;
CREATE TRIGGER sources_outbox AFTER INSERT OR UPDATE ON sources FOR EACH ROW EXECUTE FUNCTION outbox_capture();
CREATE TRIGGER source_snapshots_outbox AFTER INSERT OR UPDATE ON source_snapshots FOR EACH ROW EXECUTE FUNCTION outbox_capture();
CREATE TRIGGER mapping_versions_outbox AFTER INSERT OR UPDATE ON mapping_versions FOR EACH ROW EXECUTE FUNCTION outbox_capture();
CREATE TRIGGER dataset_versions_outbox AFTER INSERT OR UPDATE ON dataset_versions FOR EACH ROW EXECUTE FUNCTION outbox_capture();
CREATE TRIGGER context_documents_outbox AFTER INSERT OR UPDATE ON context_documents FOR EACH ROW EXECUTE FUNCTION outbox_capture();
CREATE TRIGGER process_boundaries_outbox AFTER INSERT OR UPDATE ON process_boundaries FOR EACH ROW EXECUTE FUNCTION outbox_capture();
CREATE TRIGGER rework_definitions_outbox AFTER INSERT OR UPDATE ON rework_definitions FOR EACH ROW EXECUTE FUNCTION outbox_capture();
CREATE TRIGGER rules_outbox AFTER INSERT OR UPDATE ON rules FOR EACH ROW EXECUTE FUNCTION outbox_capture();
CREATE TRIGGER calendars_outbox AFTER INSERT OR UPDATE ON calendars FOR EACH ROW EXECUTE FUNCTION outbox_capture();
CREATE TRIGGER hypotheses_outbox AFTER INSERT OR UPDATE ON hypotheses FOR EACH ROW EXECUTE FUNCTION outbox_capture();
CREATE TRIGGER interventions_outbox AFTER INSERT OR UPDATE ON interventions FOR EACH ROW EXECUTE FUNCTION outbox_capture();
CREATE TRIGGER rubrics_outbox AFTER INSERT OR UPDATE ON rubrics FOR EACH ROW EXECUTE FUNCTION outbox_capture();
CREATE TRIGGER bpmn_models_outbox AFTER INSERT OR UPDATE ON bpmn_models FOR EACH ROW EXECUTE FUNCTION outbox_capture();
CREATE TRIGGER bpmn_mappings_outbox AFTER INSERT OR UPDATE ON bpmn_mappings FOR EACH ROW EXECUTE FUNCTION outbox_capture();
CREATE TRIGGER context_packages_outbox AFTER INSERT OR UPDATE ON context_packages FOR EACH ROW EXECUTE FUNCTION outbox_capture();
CREATE TRIGGER analysis_runs_outbox AFTER INSERT OR UPDATE ON analysis_runs FOR EACH ROW EXECUTE FUNCTION outbox_capture();
CREATE TRIGGER findings_outbox AFTER INSERT OR UPDATE ON findings FOR EACH ROW EXECUTE FUNCTION outbox_capture();

-- Records that existed before the outbox: one seed event each, in a stable order.
INSERT INTO outbox_events (project_id, aggregate_type, aggregate_id, event_type) SELECT project_id, 'sources', id, 'seed' FROM sources ORDER BY created_at, id;
INSERT INTO outbox_events (project_id, aggregate_type, aggregate_id, event_type) SELECT project_id, 'source_snapshots', id, 'seed' FROM source_snapshots ORDER BY created_at, id;
INSERT INTO outbox_events (project_id, aggregate_type, aggregate_id, event_type) SELECT project_id, 'mapping_versions', id, 'seed' FROM mapping_versions ORDER BY created_at, id;
INSERT INTO outbox_events (project_id, aggregate_type, aggregate_id, event_type) SELECT project_id, 'dataset_versions', id, 'seed' FROM dataset_versions ORDER BY created_at, id;
INSERT INTO outbox_events (project_id, aggregate_type, aggregate_id, event_type) SELECT project_id, 'context_documents', id, 'seed' FROM context_documents ORDER BY created_at, id;
INSERT INTO outbox_events (project_id, aggregate_type, aggregate_id, event_type) SELECT project_id, 'process_boundaries', id, 'seed' FROM process_boundaries ORDER BY created_at, id;
INSERT INTO outbox_events (project_id, aggregate_type, aggregate_id, event_type) SELECT project_id, 'rework_definitions', id, 'seed' FROM rework_definitions ORDER BY created_at, id;
INSERT INTO outbox_events (project_id, aggregate_type, aggregate_id, event_type) SELECT project_id, 'rules', id, 'seed' FROM rules ORDER BY created_at, id;
INSERT INTO outbox_events (project_id, aggregate_type, aggregate_id, event_type) SELECT project_id, 'calendars', id, 'seed' FROM calendars ORDER BY created_at, id;
INSERT INTO outbox_events (project_id, aggregate_type, aggregate_id, event_type) SELECT project_id, 'hypotheses', id, 'seed' FROM hypotheses ORDER BY created_at, id;
INSERT INTO outbox_events (project_id, aggregate_type, aggregate_id, event_type) SELECT project_id, 'interventions', id, 'seed' FROM interventions ORDER BY created_at, id;
INSERT INTO outbox_events (project_id, aggregate_type, aggregate_id, event_type) SELECT project_id, 'rubrics', id, 'seed' FROM rubrics ORDER BY created_at, id;
INSERT INTO outbox_events (project_id, aggregate_type, aggregate_id, event_type) SELECT project_id, 'bpmn_models', id, 'seed' FROM bpmn_models ORDER BY created_at, id;
INSERT INTO outbox_events (project_id, aggregate_type, aggregate_id, event_type) SELECT project_id, 'bpmn_mappings', id, 'seed' FROM bpmn_mappings ORDER BY created_at, id;
INSERT INTO outbox_events (project_id, aggregate_type, aggregate_id, event_type) SELECT project_id, 'context_packages', id, 'seed' FROM context_packages ORDER BY created_at, id;
INSERT INTO outbox_events (project_id, aggregate_type, aggregate_id, event_type) SELECT project_id, 'analysis_runs', id, 'seed' FROM analysis_runs ORDER BY created_at, id;
INSERT INTO outbox_events (project_id, aggregate_type, aggregate_id, event_type) SELECT project_id, 'findings', id, 'seed' FROM findings ORDER BY created_at, id;

CREATE TABLE evidence_bundles (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          uuid NOT NULL REFERENCES projects(id),
  target_type         text NOT NULL CHECK (target_type IN ('finding', 'candidate_comparison', 'assessment')),
  target_id           uuid NOT NULL,
  purpose             text NOT NULL CHECK (purpose IN ('jev_assessment', 'llm_interpretation')),
  requested_by        uuid REFERENCES users(id),
  graph_sequence      bigint NOT NULL,
  hash                text NOT NULL,
  status              text NOT NULL DEFAULT 'ready' CHECK (status IN ('ready')),
  context_limited     boolean NOT NULL,
  context_maybe_stale boolean NOT NULL,
  object_key          text NOT NULL,
  max_items           int NOT NULL,
  max_estimated_tokens int NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, hash)
);
CREATE INDEX evidence_bundles_target_idx ON evidence_bundles (project_id, target_id, created_at DESC);
CREATE TRIGGER evidence_bundles_outbox AFTER INSERT ON evidence_bundles FOR EACH ROW EXECUTE FUNCTION outbox_capture();

CREATE TABLE evidence_bundle_items (
  bundle_id         uuid NOT NULL REFERENCES evidence_bundles(id),
  ordinal           int NOT NULL,
  item_type         text NOT NULL,
  item_id           text NOT NULL,
  item_version      text,
  relation_path     text NOT NULL,
  priority          int NOT NULL,
  included          boolean NOT NULL,
  exclusion_reason  text,
  estimated_tokens  int NOT NULL,
  content_ref       text,
  PRIMARY KEY (bundle_id, ordinal)
);

CREATE FUNCTION evidence_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'evidence bundles are immutable';
END $$;
CREATE TRIGGER evidence_bundles_immutable BEFORE UPDATE OR DELETE ON evidence_bundles FOR EACH ROW EXECUTE FUNCTION evidence_immutable();
CREATE TRIGGER evidence_bundle_items_immutable BEFORE UPDATE OR DELETE ON evidence_bundle_items FOR EACH ROW EXECUTE FUNCTION evidence_immutable();
