CREATE TABLE `parties` (
	`id` text PRIMARY KEY NOT NULL,
	`party_type` text NOT NULL,
	`full_name` text NOT NULL,
	`email` text,
	`phone` text,
	`address_json` text,
	`user_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `policies` (
	`id` text PRIMARY KEY NOT NULL,
	`policy_number` text NOT NULL,
	`holder_party_id` text NOT NULL,
	`line_of_business` text NOT NULL,
	`status` text NOT NULL,
	`effective_from` text NOT NULL,
	`effective_to` text NOT NULL,
	`coverage_json` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`holder_party_id`) REFERENCES `parties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `policies_policy_number_unique` ON `policies` (`policy_number`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text NOT NULL,
	`authority_level` integer DEFAULT 0 NOT NULL,
	`specialties` text DEFAULT '[]' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `claim_items` (
	`id` text PRIMARY KEY NOT NULL,
	`claim_id` text NOT NULL,
	`item_type` text NOT NULL,
	`description` text NOT NULL,
	`vehicle_json` text,
	`claimed_amount` text,
	`assessed_amount` text,
	`assessment_status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `claim_parties` (
	`id` text PRIMARY KEY NOT NULL,
	`claim_id` text NOT NULL,
	`party_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`party_id`) REFERENCES `parties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `claim_state_history` (
	`id` text PRIMARY KEY NOT NULL,
	`claim_id` text NOT NULL,
	`from_status` text,
	`to_status` text NOT NULL,
	`triggered_by` text NOT NULL,
	`actor_id` text NOT NULL,
	`reason` text,
	`rule_audit_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `claim_transitions` (
	`id` text PRIMARY KEY NOT NULL,
	`from_status` text NOT NULL,
	`to_status` text NOT NULL,
	`trigger_label` text NOT NULL,
	`guard_code` text,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `claims` (
	`id` text PRIMARY KEY NOT NULL,
	`claim_number` text NOT NULL,
	`policy_id` text NOT NULL,
	`line_of_business` text NOT NULL,
	`claim_type` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`incident_at` integer NOT NULL,
	`reported_at` integer NOT NULL,
	`incident_description` text,
	`incident_location_json` text,
	`estimated_amount` text,
	`severity_score` integer,
	`complexity_score` integer,
	`route` text,
	`priority` integer,
	`assigned_to` text,
	`siu_referred` integer DEFAULT false NOT NULL,
	`siu_disposition` text,
	`injury_involved` integer DEFAULT false NOT NULL,
	`liability_disputed` integer DEFAULT false NOT NULL,
	`police_report_present` integer DEFAULT false NOT NULL,
	`police_report_number` text,
	`summary_md` text,
	`summary_generated_at` integer,
	`summary_stale` integer DEFAULT false NOT NULL,
	`denial_reason_code` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`policy_id`) REFERENCES `policies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assigned_to`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `claims_claim_number_unique` ON `claims` (`claim_number`);--> statement-breakpoint
CREATE TABLE `sequences` (
	`name` text PRIMARY KEY NOT NULL,
	`value` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `agent_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`claim_id` text,
	`document_id` text,
	`prompt_version` text,
	`model` text,
	`input_json` text,
	`output_json` text,
	`confidence` text,
	`status` text NOT NULL,
	`latency_ms` integer,
	`outcome` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text NOT NULL,
	`before_json` text,
	`after_json` text,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`claim_id` text NOT NULL,
	`doc_type` text NOT NULL,
	`storage_path` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`status` text DEFAULT 'uploaded' NOT NULL,
	`uploaded_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `extractions` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`agent_run_id` text NOT NULL,
	`fields_json` text NOT NULL,
	`confidence_json` text NOT NULL,
	`min_confidence` text NOT NULL,
	`verified_by` text,
	`applied` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`agent_run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`verified_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `fraud_scores` (
	`id` text PRIMARY KEY NOT NULL,
	`claim_id` text NOT NULL,
	`agent_run_id` text,
	`score` integer NOT NULL,
	`band` text NOT NULL,
	`reason_codes` text NOT NULL,
	`signals_json` text NOT NULL,
	`rule_audit_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`agent_run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`rule_audit_id`) REFERENCES `rule_audit_log`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`claim_id` text,
	`task_id` text,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`body_md` text NOT NULL,
	`read_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `parameters` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`value_json` text NOT NULL,
	`value_type` text NOT NULL,
	`description` text,
	`effective_from` text NOT NULL,
	`effective_to` text,
	`updated_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `parameters_key_unique` ON `parameters` (`key`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`claim_id` text NOT NULL,
	`payee_party_id` text NOT NULL,
	`amount` text NOT NULL,
	`method` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`reference` text,
	`approved_by` text,
	`authority_rule_audit_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`authority_rule_audit_id`) REFERENCES `rule_audit_log`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `reserves` (
	`id` text PRIMARY KEY NOT NULL,
	`claim_id` text NOT NULL,
	`kind` text NOT NULL,
	`amount` text NOT NULL,
	`set_by` text NOT NULL,
	`source` text NOT NULL,
	`supersedes_id` text,
	`approval_task_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`set_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approval_task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `rule_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`rule_id` text NOT NULL,
	`action_type` text NOT NULL,
	`params_json` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`rule_id`) REFERENCES `rules`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `rule_audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`version_id` text NOT NULL,
	`claim_id` text,
	`inputs_json` text NOT NULL,
	`outputs_json` text NOT NULL,
	`matched_rule_ids` text NOT NULL,
	`actor` text NOT NULL,
	`evaluated_at` integer NOT NULL,
	FOREIGN KEY (`version_id`) REFERENCES `rule_set_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `rule_conditions` (
	`id` text PRIMARY KEY NOT NULL,
	`rule_id` text NOT NULL,
	`input_key` text NOT NULL,
	`operator` text NOT NULL,
	`value_json` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`rule_id`) REFERENCES `rules`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `rule_set_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`rule_set_id` text NOT NULL,
	`version` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`effective_from` text NOT NULL,
	`effective_to` text,
	`change_note` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`rule_set_id`) REFERENCES `rule_sets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `rule_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`hit_policy` text DEFAULT 'first' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rule_sets_code_unique` ON `rule_sets` (`code`);--> statement-breakpoint
CREATE TABLE `rules` (
	`id` text PRIMARY KEY NOT NULL,
	`version_id` text NOT NULL,
	`row_order` integer NOT NULL,
	`label` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`version_id`) REFERENCES `rule_set_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `settlements` (
	`id` text PRIMARY KEY NOT NULL,
	`claim_id` text NOT NULL,
	`items_json` text NOT NULL,
	`deductible_applied` text NOT NULL,
	`total_amount` text NOT NULL,
	`note` text,
	`status` text DEFAULT 'proposed' NOT NULL,
	`proposed_by` text NOT NULL,
	`authority_rule_audit_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`proposed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`authority_rule_audit_id`) REFERENCES `rule_audit_log`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sla_timers` (
	`id` text PRIMARY KEY NOT NULL,
	`claim_id` text NOT NULL,
	`task_id` text,
	`timer_code` text NOT NULL,
	`started_at` integer NOT NULL,
	`due_at` integer NOT NULL,
	`paused_at` integer,
	`breach_count` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`claim_id` text NOT NULL,
	`type` text NOT NULL,
	`queue` text NOT NULL,
	`priority` integer DEFAULT 3 NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`assigned_to` text,
	`payload_json` text,
	`resolution` text,
	`resolution_reason` text,
	`sla_timer_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assigned_to`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sla_timer_id`) REFERENCES `sla_timers`(`id`) ON UPDATE no action ON DELETE no action
);
