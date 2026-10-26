-- Squashed from the former hand-written migrations 0001-0009 (F01-F10).
-- Generated part: tables, keys, indexes. Hand-written part (bottom): what schema.prisma cannot express.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateTable
CREATE TABLE "activation_tokens" (
    "token_hash" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),

    CONSTRAINT "activation_tokens_pkey" PRIMARY KEY ("token_hash")
);

-- CreateTable
CREATE TABLE "analysis_case_edges" (
    "run_id" UUID NOT NULL,
    "case_uid" TEXT NOT NULL,
    "from_activity" TEXT NOT NULL,
    "to_activity" TEXT NOT NULL,
    "occurrences" INTEGER NOT NULL,
    "total_wait_s" DOUBLE PRECISION NOT NULL,
    "max_wait_s" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "analysis_case_edges_pkey" PRIMARY KEY ("run_id","from_activity","to_activity","case_uid")
);

-- CreateTable
CREATE TABLE "analysis_case_nodes" (
    "run_id" UUID NOT NULL,
    "case_uid" TEXT NOT NULL,
    "activity" TEXT NOT NULL,
    "occurrences" INTEGER NOT NULL,

    CONSTRAINT "analysis_case_nodes_pkey" PRIMARY KEY ("run_id","activity","case_uid")
);

-- CreateTable
CREATE TABLE "analysis_cases" (
    "run_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "case_uid" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "start_time" TIMESTAMPTZ(6),
    "end_time" TIMESTAMPTZ(6),
    "duration_s" DOUBLE PRECISION,
    "event_count" INTEGER NOT NULL,
    "first_activity" TEXT,
    "last_activity" TEXT,
    "variant_hash" TEXT NOT NULL,
    "row_start" BIGINT NOT NULL,
    "row_end" BIGINT NOT NULL,

    CONSTRAINT "analysis_cases_pkey" PRIMARY KEY ("run_id","case_uid")
);

-- CreateTable
CREATE TABLE "analysis_metric_series" (
    "run_id" UUID NOT NULL,
    "bucket" DATE NOT NULL,
    "started" INTEGER NOT NULL,
    "completed" INTEGER,
    "median_duration_s" DOUBLE PRECISION,

    CONSTRAINT "analysis_metric_series_pkey" PRIMARY KEY ("run_id","bucket")
);

-- CreateTable
CREATE TABLE "analysis_metrics" (
    "run_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "metric_key" TEXT NOT NULL,
    "metric_version" INTEGER NOT NULL,
    "value" DOUBLE PRECISION,
    "unit" TEXT NOT NULL,
    "available" BOOLEAN NOT NULL,
    "reason" TEXT,
    "small_sample" BOOLEAN NOT NULL,
    "population" JSONB NOT NULL,

    CONSTRAINT "analysis_metrics_pkey" PRIMARY KEY ("run_id","metric_key")
);

-- CreateTable
CREATE TABLE "analysis_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "dataset_version_id" UUID NOT NULL,
    "context_package_id" UUID NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'process',
    "filter_spec" JSONB NOT NULL,
    "algorithm_version" TEXT NOT NULL,
    "analysis_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "artifact_prefix" TEXT NOT NULL,
    "requested_by" UUID,
    "error_message" TEXT,
    "coverage" JSONB,
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "project_status_changed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(6),
    "result_ready_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "monitoring_config_id" UUID,
    "monitoring_config" JSONB,
    "monitoring_status" TEXT NOT NULL DEFAULT 'pending',
    "monitoring_error" TEXT,

    CONSTRAINT "analysis_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analyst_candidates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "finding_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "addressed_problem" TEXT NOT NULL,
    "source_reason" TEXT NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analyst_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_corrections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "conclusion" TEXT,
    "criteria" JSONB,
    "reason" TEXT NOT NULL,
    "gold_candidate" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_criterion_results" (
    "assessment_id" UUID NOT NULL,
    "criterion_key" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "score" INTEGER,
    "normalized" DOUBLE PRECISION,
    "probability" DOUBLE PRECISION,
    "distribution" JSONB,

    CONSTRAINT "assessment_criterion_results_pkey" PRIMARY KEY ("assessment_id","criterion_key")
);

-- CreateTable
CREATE TABLE "assessment_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "finding_id" UUID NOT NULL,
    "trigger" TEXT NOT NULL,
    "requested_by" UUID,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "evidence_bundle_id" UUID,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "assessment_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "assessment_run_id" UUID NOT NULL,
    "finding_id" UUID NOT NULL,
    "candidate_link_id" UUID NOT NULL,
    "evidence_bundle_id" UUID,
    "question_specs" JSONB NOT NULL,
    "rubric_id" UUID,
    "rubric_version" INTEGER,
    "adapter" TEXT NOT NULL,
    "model" TEXT,
    "model_version" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "sufficiency_probability" DOUBLE PRECISION,
    "conclusion" TEXT,
    "distribution" JSONB,
    "top_probability" DOUBLE PRECISION,
    "margin" DOUBLE PRECISION,
    "total_score" DOUBLE PRECISION,
    "missing_criteria" JSONB NOT NULL DEFAULT '[]',
    "context_maybe_stale" BOOLEAN NOT NULL DEFAULT false,
    "context_limited" BOOLEAN NOT NULL DEFAULT false,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" BIGSERIAL NOT NULL,
    "project_id" UUID,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "object_type" TEXT NOT NULL,
    "object_id" TEXT,
    "result" TEXT NOT NULL,
    "correlation_id" TEXT NOT NULL,
    "metadata_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bpmn_mappings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "bpmn_model_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "mapping" JSONB NOT NULL,
    "label_source_dataset_id" UUID,
    "conflicts" JSONB NOT NULL DEFAULT '[]',
    "unmapped_tasks" JSONB NOT NULL DEFAULT '[]',
    "unmapped_activities" JSONB NOT NULL DEFAULT '[]',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bpmn_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bpmn_models" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "item_key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "object_key" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "validation_status" TEXT NOT NULL DEFAULT 'pending',
    "readable" BOOLEAN NOT NULL DEFAULT false,
    "validation_error" TEXT,
    "tasks" JSONB NOT NULL DEFAULT '[]',
    "element_count" INTEGER,
    "pm4py_summary" JSONB,
    "source_document_id" UUID,
    "source_reference" TEXT NOT NULL DEFAULT '',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),

    CONSTRAINT "bpmn_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendars" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "item_key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "payload" JSONB NOT NULL,
    "source_document_id" UUID,
    "source_reference" TEXT NOT NULL DEFAULT '',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),

    CONSTRAINT "calendars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_comparisons" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "finding_id" UUID NOT NULL,
    "hash" TEXT NOT NULL,
    "candidate_link_ids" UUID[],
    "validation_ids" UUID[],
    "assessment_ids" UUID[],
    "score_ids" UUID[],
    "bundle_ids" UUID[],
    "payload" JSONB NOT NULL,
    "requested_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_comparisons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "finding_id" UUID NOT NULL,
    "context_package_id" UUID NOT NULL,
    "candidate_type" TEXT NOT NULL,
    "candidate_id" UUID NOT NULL,
    "candidate_key" TEXT NOT NULL,
    "candidate_version" INTEGER NOT NULL,
    "origin" TEXT NOT NULL,
    "precondition_status" TEXT NOT NULL,
    "precondition_checks" JSONB NOT NULL,
    "latest_status" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_scores" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "validation_id" UUID NOT NULL,
    "policy_id" UUID,
    "policy_version" INTEGER NOT NULL,
    "weights" JSONB NOT NULL,
    "components" JSONB NOT NULL,
    "missing" JSONB NOT NULL,
    "partial" BOOLEAN NOT NULL,
    "score" DOUBLE PRECISION,
    "rank" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_sets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "finding_id" UUID NOT NULL,
    "context_package_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "requested_by" UUID,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "candidate_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_validations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "candidate_set_id" UUID NOT NULL,
    "candidate_link_id" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "dataset_version_id" UUID NOT NULL,
    "context_package_id" UUID NOT NULL,
    "assessment_id" UUID,
    "evidence_bundle_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_validations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capability_matrix" (
    "dataset_version_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "capabilities" JSONB NOT NULL,

    CONSTRAINT "capability_matrix_pkey" PRIMARY KEY ("dataset_version_id")
);

-- CreateTable
CREATE TABLE "check_reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "interpretation_id" UUID NOT NULL,
    "attempt" INTEGER NOT NULL,
    "checker_version" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "violations" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "check_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "sector" TEXT NOT NULL DEFAULT '',
    "contact" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conformance_results" (
    "run_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "bpmn_model_id" UUID,
    "bpmn_mapping_id" UUID,
    "mapping_version" INTEGER,
    "fitness" DOUBLE PRECISION,
    "variants" JSONB NOT NULL DEFAULT '[]',
    "mismatches" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "conformance_results_pkey" PRIMARY KEY ("run_id")
);

-- CreateTable
CREATE TABLE "context_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "reference" TEXT NOT NULL DEFAULT '',
    "version" TEXT NOT NULL DEFAULT '1',
    "excerpt" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'approved',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "context_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "context_package_refs" (
    "package_id" UUID NOT NULL,
    "ref_type" TEXT NOT NULL,
    "ref_id" UUID NOT NULL,
    "ref_key" TEXT NOT NULL,
    "ref_version" INTEGER NOT NULL,

    CONSTRAINT "context_package_refs_pkey" PRIMARY KEY ("package_id","ref_type","ref_id")
);

-- CreateTable
CREATE TABLE "context_packages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "hash" TEXT NOT NULL,
    "process_boundary_id" UUID NOT NULL,
    "rework_definition_id" UUID,
    "calendar_id" UUID,
    "bpmn_model_id" UUID,
    "bpmn_mapping_id" UUID,
    "rubric_id" UUID,
    "conformance_available" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activated_by" UUID,
    "activated_at" TIMESTAMPTZ(6),

    CONSTRAINT "context_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dataset_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "snapshot_id" UUID NOT NULL,
    "mapping_version_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "quality_status" TEXT,
    "content_hash" TEXT NOT NULL,
    "algorithm_version" TEXT NOT NULL,
    "event_count" BIGINT,
    "case_count" BIGINT,
    "excluded_event_count" BIGINT,
    "activity_labels" JSONB,
    "period_start" TIMESTAMPTZ(6),
    "period_end" TIMESTAMPTZ(6),
    "events_key" TEXT NOT NULL,
    "cases_key" TEXT NOT NULL,
    "report_key" TEXT NOT NULL,
    "error_message" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(6),
    "published_at" TIMESTAMPTZ(6),
    "published_by" UUID,

    CONSTRAINT "dataset_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "metrics" JSONB NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evaluation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_bundle_items" (
    "bundle_id" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "item_type" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "item_version" TEXT,
    "relation_path" TEXT NOT NULL,
    "priority" INTEGER NOT NULL,
    "included" BOOLEAN NOT NULL,
    "exclusion_reason" TEXT,
    "estimated_tokens" INTEGER NOT NULL,
    "content_ref" TEXT,

    CONSTRAINT "evidence_bundle_items_pkey" PRIMARY KEY ("bundle_id","ordinal")
);

-- CreateTable
CREATE TABLE "evidence_bundles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "requested_by" UUID,
    "graph_sequence" BIGINT NOT NULL,
    "hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "context_limited" BOOLEAN NOT NULL,
    "context_maybe_stale" BOOLEAN NOT NULL,
    "object_key" TEXT NOT NULL,
    "max_items" INTEGER NOT NULL,
    "max_estimated_tokens" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_bundles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finding_cases" (
    "finding_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "case_uid" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "support_metric" TEXT NOT NULL,
    "support_value" DOUBLE PRECISION,

    CONSTRAINT "finding_cases_pkey" PRIMARY KEY ("finding_id","case_uid")
);

-- CreateTable
CREATE TABLE "findings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "analysis_run_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "metric_key" TEXT NOT NULL,
    "metric_version" INTEGER NOT NULL,
    "metrics" JSONB NOT NULL,
    "population" JSONB NOT NULL,
    "thresholds" JSONB NOT NULL,
    "subject" JSONB NOT NULL,
    "severity_score" INTEGER NOT NULL,
    "severity_label" TEXT NOT NULL,
    "dataset_version_id" UUID NOT NULL,
    "context_package_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gold_set_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "correction_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gold_set_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "graph_projection_state" (
    "project_id" UUID NOT NULL,
    "last_sequence" BIGINT NOT NULL DEFAULT 0,
    "last_projected_at" TIMESTAMPTZ(6),
    "rebuild_requested_at" TIMESTAMPTZ(6),
    "rebuilt_at" TIMESTAMPTZ(6),

    CONSTRAINT "graph_projection_state_pkey" PRIMARY KEY ("project_id")
);

-- CreateTable
CREATE TABLE "hypotheses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "item_key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "payload" JSONB NOT NULL,
    "source_document_id" UUID,
    "source_reference" TEXT NOT NULL DEFAULT '',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),

    CONSTRAINT "hypotheses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingest_error_samples" (
    "id" BIGSERIAL NOT NULL,
    "project_id" UUID NOT NULL,
    "snapshot_id" UUID NOT NULL,
    "row_number" BIGINT,
    "message" TEXT NOT NULL,

    CONSTRAINT "ingest_error_samples_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interpretation_attempts" (
    "interpretation_id" UUID NOT NULL,
    "attempt" INTEGER NOT NULL,
    "request_id" TEXT,
    "model" TEXT,
    "finish_reason" TEXT,
    "latency_ms" INTEGER,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "raw_key" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interpretation_attempts_pkey" PRIMARY KEY ("interpretation_id","attempt")
);

-- CreateTable
CREATE TABLE "interpretation_claims" (
    "interpretation_id" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "section_key" TEXT NOT NULL,
    "claim_type" TEXT NOT NULL,
    "text_template" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "citations" JSONB NOT NULL,
    "metrics" JSONB NOT NULL,
    "candidate_id" TEXT,

    CONSTRAINT "interpretation_claims_pkey" PRIMARY KEY ("interpretation_id","ordinal")
);

-- CreateTable
CREATE TABLE "interpretation_versions" (
    "interpretation_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interpretation_versions_pkey" PRIMARY KEY ("interpretation_id","version")
);

-- CreateTable
CREATE TABLE "interpretations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" UUID NOT NULL,
    "finding_id" UUID,
    "audience" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "evidence_bundle_id" UUID,
    "prompt_template_id" UUID,
    "template_version" INTEGER,
    "provider" TEXT,
    "model" TEXT,
    "model_version" TEXT,
    "parameters" JSONB,
    "checker_version" TEXT,
    "interpretation_key" TEXT,
    "nonce" TEXT,
    "regenerated_from" UUID,
    "reused_from" UUID,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "output" JSONB,
    "offered" JSONB,
    "rendered" JSONB,
    "check_report" JSONB,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "cost" DOUBLE PRECISION,
    "error_message" TEXT,
    "requested_by" UUID,
    "accepted_by" UUID,
    "accepted_at" TIMESTAMPTZ(6),
    "flagged_by" UUID,
    "flagged_at" TIMESTAMPTZ(6),
    "flag_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "interpretations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interventions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "item_key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "payload" JSONB NOT NULL,
    "source_document_id" UUID,
    "source_reference" TEXT NOT NULL DEFAULT '',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),

    CONSTRAINT "interventions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mapping_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "config" JSONB NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mapping_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "project_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "added_by" UUID,
    "added_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("project_id","user_id")
);

-- CreateTable
CREATE TABLE "metric_definitions" (
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "formula" TEXT NOT NULL,
    "population" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "implementation_version" TEXT NOT NULL,
    "reference_test" TEXT NOT NULL,

    CONSTRAINT "metric_definitions_pkey" PRIMARY KEY ("key","version")
);

-- CreateTable
CREATE TABLE "model_usage_events" (
    "id" BIGSERIAL NOT NULL,
    "project_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "model_version" TEXT,
    "request_id" TEXT,
    "operation" TEXT NOT NULL,
    "latency_ms" INTEGER,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "cost" DOUBLE PRECISION,
    "raw_key" TEXT,
    "subject_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monitoring_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "config" JSONB NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monitoring_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "sequence" BIGSERIAL NOT NULL,
    "contract_version" INTEGER NOT NULL DEFAULT 1,
    "project_id" UUID NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "projected_at" TIMESTAMPTZ(6),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "dead_letter" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("sequence")
);

-- CreateTable
CREATE TABLE "priority_policies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "weights" JSONB NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "priority_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "process_boundaries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "item_key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "payload" JSONB NOT NULL,
    "source_document_id" UUID,
    "source_reference" TEXT NOT NULL DEFAULT '',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),

    CONSTRAINT "process_boundaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "process_edges" (
    "run_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "from_activity" TEXT NOT NULL,
    "to_activity" TEXT NOT NULL,
    "occurrence_count" BIGINT NOT NULL,
    "case_count" BIGINT NOT NULL,
    "median_wait_s" DOUBLE PRECISION NOT NULL,
    "p90_wait_s" DOUBLE PRECISION NOT NULL,
    "total_wait_s" DOUBLE PRECISION NOT NULL,
    "contribution_share" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "process_edges_pkey" PRIMARY KEY ("run_id","from_activity","to_activity")
);

-- CreateTable
CREATE TABLE "process_nodes" (
    "run_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "activity" TEXT NOT NULL,
    "event_count" BIGINT NOT NULL,
    "case_count" BIGINT NOT NULL,
    "case_share" DOUBLE PRECISION NOT NULL,
    "start_count" BIGINT NOT NULL,
    "end_count" BIGINT NOT NULL,
    "boundary_start" BOOLEAN NOT NULL,
    "boundary_end" BOOLEAN NOT NULL,
    "service_median_s" DOUBLE PRECISION,

    CONSTRAINT "process_nodes_pkey" PRIMARY KEY ("run_id","activity")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "process_name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Jakarta',
    "contract_start" DATE NOT NULL,
    "contract_end" DATE NOT NULL,
    "retention_policy" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "status_changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_activity_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "target_type" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "body" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prompt_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quality_findings" (
    "id" BIGSERIAL NOT NULL,
    "project_id" UUID NOT NULL,
    "dataset_version_id" UUID NOT NULL,
    "check_key" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "event_count" BIGINT NOT NULL,
    "case_count" BIGINT NOT NULL,
    "event_share" DOUBLE PRECISION NOT NULL,
    "case_share" DOUBLE PRECISION NOT NULL,
    "excluded_event_count" BIGINT NOT NULL DEFAULT 0,
    "samples" JSONB NOT NULL,

    CONSTRAINT "quality_findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_specs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "task" TEXT NOT NULL,
    "primitive" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "spec" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_specs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rework_definitions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "item_key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "payload" JSONB NOT NULL,
    "source_document_id" UUID,
    "source_reference" TEXT NOT NULL DEFAULT '',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),

    CONSTRAINT "rework_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rework_results" (
    "run_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "result" JSONB NOT NULL,

    CONSTRAINT "rework_results_pkey" PRIMARY KEY ("run_id")
);

-- CreateTable
CREATE TABLE "rubrics" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "item_key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "payload" JSONB NOT NULL,
    "source_document_id" UUID,
    "source_reference" TEXT NOT NULL DEFAULT '',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),

    CONSTRAINT "rubrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rule_evaluations" (
    "run_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "rule_id" UUID NOT NULL,
    "rule_key" TEXT NOT NULL,
    "rule_version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "compliant" INTEGER NOT NULL,
    "non_compliant" INTEGER NOT NULL,
    "not_evaluable" INTEGER NOT NULL,
    "reasons" JSONB NOT NULL,

    CONSTRAINT "rule_evaluations_pkey" PRIMARY KEY ("run_id","rule_id")
);

-- CreateTable
CREATE TABLE "rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "item_key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "payload" JSONB NOT NULL,
    "source_document_id" UUID,
    "source_reference" TEXT NOT NULL DEFAULT '',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),

    CONSTRAINT "rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'awaiting_upload',
    "file_name" TEXT NOT NULL,
    "declared_size" BIGINT NOT NULL,
    "raw_key" TEXT NOT NULL,
    "staging_key" TEXT,
    "report_key" TEXT,
    "size_bytes" BIGINT,
    "sha256" TEXT,
    "format" TEXT,
    "encoding" TEXT,
    "delimiter" TEXT,
    "row_count" BIGINT,
    "invalid_row_count" BIGINT,
    "columns" JSONB,
    "preview" JSONB,
    "suggested_mapping" JSONB,
    "review_reasons" JSONB,
    "error_code" TEXT,
    "error_message" TEXT,
    "reused_from" UUID,
    "project_status_changed" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "upload_completed_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "source_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sources" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'file',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transition_metrics" (
    "run_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "from_activity" TEXT NOT NULL,
    "to_activity" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "occurrences" BIGINT NOT NULL,
    "case_count" BIGINT NOT NULL,
    "median_wait_s" DOUBLE PRECISION,
    "p90_wait_s" DOUBLE PRECISION,
    "total_wait_s" DOUBLE PRECISION,
    "contribution_share" DOUBLE PRECISION NOT NULL,
    "affected_case_share" DOUBLE PRECISION NOT NULL,
    "delay_excess" DOUBLE PRECISION NOT NULL,
    "severity" INTEGER NOT NULL,
    "is_bottleneck" BOOLEAN NOT NULL,

    CONSTRAINT "transition_metrics_pkey" PRIMARY KEY ("run_id","from_activity","to_activity")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" CITEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT,
    "global_role" TEXT NOT NULL DEFAULT 'member',
    "status" TEXT NOT NULL DEFAULT 'invited',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "validation_checks" (
    "validation_id" UUID NOT NULL,
    "check_key" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "failure_status" TEXT,
    "reason" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "validation_checks_pkey" PRIMARY KEY ("validation_id","check_key")
);

-- CreateTable
CREATE TABLE "variants" (
    "run_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "rank" INTEGER NOT NULL,
    "sequence_hash" TEXT NOT NULL,
    "sequence" JSONB NOT NULL,
    "case_count" BIGINT NOT NULL,
    "share" DOUBLE PRECISION NOT NULL,
    "cumulative_share" DOUBLE PRECISION NOT NULL,
    "median_duration_s" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "variants_pkey" PRIMARY KEY ("run_id","sequence_hash")
);

-- CreateIndex
CREATE INDEX "analysis_runs_key_idx" ON "analysis_runs"("project_id", "analysis_key");

-- CreateIndex
CREATE INDEX "analysis_runs_project_idx" ON "analysis_runs"("project_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "assessments_finding_idx" ON "assessments"("project_id", "finding_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "assessments_key_idx" ON "assessments"("project_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "audit_events_project_idx" ON "audit_events"("project_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "bpmn_mappings_bpmn_model_id_version_key" ON "bpmn_mappings"("bpmn_model_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "bpmn_models_project_id_item_key_version_key" ON "bpmn_models"("project_id", "item_key", "version");

-- CreateIndex
CREATE INDEX "calendars_project_idx" ON "calendars"("project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "calendars_project_id_item_key_version_key" ON "calendars"("project_id", "item_key", "version");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_comparisons_project_id_hash_key" ON "candidate_comparisons"("project_id", "hash");

-- CreateIndex
CREATE INDEX "candidate_links_finding_idx" ON "candidate_links"("project_id", "finding_id");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_links_finding_id_candidate_id_key" ON "candidate_links"("finding_id", "candidate_id");

-- CreateIndex
CREATE INDEX "candidate_scores_validation_idx" ON "candidate_scores"("validation_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "candidate_sets_finding_idx" ON "candidate_sets"("project_id", "finding_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "candidate_validations_link_idx" ON "candidate_validations"("candidate_link_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "check_reports_interpretation_id_attempt_key" ON "check_reports"("interpretation_id", "attempt");

-- CreateIndex
CREATE INDEX "context_documents_project_idx" ON "context_documents"("project_id");

-- CreateIndex
CREATE INDEX "context_packages_project_idx" ON "context_packages"("project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "context_packages_project_id_version_key" ON "context_packages"("project_id", "version");

-- CreateIndex
CREATE INDEX "dataset_versions_project_idx" ON "dataset_versions"("project_id", "status", "published_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "dataset_versions_source_id_version_key" ON "dataset_versions"("source_id", "version");

-- CreateIndex
CREATE INDEX "evidence_bundles_target_idx" ON "evidence_bundles"("project_id", "target_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "evidence_bundles_project_id_hash_key" ON "evidence_bundles"("project_id", "hash");

-- CreateIndex
CREATE INDEX "finding_cases_rank_idx" ON "finding_cases"("finding_id", "rank");

-- CreateIndex
CREATE INDEX "findings_project_idx" ON "findings"("project_id", "analysis_run_id");

-- CreateIndex
CREATE UNIQUE INDEX "gold_set_items_assessment_id_key" ON "gold_set_items"("assessment_id");

-- CreateIndex
CREATE INDEX "hypotheses_project_idx" ON "hypotheses"("project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "hypotheses_project_id_item_key_version_key" ON "hypotheses"("project_id", "item_key", "version");

-- CreateIndex
CREATE INDEX "ingest_error_samples_snapshot_idx" ON "ingest_error_samples"("snapshot_id");

-- CreateIndex
CREATE INDEX "interpretations_key_idx" ON "interpretations"("project_id", "interpretation_key");

-- CreateIndex
CREATE INDEX "interpretations_target_idx" ON "interpretations"("project_id", "target_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "interventions_project_idx" ON "interventions"("project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "interventions_project_id_item_key_version_key" ON "interventions"("project_id", "item_key", "version");

-- CreateIndex
CREATE UNIQUE INDEX "mapping_versions_source_id_version_key" ON "mapping_versions"("source_id", "version");

-- CreateIndex
CREATE INDEX "memberships_user_project_idx" ON "memberships"("user_id", "project_id");

-- CreateIndex
CREATE INDEX "model_usage_project_idx" ON "model_usage_events"("project_id", "kind", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "monitoring_configs_project_id_version_key" ON "monitoring_configs"("project_id", "version");

-- CreateIndex
CREATE INDEX "outbox_pending_idx" ON "outbox_events"("project_id", "sequence") WHERE ((projected_at IS NULL) AND (NOT dead_letter));

-- CreateIndex
CREATE UNIQUE INDEX "priority_policies_project_id_version_key" ON "priority_policies"("project_id", "version");

-- CreateIndex
CREATE INDEX "process_boundaries_project_idx" ON "process_boundaries"("project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "process_boundaries_project_id_item_key_version_key" ON "process_boundaries"("project_id", "item_key", "version");

-- CreateIndex
CREATE UNIQUE INDEX "prompt_templates_project_id_target_type_audience_version_key" ON "prompt_templates"("project_id", "target_type", "audience", "version");

-- CreateIndex
CREATE INDEX "quality_findings_dataset_idx" ON "quality_findings"("dataset_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "question_specs_project_id_task_version_key" ON "question_specs"("project_id", "task", "version");

-- CreateIndex
CREATE INDEX "rework_definitions_project_idx" ON "rework_definitions"("project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "rework_definitions_project_id_item_key_version_key" ON "rework_definitions"("project_id", "item_key", "version");

-- CreateIndex
CREATE INDEX "rubrics_project_idx" ON "rubrics"("project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "rubrics_project_id_item_key_version_key" ON "rubrics"("project_id", "item_key", "version");

-- CreateIndex
CREATE INDEX "rules_project_idx" ON "rules"("project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "rules_project_id_item_key_version_key" ON "rules"("project_id", "item_key", "version");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "source_snapshots_raw_key_key" ON "source_snapshots"("raw_key");

-- CreateIndex
CREATE INDEX "source_snapshots_checksum_idx" ON "source_snapshots"("source_id", "sha256") WHERE (sha256 IS NOT NULL);

-- CreateIndex
CREATE INDEX "source_snapshots_source_idx" ON "source_snapshots"("source_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- AddForeignKey
ALTER TABLE "activation_tokens" ADD CONSTRAINT "activation_tokens_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "activation_tokens" ADD CONSTRAINT "activation_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "analysis_case_edges" ADD CONSTRAINT "analysis_case_edges_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "analysis_runs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "analysis_case_nodes" ADD CONSTRAINT "analysis_case_nodes_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "analysis_runs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "analysis_cases" ADD CONSTRAINT "analysis_cases_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "analysis_cases" ADD CONSTRAINT "analysis_cases_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "analysis_runs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "analysis_metric_series" ADD CONSTRAINT "analysis_metric_series_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "analysis_runs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "analysis_metrics" ADD CONSTRAINT "analysis_metrics_metric_key_metric_version_fkey" FOREIGN KEY ("metric_key", "metric_version") REFERENCES "metric_definitions"("key", "version") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "analysis_metrics" ADD CONSTRAINT "analysis_metrics_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "analysis_metrics" ADD CONSTRAINT "analysis_metrics_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "analysis_runs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "analysis_runs" ADD CONSTRAINT "analysis_runs_context_package_id_fkey" FOREIGN KEY ("context_package_id") REFERENCES "context_packages"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "analysis_runs" ADD CONSTRAINT "analysis_runs_dataset_version_id_fkey" FOREIGN KEY ("dataset_version_id") REFERENCES "dataset_versions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "analysis_runs" ADD CONSTRAINT "analysis_runs_monitoring_config_id_fkey" FOREIGN KEY ("monitoring_config_id") REFERENCES "monitoring_configs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "analysis_runs" ADD CONSTRAINT "analysis_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "analysis_runs" ADD CONSTRAINT "analysis_runs_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "analyst_candidates" ADD CONSTRAINT "analyst_candidates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "analyst_candidates" ADD CONSTRAINT "analyst_candidates_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "findings"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "analyst_candidates" ADD CONSTRAINT "analyst_candidates_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "assessment_corrections" ADD CONSTRAINT "assessment_corrections_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "assessment_corrections" ADD CONSTRAINT "assessment_corrections_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "assessment_corrections" ADD CONSTRAINT "assessment_corrections_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "assessment_criterion_results" ADD CONSTRAINT "assessment_criterion_results_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "assessment_runs" ADD CONSTRAINT "assessment_runs_evidence_bundle_id_fkey" FOREIGN KEY ("evidence_bundle_id") REFERENCES "evidence_bundles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "assessment_runs" ADD CONSTRAINT "assessment_runs_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "findings"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "assessment_runs" ADD CONSTRAINT "assessment_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "assessment_runs" ADD CONSTRAINT "assessment_runs_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_assessment_run_id_fkey" FOREIGN KEY ("assessment_run_id") REFERENCES "assessment_runs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_candidate_link_id_fkey" FOREIGN KEY ("candidate_link_id") REFERENCES "candidate_links"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_evidence_bundle_id_fkey" FOREIGN KEY ("evidence_bundle_id") REFERENCES "evidence_bundles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "findings"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_rubric_id_fkey" FOREIGN KEY ("rubric_id") REFERENCES "rubrics"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bpmn_mappings" ADD CONSTRAINT "bpmn_mappings_bpmn_model_id_fkey" FOREIGN KEY ("bpmn_model_id") REFERENCES "bpmn_models"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bpmn_mappings" ADD CONSTRAINT "bpmn_mappings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bpmn_mappings" ADD CONSTRAINT "bpmn_mappings_label_source_dataset_id_fkey" FOREIGN KEY ("label_source_dataset_id") REFERENCES "dataset_versions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bpmn_mappings" ADD CONSTRAINT "bpmn_mappings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bpmn_models" ADD CONSTRAINT "bpmn_models_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bpmn_models" ADD CONSTRAINT "bpmn_models_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bpmn_models" ADD CONSTRAINT "bpmn_models_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bpmn_models" ADD CONSTRAINT "bpmn_models_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "context_documents"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "context_documents"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "candidate_comparisons" ADD CONSTRAINT "candidate_comparisons_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "findings"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "candidate_comparisons" ADD CONSTRAINT "candidate_comparisons_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "candidate_comparisons" ADD CONSTRAINT "candidate_comparisons_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "candidate_links" ADD CONSTRAINT "candidate_links_context_package_id_fkey" FOREIGN KEY ("context_package_id") REFERENCES "context_packages"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "candidate_links" ADD CONSTRAINT "candidate_links_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "findings"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "candidate_links" ADD CONSTRAINT "candidate_links_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "candidate_scores" ADD CONSTRAINT "candidate_scores_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "priority_policies"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "candidate_scores" ADD CONSTRAINT "candidate_scores_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "candidate_scores" ADD CONSTRAINT "candidate_scores_validation_id_fkey" FOREIGN KEY ("validation_id") REFERENCES "candidate_validations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "candidate_sets" ADD CONSTRAINT "candidate_sets_context_package_id_fkey" FOREIGN KEY ("context_package_id") REFERENCES "context_packages"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "candidate_sets" ADD CONSTRAINT "candidate_sets_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "findings"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "candidate_sets" ADD CONSTRAINT "candidate_sets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "candidate_sets" ADD CONSTRAINT "candidate_sets_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "candidate_validations" ADD CONSTRAINT "candidate_validations_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "candidate_validations" ADD CONSTRAINT "candidate_validations_candidate_link_id_fkey" FOREIGN KEY ("candidate_link_id") REFERENCES "candidate_links"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "candidate_validations" ADD CONSTRAINT "candidate_validations_candidate_set_id_fkey" FOREIGN KEY ("candidate_set_id") REFERENCES "candidate_sets"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "candidate_validations" ADD CONSTRAINT "candidate_validations_context_package_id_fkey" FOREIGN KEY ("context_package_id") REFERENCES "context_packages"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "candidate_validations" ADD CONSTRAINT "candidate_validations_dataset_version_id_fkey" FOREIGN KEY ("dataset_version_id") REFERENCES "dataset_versions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "candidate_validations" ADD CONSTRAINT "candidate_validations_evidence_bundle_id_fkey" FOREIGN KEY ("evidence_bundle_id") REFERENCES "evidence_bundles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "candidate_validations" ADD CONSTRAINT "candidate_validations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "capability_matrix" ADD CONSTRAINT "capability_matrix_dataset_version_id_fkey" FOREIGN KEY ("dataset_version_id") REFERENCES "dataset_versions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "capability_matrix" ADD CONSTRAINT "capability_matrix_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "check_reports" ADD CONSTRAINT "check_reports_interpretation_id_fkey" FOREIGN KEY ("interpretation_id") REFERENCES "interpretations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "conformance_results" ADD CONSTRAINT "conformance_results_bpmn_mapping_id_fkey" FOREIGN KEY ("bpmn_mapping_id") REFERENCES "bpmn_mappings"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "conformance_results" ADD CONSTRAINT "conformance_results_bpmn_model_id_fkey" FOREIGN KEY ("bpmn_model_id") REFERENCES "bpmn_models"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "conformance_results" ADD CONSTRAINT "conformance_results_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "conformance_results" ADD CONSTRAINT "conformance_results_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "analysis_runs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "context_documents" ADD CONSTRAINT "context_documents_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "context_documents" ADD CONSTRAINT "context_documents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "context_package_refs" ADD CONSTRAINT "context_package_refs_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "context_packages"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "context_packages" ADD CONSTRAINT "context_packages_activated_by_fkey" FOREIGN KEY ("activated_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "context_packages" ADD CONSTRAINT "context_packages_bpmn_mapping_id_fkey" FOREIGN KEY ("bpmn_mapping_id") REFERENCES "bpmn_mappings"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "context_packages" ADD CONSTRAINT "context_packages_bpmn_model_id_fkey" FOREIGN KEY ("bpmn_model_id") REFERENCES "bpmn_models"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "context_packages" ADD CONSTRAINT "context_packages_calendar_id_fkey" FOREIGN KEY ("calendar_id") REFERENCES "calendars"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "context_packages" ADD CONSTRAINT "context_packages_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "context_packages" ADD CONSTRAINT "context_packages_process_boundary_id_fkey" FOREIGN KEY ("process_boundary_id") REFERENCES "process_boundaries"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "context_packages" ADD CONSTRAINT "context_packages_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "context_packages" ADD CONSTRAINT "context_packages_rework_definition_id_fkey" FOREIGN KEY ("rework_definition_id") REFERENCES "rework_definitions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "context_packages" ADD CONSTRAINT "context_packages_rubric_id_fkey" FOREIGN KEY ("rubric_id") REFERENCES "rubrics"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dataset_versions" ADD CONSTRAINT "dataset_versions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dataset_versions" ADD CONSTRAINT "dataset_versions_mapping_version_id_fkey" FOREIGN KEY ("mapping_version_id") REFERENCES "mapping_versions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dataset_versions" ADD CONSTRAINT "dataset_versions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dataset_versions" ADD CONSTRAINT "dataset_versions_published_by_fkey" FOREIGN KEY ("published_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dataset_versions" ADD CONSTRAINT "dataset_versions_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "source_snapshots"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dataset_versions" ADD CONSTRAINT "dataset_versions_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "evaluation_runs" ADD CONSTRAINT "evaluation_runs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "evaluation_runs" ADD CONSTRAINT "evaluation_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "evidence_bundle_items" ADD CONSTRAINT "evidence_bundle_items_bundle_id_fkey" FOREIGN KEY ("bundle_id") REFERENCES "evidence_bundles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "evidence_bundles" ADD CONSTRAINT "evidence_bundles_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "evidence_bundles" ADD CONSTRAINT "evidence_bundles_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "finding_cases" ADD CONSTRAINT "finding_cases_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "findings"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "finding_cases" ADD CONSTRAINT "finding_cases_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "findings" ADD CONSTRAINT "findings_analysis_run_id_fkey" FOREIGN KEY ("analysis_run_id") REFERENCES "analysis_runs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "findings" ADD CONSTRAINT "findings_context_package_id_fkey" FOREIGN KEY ("context_package_id") REFERENCES "context_packages"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "findings" ADD CONSTRAINT "findings_dataset_version_id_fkey" FOREIGN KEY ("dataset_version_id") REFERENCES "dataset_versions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "findings" ADD CONSTRAINT "findings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "gold_set_items" ADD CONSTRAINT "gold_set_items_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "gold_set_items" ADD CONSTRAINT "gold_set_items_correction_id_fkey" FOREIGN KEY ("correction_id") REFERENCES "assessment_corrections"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "gold_set_items" ADD CONSTRAINT "gold_set_items_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "graph_projection_state" ADD CONSTRAINT "graph_projection_state_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "hypotheses" ADD CONSTRAINT "hypotheses_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "hypotheses" ADD CONSTRAINT "hypotheses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "hypotheses" ADD CONSTRAINT "hypotheses_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "hypotheses" ADD CONSTRAINT "hypotheses_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "hypotheses" ADD CONSTRAINT "hypotheses_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "context_documents"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ingest_error_samples" ADD CONSTRAINT "ingest_error_samples_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ingest_error_samples" ADD CONSTRAINT "ingest_error_samples_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "source_snapshots"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "interpretation_attempts" ADD CONSTRAINT "interpretation_attempts_interpretation_id_fkey" FOREIGN KEY ("interpretation_id") REFERENCES "interpretations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "interpretation_claims" ADD CONSTRAINT "interpretation_claims_interpretation_id_fkey" FOREIGN KEY ("interpretation_id") REFERENCES "interpretations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "interpretation_versions" ADD CONSTRAINT "interpretation_versions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "interpretation_versions" ADD CONSTRAINT "interpretation_versions_interpretation_id_fkey" FOREIGN KEY ("interpretation_id") REFERENCES "interpretations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "interpretations" ADD CONSTRAINT "interpretations_accepted_by_fkey" FOREIGN KEY ("accepted_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "interpretations" ADD CONSTRAINT "interpretations_evidence_bundle_id_fkey" FOREIGN KEY ("evidence_bundle_id") REFERENCES "evidence_bundles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "interpretations" ADD CONSTRAINT "interpretations_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "findings"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "interpretations" ADD CONSTRAINT "interpretations_flagged_by_fkey" FOREIGN KEY ("flagged_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "interpretations" ADD CONSTRAINT "interpretations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "interpretations" ADD CONSTRAINT "interpretations_prompt_template_id_fkey" FOREIGN KEY ("prompt_template_id") REFERENCES "prompt_templates"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "interpretations" ADD CONSTRAINT "interpretations_regenerated_from_fkey" FOREIGN KEY ("regenerated_from") REFERENCES "interpretations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "interpretations" ADD CONSTRAINT "interpretations_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "interpretations" ADD CONSTRAINT "interpretations_reused_from_fkey" FOREIGN KEY ("reused_from") REFERENCES "interpretations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "interventions" ADD CONSTRAINT "interventions_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "interventions" ADD CONSTRAINT "interventions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "interventions" ADD CONSTRAINT "interventions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "interventions" ADD CONSTRAINT "interventions_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "interventions" ADD CONSTRAINT "interventions_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "context_documents"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "mapping_versions" ADD CONSTRAINT "mapping_versions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "mapping_versions" ADD CONSTRAINT "mapping_versions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "mapping_versions" ADD CONSTRAINT "mapping_versions_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_added_by_fkey" FOREIGN KEY ("added_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "model_usage_events" ADD CONSTRAINT "model_usage_events_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "monitoring_configs" ADD CONSTRAINT "monitoring_configs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "monitoring_configs" ADD CONSTRAINT "monitoring_configs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "priority_policies" ADD CONSTRAINT "priority_policies_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "priority_policies" ADD CONSTRAINT "priority_policies_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "process_boundaries" ADD CONSTRAINT "process_boundaries_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "process_boundaries" ADD CONSTRAINT "process_boundaries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "process_boundaries" ADD CONSTRAINT "process_boundaries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "process_boundaries" ADD CONSTRAINT "process_boundaries_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "process_boundaries" ADD CONSTRAINT "process_boundaries_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "context_documents"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "process_edges" ADD CONSTRAINT "process_edges_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "process_edges" ADD CONSTRAINT "process_edges_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "analysis_runs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "process_nodes" ADD CONSTRAINT "process_nodes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "process_nodes" ADD CONSTRAINT "process_nodes_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "analysis_runs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "prompt_templates" ADD CONSTRAINT "prompt_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "prompt_templates" ADD CONSTRAINT "prompt_templates_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "quality_findings" ADD CONSTRAINT "quality_findings_dataset_version_id_fkey" FOREIGN KEY ("dataset_version_id") REFERENCES "dataset_versions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "quality_findings" ADD CONSTRAINT "quality_findings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "question_specs" ADD CONSTRAINT "question_specs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "question_specs" ADD CONSTRAINT "question_specs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rework_definitions" ADD CONSTRAINT "rework_definitions_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rework_definitions" ADD CONSTRAINT "rework_definitions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rework_definitions" ADD CONSTRAINT "rework_definitions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rework_definitions" ADD CONSTRAINT "rework_definitions_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rework_definitions" ADD CONSTRAINT "rework_definitions_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "context_documents"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rework_results" ADD CONSTRAINT "rework_results_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rework_results" ADD CONSTRAINT "rework_results_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "analysis_runs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rubrics" ADD CONSTRAINT "rubrics_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rubrics" ADD CONSTRAINT "rubrics_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rubrics" ADD CONSTRAINT "rubrics_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rubrics" ADD CONSTRAINT "rubrics_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rubrics" ADD CONSTRAINT "rubrics_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "context_documents"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rule_evaluations" ADD CONSTRAINT "rule_evaluations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rule_evaluations" ADD CONSTRAINT "rule_evaluations_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "rules"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rule_evaluations" ADD CONSTRAINT "rule_evaluations_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "analysis_runs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rules" ADD CONSTRAINT "rules_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rules" ADD CONSTRAINT "rules_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rules" ADD CONSTRAINT "rules_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rules" ADD CONSTRAINT "rules_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rules" ADD CONSTRAINT "rules_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "context_documents"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "source_snapshots" ADD CONSTRAINT "source_snapshots_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "source_snapshots" ADD CONSTRAINT "source_snapshots_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "source_snapshots" ADD CONSTRAINT "source_snapshots_reused_from_fkey" FOREIGN KEY ("reused_from") REFERENCES "source_snapshots"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "source_snapshots" ADD CONSTRAINT "source_snapshots_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sources" ADD CONSTRAINT "sources_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sources" ADD CONSTRAINT "sources_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "transition_metrics" ADD CONSTRAINT "transition_metrics_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "transition_metrics" ADD CONSTRAINT "transition_metrics_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "analysis_runs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "validation_checks" ADD CONSTRAINT "validation_checks_validation_id_fkey" FOREIGN KEY ("validation_id") REFERENCES "candidate_validations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "variants" ADD CONSTRAINT "variants_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "variants" ADD CONSTRAINT "variants_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "analysis_runs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;


-- ---------------------------------------------------------------- not modelled in schema.prisma
-- Keep this block when squashing again: CHECKs, case-insensitive name indexes, immutability and outbox triggers.

-- Prisma creates list columns nullable
ALTER TABLE "candidate_comparisons" ALTER COLUMN "candidate_link_ids" SET NOT NULL, ALTER COLUMN "validation_ids" SET NOT NULL,
  ALTER COLUMN "assessment_ids" SET NOT NULL, ALTER COLUMN "score_ids" SET NOT NULL, ALTER COLUMN "bundle_ids" SET NOT NULL;

-- CHECK constraints
ALTER TABLE "analysis_runs" ADD CONSTRAINT "analysis_runs_monitoring_status_check" CHECK ((monitoring_status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text])));
ALTER TABLE "analysis_runs" ADD CONSTRAINT "analysis_runs_status_check" CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'result_ready'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])));
ALTER TABLE "assessment_corrections" ADD CONSTRAINT "assessment_corrections_kind_check" CHECK ((kind = ANY (ARRAY['confirm'::text, 'correct'::text])));
ALTER TABLE "assessment_runs" ADD CONSTRAINT "assessment_runs_status_check" CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'completed'::text, 'failed'::text])));
ALTER TABLE "assessment_runs" ADD CONSTRAINT "assessment_runs_trigger_check" CHECK ((trigger = ANY (ARRAY['manual'::text, 'recommendation_refresh'::text])));
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_status_check" CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'automatic'::text, 'needs_review'::text, 'insufficient_information'::text, 'failed'::text])));
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_result_check" CHECK ((result = ANY (ARRAY['success'::text, 'denied'::text, 'failed'::text])));
ALTER TABLE "bpmn_models" ADD CONSTRAINT "bpmn_models_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'reviewed'::text, 'approved'::text, 'obsolete'::text])));
ALTER TABLE "bpmn_models" ADD CONSTRAINT "bpmn_models_validation_status_check" CHECK ((validation_status = ANY (ARRAY['pending'::text, 'valid'::text, 'invalid'::text])));
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'reviewed'::text, 'approved'::text, 'obsolete'::text])));
ALTER TABLE "candidate_links" ADD CONSTRAINT "candidate_links_candidate_type_check" CHECK ((candidate_type = ANY (ARRAY['intervention'::text, 'analyst'::text])));
ALTER TABLE "candidate_links" ADD CONSTRAINT "candidate_links_precondition_status_check" CHECK ((precondition_status = ANY (ARRAY['eligible'::text, 'not_eligible'::text, 'insufficient_information'::text])));
ALTER TABLE "candidate_sets" ADD CONSTRAINT "candidate_sets_status_check" CHECK ((status = ANY (ARRAY['queued'::text, 'validating'::text, 'completed'::text, 'failed'::text])));
ALTER TABLE "candidate_validations" ADD CONSTRAINT "candidate_validations_status_check" CHECK ((status = ANY (ARRAY['queued'::text, 'validating'::text, 'validated'::text, 'needs_review'::text, 'insufficient_information'::text, 'not_eligible'::text, 'failed'::text])));
ALTER TABLE "conformance_results" ADD CONSTRAINT "conformance_results_status_check" CHECK ((status = ANY (ARRAY['available'::text, 'unavailable'::text, 'failed'::text])));
ALTER TABLE "context_documents" ADD CONSTRAINT "context_documents_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'reviewed'::text, 'approved'::text, 'obsolete'::text])));
ALTER TABLE "context_packages" ADD CONSTRAINT "context_packages_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'ready'::text, 'active'::text, 'superseded'::text])));
ALTER TABLE "dataset_versions" ADD CONSTRAINT "dataset_versions_quality_status_check" CHECK ((quality_status = ANY (ARRAY['ready'::text, 'ready_with_notes'::text, 'not_ready'::text])));
ALTER TABLE "dataset_versions" ADD CONSTRAINT "dataset_versions_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'processing'::text, 'quality_review'::text, 'published'::text, 'superseded'::text, 'failed'::text])));
ALTER TABLE "evidence_bundles" ADD CONSTRAINT "evidence_bundles_purpose_check" CHECK ((purpose = ANY (ARRAY['jev_assessment'::text, 'llm_interpretation'::text])));
ALTER TABLE "evidence_bundles" ADD CONSTRAINT "evidence_bundles_status_check" CHECK ((status = 'ready'::text));
ALTER TABLE "evidence_bundles" ADD CONSTRAINT "evidence_bundles_target_type_check" CHECK ((target_type = ANY (ARRAY['finding'::text, 'candidate_comparison'::text, 'assessment'::text])));
ALTER TABLE "findings" ADD CONSTRAINT "findings_type_check" CHECK ((type = ANY (ARRAY['bottleneck_indication'::text, 'high_rework'::text, 'rule_non_compliance'::text, 'bpmn_deviation'::text, 'aging_backlog'::text, 'worsening_trend'::text])));
ALTER TABLE "hypotheses" ADD CONSTRAINT "hypotheses_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'reviewed'::text, 'approved'::text, 'obsolete'::text])));
ALTER TABLE "interpretation_claims" ADD CONSTRAINT "interpretation_claims_claim_type_check" CHECK ((claim_type = ANY (ARRAY['measured_fact'::text, 'interpretation'::text, 'hypothesis'::text, 'validated_recommendation'::text])));
ALTER TABLE "interpretation_versions" ADD CONSTRAINT "interpretation_versions_kind_check" CHECK ((kind = ANY (ARRAY['model_draft'::text, 'accepted_summary'::text])));
ALTER TABLE "interpretations" ADD CONSTRAINT "interpretations_audience_check" CHECK ((audience = ANY (ARRAY['analyst'::text, 'process_owner'::text])));
ALTER TABLE "interpretations" ADD CONSTRAINT "interpretations_status_check" CHECK ((status = ANY (ARRAY['queued'::text, 'generating'::text, 'checking'::text, 'repairing'::text, 'passed'::text, 'failed_check'::text, 'failed'::text, 'accepted'::text, 'flagged'::text])));
ALTER TABLE "interpretations" ADD CONSTRAINT "interpretations_target_type_check" CHECK ((target_type = ANY (ARRAY['finding'::text, 'assessment'::text, 'candidate_comparison'::text])));
ALTER TABLE "interventions" ADD CONSTRAINT "interventions_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'reviewed'::text, 'approved'::text, 'obsolete'::text])));
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_role_check" CHECK ((role = ANY (ARRAY['administrator'::text, 'analyst'::text, 'process_owner'::text])));
ALTER TABLE "model_usage_events" ADD CONSTRAINT "model_usage_events_kind_check" CHECK ((kind = ANY (ARRAY['jev'::text, 'llm'::text])));
ALTER TABLE "process_boundaries" ADD CONSTRAINT "process_boundaries_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'reviewed'::text, 'approved'::text, 'obsolete'::text])));
ALTER TABLE "projects" ADD CONSTRAINT "projects_check" CHECK ((contract_end >= contract_start));
ALTER TABLE "projects" ADD CONSTRAINT "projects_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'suspended'::text, 'ended'::text, 'archived'::text])));
ALTER TABLE "prompt_templates" ADD CONSTRAINT "prompt_templates_audience_check" CHECK ((audience = ANY (ARRAY['analyst'::text, 'process_owner'::text])));
ALTER TABLE "prompt_templates" ADD CONSTRAINT "prompt_templates_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'superseded'::text])));
ALTER TABLE "prompt_templates" ADD CONSTRAINT "prompt_templates_target_type_check" CHECK ((target_type = ANY (ARRAY['finding'::text, 'assessment'::text, 'candidate_comparison'::text])));
ALTER TABLE "quality_findings" ADD CONSTRAINT "quality_findings_severity_check" CHECK ((severity = ANY (ARRAY['high'::text, 'medium'::text, 'info'::text])));
ALTER TABLE "question_specs" ADD CONSTRAINT "question_specs_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'superseded'::text])));
ALTER TABLE "rework_definitions" ADD CONSTRAINT "rework_definitions_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'reviewed'::text, 'approved'::text, 'obsolete'::text])));
ALTER TABLE "rubrics" ADD CONSTRAINT "rubrics_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'reviewed'::text, 'approved'::text, 'obsolete'::text])));
ALTER TABLE "rules" ADD CONSTRAINT "rules_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'reviewed'::text, 'approved'::text, 'obsolete'::text])));
ALTER TABLE "source_snapshots" ADD CONSTRAINT "source_snapshots_status_check" CHECK ((status = ANY (ARRAY['awaiting_upload'::text, 'validating'::text, 'ready_for_mapping'::text, 'needs_review'::text, 'failed'::text, 'cancelled'::text])));
ALTER TABLE "sources" ADD CONSTRAINT "sources_kind_check" CHECK ((kind = 'file'::text));
ALTER TABLE "users" ADD CONSTRAINT "users_global_role_check" CHECK ((global_role = ANY (ARRAY['admin'::text, 'member'::text])));
ALTER TABLE "users" ADD CONSTRAINT "users_status_check" CHECK ((status = ANY (ARRAY['invited'::text, 'active'::text, 'disabled'::text])));
ALTER TABLE "validation_checks" ADD CONSTRAINT "validation_checks_status_check" CHECK ((status = ANY (ARRAY['pass'::text, 'fail'::text, 'not_evaluable'::text])));

-- Expression indexes (case-insensitive names)
CREATE UNIQUE INDEX clients_name_key ON clients USING btree (lower(name));
CREATE UNIQUE INDEX projects_client_name_key ON projects USING btree (client_id, lower(name));
CREATE UNIQUE INDEX sources_project_name_key ON sources USING btree (project_id, lower(name));

-- Functions
CREATE FUNCTION assessments_final() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF OLD.status IN ('automatic', 'needs_review', 'insufficient_information', 'failed') THEN
    RAISE EXCEPTION 'assessment % is final and immutable', OLD.id;
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION audit_events_append_only() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only';
END $$;

CREATE FUNCTION context_item_immutable() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF OLD.status <> 'draft' AND (NEW.payload IS DISTINCT FROM OLD.payload OR NEW.item_key IS DISTINCT FROM OLD.item_key
      OR NEW.version IS DISTINCT FROM OLD.version OR NEW.source_document_id IS DISTINCT FROM OLD.source_document_id
      OR NEW.source_reference IS DISTINCT FROM OLD.source_reference) THEN
    RAISE EXCEPTION 'context item % is % and immutable', OLD.id, OLD.status;
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION context_package_refs_immutable() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'context package refs are immutable';
END $$;

CREATE FUNCTION context_packages_immutable() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.hash IS DISTINCT FROM OLD.hash OR NEW.process_boundary_id IS DISTINCT FROM OLD.process_boundary_id
     OR NEW.rework_definition_id IS DISTINCT FROM OLD.rework_definition_id OR NEW.bpmn_mapping_id IS DISTINCT FROM OLD.bpmn_mapping_id
     OR NEW.rubric_id IS DISTINCT FROM OLD.rubric_id OR NEW.calendar_id IS DISTINCT FROM OLD.calendar_id THEN
    RAISE EXCEPTION 'context package % is immutable', OLD.id;
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION corrections_immutable() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'assessment corrections are append-only';
END $$;

CREATE FUNCTION dataset_versions_immutable() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF OLD.status IN ('published', 'superseded') THEN
    IF NOT (OLD.status = 'published' AND NEW.status = 'superseded'
            AND NEW.content_hash = OLD.content_hash AND NEW.events_key = OLD.events_key AND NEW.mapping_version_id = OLD.mapping_version_id) THEN
      RAISE EXCEPTION 'published dataset % is immutable', OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION evidence_immutable() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'evidence bundles are immutable';
END $$;

CREATE FUNCTION findings_immutable() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'finding % is immutable', OLD.id;
END $$;

CREATE FUNCTION interpretation_records_immutable() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END $$;

CREATE FUNCTION interpretations_final() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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

CREATE FUNCTION outbox_capture() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO outbox_events (project_id, aggregate_type, aggregate_id, event_type, payload)
  VALUES (NEW.project_id, TG_TABLE_NAME, NEW.id, lower(TG_OP), jsonb_build_object('status', to_jsonb(NEW)->'status'));
  RETURN NEW;
END $$;

CREATE FUNCTION recommendation_immutable() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_TABLE_NAME = 'candidate_validations' AND OLD.status IN ('queued', 'validating') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION '% rows are immutable', TG_TABLE_NAME;
END $$;

-- Triggers
CREATE TRIGGER analysis_runs_outbox AFTER INSERT OR UPDATE ON analysis_runs FOR EACH ROW EXECUTE FUNCTION outbox_capture();
CREATE TRIGGER assessment_corrections_immutable BEFORE DELETE OR UPDATE ON assessment_corrections FOR EACH ROW EXECUTE FUNCTION corrections_immutable();
CREATE TRIGGER assessment_corrections_outbox AFTER INSERT ON assessment_corrections FOR EACH ROW EXECUTE FUNCTION outbox_capture();
CREATE TRIGGER assessments_final BEFORE UPDATE ON assessments FOR EACH ROW EXECUTE FUNCTION assessments_final();
CREATE TRIGGER assessments_outbox AFTER INSERT OR UPDATE ON assessments FOR EACH ROW EXECUTE FUNCTION outbox_capture();
CREATE TRIGGER audit_events_no_update BEFORE DELETE OR UPDATE ON audit_events FOR EACH ROW EXECUTE FUNCTION audit_events_append_only();
CREATE TRIGGER bpmn_mappings_outbox AFTER INSERT OR UPDATE ON bpmn_mappings FOR EACH ROW EXECUTE FUNCTION outbox_capture();
CREATE TRIGGER bpmn_models_outbox AFTER INSERT OR UPDATE ON bpmn_models FOR EACH ROW EXECUTE FUNCTION outbox_capture();
CREATE TRIGGER calendars_immutable BEFORE UPDATE ON calendars FOR EACH ROW EXECUTE FUNCTION context_item_immutable();
CREATE TRIGGER calendars_outbox AFTER INSERT OR UPDATE ON calendars FOR EACH ROW EXECUTE FUNCTION outbox_capture();
CREATE TRIGGER candidate_comparisons_immutable BEFORE DELETE OR UPDATE ON candidate_comparisons FOR EACH ROW EXECUTE FUNCTION recommendation_immutable();
CREATE TRIGGER candidate_comparisons_outbox AFTER INSERT ON candidate_comparisons FOR EACH ROW EXECUTE FUNCTION outbox_capture();
CREATE TRIGGER candidate_scores_immutable BEFORE DELETE OR UPDATE ON candidate_scores FOR EACH ROW EXECUTE FUNCTION recommendation_immutable();
CREATE TRIGGER candidate_validations_immutable BEFORE DELETE OR UPDATE ON candidate_validations FOR EACH ROW EXECUTE FUNCTION recommendation_immutable();
CREATE TRIGGER check_reports_immutable BEFORE DELETE OR UPDATE ON check_reports FOR EACH ROW EXECUTE FUNCTION interpretation_records_immutable();
CREATE TRIGGER context_documents_outbox AFTER INSERT OR UPDATE ON context_documents FOR EACH ROW EXECUTE FUNCTION outbox_capture();
CREATE TRIGGER context_package_refs_immutable BEFORE DELETE OR UPDATE ON context_package_refs FOR EACH ROW EXECUTE FUNCTION context_package_refs_immutable();
CREATE TRIGGER context_packages_immutable BEFORE UPDATE ON context_packages FOR EACH ROW EXECUTE FUNCTION context_packages_immutable();
CREATE TRIGGER context_packages_outbox AFTER INSERT OR UPDATE ON context_packages FOR EACH ROW EXECUTE FUNCTION outbox_capture();
CREATE TRIGGER dataset_versions_immutable BEFORE UPDATE ON dataset_versions FOR EACH ROW EXECUTE FUNCTION dataset_versions_immutable();
CREATE TRIGGER dataset_versions_outbox AFTER INSERT OR UPDATE ON dataset_versions FOR EACH ROW EXECUTE FUNCTION outbox_capture();
CREATE TRIGGER evidence_bundle_items_immutable BEFORE DELETE OR UPDATE ON evidence_bundle_items FOR EACH ROW EXECUTE FUNCTION evidence_immutable();
CREATE TRIGGER evidence_bundles_immutable BEFORE DELETE OR UPDATE ON evidence_bundles FOR EACH ROW EXECUTE FUNCTION evidence_immutable();
CREATE TRIGGER evidence_bundles_outbox AFTER INSERT ON evidence_bundles FOR EACH ROW EXECUTE FUNCTION outbox_capture();
CREATE TRIGGER findings_immutable BEFORE UPDATE ON findings FOR EACH ROW EXECUTE FUNCTION findings_immutable();
CREATE TRIGGER findings_outbox AFTER INSERT OR UPDATE ON findings FOR EACH ROW EXECUTE FUNCTION outbox_capture();
CREATE TRIGGER hypotheses_immutable BEFORE UPDATE ON hypotheses FOR EACH ROW EXECUTE FUNCTION context_item_immutable();
CREATE TRIGGER hypotheses_outbox AFTER INSERT OR UPDATE ON hypotheses FOR EACH ROW EXECUTE FUNCTION outbox_capture();
CREATE TRIGGER interpretation_attempts_immutable BEFORE DELETE OR UPDATE ON interpretation_attempts FOR EACH ROW EXECUTE FUNCTION interpretation_records_immutable();
CREATE TRIGGER interpretation_claims_immutable BEFORE DELETE OR UPDATE ON interpretation_claims FOR EACH ROW EXECUTE FUNCTION interpretation_records_immutable();
CREATE TRIGGER interpretation_versions_immutable BEFORE DELETE OR UPDATE ON interpretation_versions FOR EACH ROW EXECUTE FUNCTION interpretation_records_immutable();
CREATE TRIGGER interpretations_final BEFORE UPDATE ON interpretations FOR EACH ROW EXECUTE FUNCTION interpretations_final();
CREATE TRIGGER interpretations_outbox AFTER INSERT OR UPDATE ON interpretations FOR EACH ROW EXECUTE FUNCTION outbox_capture();
CREATE TRIGGER interventions_immutable BEFORE UPDATE ON interventions FOR EACH ROW EXECUTE FUNCTION context_item_immutable();
CREATE TRIGGER interventions_outbox AFTER INSERT OR UPDATE ON interventions FOR EACH ROW EXECUTE FUNCTION outbox_capture();
CREATE TRIGGER mapping_versions_outbox AFTER INSERT OR UPDATE ON mapping_versions FOR EACH ROW EXECUTE FUNCTION outbox_capture();
CREATE TRIGGER process_boundaries_immutable BEFORE UPDATE ON process_boundaries FOR EACH ROW EXECUTE FUNCTION context_item_immutable();
CREATE TRIGGER process_boundaries_outbox AFTER INSERT OR UPDATE ON process_boundaries FOR EACH ROW EXECUTE FUNCTION outbox_capture();
CREATE TRIGGER rework_definitions_immutable BEFORE UPDATE ON rework_definitions FOR EACH ROW EXECUTE FUNCTION context_item_immutable();
CREATE TRIGGER rework_definitions_outbox AFTER INSERT OR UPDATE ON rework_definitions FOR EACH ROW EXECUTE FUNCTION outbox_capture();
CREATE TRIGGER rubrics_immutable BEFORE UPDATE ON rubrics FOR EACH ROW EXECUTE FUNCTION context_item_immutable();
CREATE TRIGGER rubrics_outbox AFTER INSERT OR UPDATE ON rubrics FOR EACH ROW EXECUTE FUNCTION outbox_capture();
CREATE TRIGGER rules_immutable BEFORE UPDATE ON rules FOR EACH ROW EXECUTE FUNCTION context_item_immutable();
CREATE TRIGGER rules_outbox AFTER INSERT OR UPDATE ON rules FOR EACH ROW EXECUTE FUNCTION outbox_capture();
CREATE TRIGGER source_snapshots_outbox AFTER INSERT OR UPDATE ON source_snapshots FOR EACH ROW EXECUTE FUNCTION outbox_capture();
CREATE TRIGGER sources_outbox AFTER INSERT OR UPDATE ON sources FOR EACH ROW EXECUTE FUNCTION outbox_capture();
