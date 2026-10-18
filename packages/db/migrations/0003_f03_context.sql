-- F03: versioned business context. Every item keeps draft -> reviewed -> approved -> obsolete;
-- approved items are immutable (a change is a new version). Analyses use an immutable context package.

CREATE TABLE context_documents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       uuid NOT NULL REFERENCES projects(id),
  title            text NOT NULL,
  reference        text NOT NULL DEFAULT '',
  version          text NOT NULL DEFAULT '1',
  excerpt          text NOT NULL DEFAULT '',
  status           text NOT NULL DEFAULT 'approved' CHECK (status IN ('draft', 'reviewed', 'approved', 'obsolete')),
  created_by       uuid REFERENCES users(id),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX context_documents_project_idx ON context_documents (project_id);

CREATE FUNCTION context_item_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'draft' AND (NEW.payload IS DISTINCT FROM OLD.payload OR NEW.item_key IS DISTINCT FROM OLD.item_key
      OR NEW.version IS DISTINCT FROM OLD.version OR NEW.source_document_id IS DISTINCT FROM OLD.source_document_id
      OR NEW.source_reference IS DISTINCT FROM OLD.source_reference) THEN
    RAISE EXCEPTION 'context item % is % and immutable', OLD.id, OLD.status;
  END IF;
  RETURN NEW;
END $$;

CREATE TABLE process_boundaries (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          uuid NOT NULL REFERENCES projects(id),
  item_key            text NOT NULL,
  version             int NOT NULL,
  status              text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'reviewed', 'approved', 'obsolete')),
  payload             jsonb NOT NULL,
  source_document_id  uuid REFERENCES context_documents(id),
  source_reference    text NOT NULL DEFAULT '',
  created_by          uuid REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  reviewed_by         uuid REFERENCES users(id),
  reviewed_at         timestamptz,
  approved_by         uuid REFERENCES users(id),
  approved_at         timestamptz,
  UNIQUE (project_id, item_key, version)
);
CREATE INDEX process_boundaries_project_idx ON process_boundaries (project_id, status);
CREATE TRIGGER process_boundaries_immutable BEFORE UPDATE ON process_boundaries FOR EACH ROW EXECUTE FUNCTION context_item_immutable();

CREATE TABLE rework_definitions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          uuid NOT NULL REFERENCES projects(id),
  item_key            text NOT NULL,
  version             int NOT NULL,
  status              text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'reviewed', 'approved', 'obsolete')),
  payload             jsonb NOT NULL,
  source_document_id  uuid REFERENCES context_documents(id),
  source_reference    text NOT NULL DEFAULT '',
  created_by          uuid REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  reviewed_by         uuid REFERENCES users(id),
  reviewed_at         timestamptz,
  approved_by         uuid REFERENCES users(id),
  approved_at         timestamptz,
  UNIQUE (project_id, item_key, version)
);
CREATE INDEX rework_definitions_project_idx ON rework_definitions (project_id, status);
CREATE TRIGGER rework_definitions_immutable BEFORE UPDATE ON rework_definitions FOR EACH ROW EXECUTE FUNCTION context_item_immutable();

CREATE TABLE rules (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          uuid NOT NULL REFERENCES projects(id),
  item_key            text NOT NULL,
  version             int NOT NULL,
  status              text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'reviewed', 'approved', 'obsolete')),
  payload             jsonb NOT NULL,
  source_document_id  uuid REFERENCES context_documents(id),
  source_reference    text NOT NULL DEFAULT '',
  created_by          uuid REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  reviewed_by         uuid REFERENCES users(id),
  reviewed_at         timestamptz,
  approved_by         uuid REFERENCES users(id),
  approved_at         timestamptz,
  UNIQUE (project_id, item_key, version)
);
CREATE INDEX rules_project_idx ON rules (project_id, status);
CREATE TRIGGER rules_immutable BEFORE UPDATE ON rules FOR EACH ROW EXECUTE FUNCTION context_item_immutable();

CREATE TABLE calendars (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          uuid NOT NULL REFERENCES projects(id),
  item_key            text NOT NULL,
  version             int NOT NULL,
  status              text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'reviewed', 'approved', 'obsolete')),
  payload             jsonb NOT NULL,
  source_document_id  uuid REFERENCES context_documents(id),
  source_reference    text NOT NULL DEFAULT '',
  created_by          uuid REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  reviewed_by         uuid REFERENCES users(id),
  reviewed_at         timestamptz,
  approved_by         uuid REFERENCES users(id),
  approved_at         timestamptz,
  UNIQUE (project_id, item_key, version)
);
CREATE INDEX calendars_project_idx ON calendars (project_id, status);
CREATE TRIGGER calendars_immutable BEFORE UPDATE ON calendars FOR EACH ROW EXECUTE FUNCTION context_item_immutable();

CREATE TABLE hypotheses (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          uuid NOT NULL REFERENCES projects(id),
  item_key            text NOT NULL,
  version             int NOT NULL,
  status              text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'reviewed', 'approved', 'obsolete')),
  payload             jsonb NOT NULL,
  source_document_id  uuid REFERENCES context_documents(id),
  source_reference    text NOT NULL DEFAULT '',
  created_by          uuid REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  reviewed_by         uuid REFERENCES users(id),
  reviewed_at         timestamptz,
  approved_by         uuid REFERENCES users(id),
  approved_at         timestamptz,
  UNIQUE (project_id, item_key, version)
);
CREATE INDEX hypotheses_project_idx ON hypotheses (project_id, status);
CREATE TRIGGER hypotheses_immutable BEFORE UPDATE ON hypotheses FOR EACH ROW EXECUTE FUNCTION context_item_immutable();

CREATE TABLE interventions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          uuid NOT NULL REFERENCES projects(id),
  item_key            text NOT NULL,
  version             int NOT NULL,
  status              text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'reviewed', 'approved', 'obsolete')),
  payload             jsonb NOT NULL,
  source_document_id  uuid REFERENCES context_documents(id),
  source_reference    text NOT NULL DEFAULT '',
  created_by          uuid REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  reviewed_by         uuid REFERENCES users(id),
  reviewed_at         timestamptz,
  approved_by         uuid REFERENCES users(id),
  approved_at         timestamptz,
  UNIQUE (project_id, item_key, version)
);
CREATE INDEX interventions_project_idx ON interventions (project_id, status);
CREATE TRIGGER interventions_immutable BEFORE UPDATE ON interventions FOR EACH ROW EXECUTE FUNCTION context_item_immutable();

CREATE TABLE rubrics (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          uuid NOT NULL REFERENCES projects(id),
  item_key            text NOT NULL,
  version             int NOT NULL,
  status              text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'reviewed', 'approved', 'obsolete')),
  payload             jsonb NOT NULL,
  source_document_id  uuid REFERENCES context_documents(id),
  source_reference    text NOT NULL DEFAULT '',
  created_by          uuid REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  reviewed_by         uuid REFERENCES users(id),
  reviewed_at         timestamptz,
  approved_by         uuid REFERENCES users(id),
  approved_at         timestamptz,
  UNIQUE (project_id, item_key, version)
);
CREATE INDEX rubrics_project_idx ON rubrics (project_id, status);
CREATE TRIGGER rubrics_immutable BEFORE UPDATE ON rubrics FOR EACH ROW EXECUTE FUNCTION context_item_immutable();

CREATE TABLE bpmn_models (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         uuid NOT NULL REFERENCES projects(id),
  item_key           text NOT NULL,
  version            int NOT NULL,
  name               text NOT NULL,
  file_name          text NOT NULL,
  object_key         text NOT NULL,
  sha256             text NOT NULL,
  status             text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'reviewed', 'approved', 'obsolete')),
  validation_status  text NOT NULL DEFAULT 'pending' CHECK (validation_status IN ('pending', 'valid', 'invalid')),
  readable           boolean NOT NULL DEFAULT false,
  validation_error   text,
  tasks              jsonb NOT NULL DEFAULT '[]'::jsonb,
  element_count      int,
  pm4py_summary      jsonb,
  source_document_id uuid REFERENCES context_documents(id),
  source_reference   text NOT NULL DEFAULT '',
  created_by         uuid REFERENCES users(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  approved_by        uuid REFERENCES users(id),
  approved_at        timestamptz,
  UNIQUE (project_id, item_key, version)
);

-- Task -> canonical activity labels. Records the model version and the dataset whose labels were used.
CREATE TABLE bpmn_mappings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          uuid NOT NULL REFERENCES projects(id),
  bpmn_model_id       uuid NOT NULL REFERENCES bpmn_models(id),
  version             int NOT NULL,
  mapping             jsonb NOT NULL,
  label_source_dataset_id uuid REFERENCES dataset_versions(id),
  conflicts           jsonb NOT NULL DEFAULT '[]'::jsonb,
  unmapped_tasks      jsonb NOT NULL DEFAULT '[]'::jsonb,
  unmapped_activities jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by          uuid REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bpmn_model_id, version)
);

CREATE TABLE context_packages (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            uuid NOT NULL REFERENCES projects(id),
  version               int NOT NULL,
  name                  text NOT NULL,
  status                text NOT NULL DEFAULT 'ready' CHECK (status IN ('draft', 'ready', 'active', 'superseded')),
  hash                  text NOT NULL,
  process_boundary_id   uuid NOT NULL REFERENCES process_boundaries(id),
  rework_definition_id  uuid REFERENCES rework_definitions(id),
  calendar_id           uuid REFERENCES calendars(id),
  bpmn_model_id         uuid REFERENCES bpmn_models(id),
  bpmn_mapping_id       uuid REFERENCES bpmn_mappings(id),
  rubric_id             uuid REFERENCES rubrics(id),
  conformance_available boolean NOT NULL DEFAULT false,
  created_by            uuid REFERENCES users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  activated_by          uuid REFERENCES users(id),
  activated_at          timestamptz,
  UNIQUE (project_id, version)
);
CREATE INDEX context_packages_project_idx ON context_packages (project_id, status);

CREATE TABLE context_package_refs (
  package_id   uuid NOT NULL REFERENCES context_packages(id),
  ref_type     text NOT NULL,
  ref_id       uuid NOT NULL,
  ref_key      text NOT NULL,
  ref_version  int NOT NULL,
  PRIMARY KEY (package_id, ref_type, ref_id)
);

-- A package's contents never change after it is frozen; only its status moves on.
CREATE FUNCTION context_packages_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.hash IS DISTINCT FROM OLD.hash OR NEW.process_boundary_id IS DISTINCT FROM OLD.process_boundary_id
     OR NEW.rework_definition_id IS DISTINCT FROM OLD.rework_definition_id OR NEW.bpmn_mapping_id IS DISTINCT FROM OLD.bpmn_mapping_id
     OR NEW.rubric_id IS DISTINCT FROM OLD.rubric_id OR NEW.calendar_id IS DISTINCT FROM OLD.calendar_id THEN
    RAISE EXCEPTION 'context package % is immutable', OLD.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER context_packages_immutable BEFORE UPDATE ON context_packages FOR EACH ROW EXECUTE FUNCTION context_packages_immutable();
CREATE FUNCTION context_package_refs_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'context package refs are immutable';
END $$;
CREATE TRIGGER context_package_refs_immutable BEFORE UPDATE OR DELETE ON context_package_refs FOR EACH ROW EXECUTE FUNCTION context_package_refs_immutable();
