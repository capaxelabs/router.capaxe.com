ALTER TABLE `api_usage` ADD `task_id` text;--> statement-breakpoint
ALTER TABLE `api_usage` ADD `task_status` text DEFAULT 'sync' NOT NULL;--> statement-breakpoint
ALTER TABLE `api_usage` ADD `task_progress` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `api_usage` ADD `task_started_at` integer;--> statement-breakpoint
ALTER TABLE `api_usage` ADD `task_completed_at` integer;--> statement-breakpoint
ALTER TABLE `api_usage` ADD `is_async` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `api_usage_task_id_idx` ON `api_usage` (`task_id`);--> statement-breakpoint
CREATE INDEX `api_usage_task_status_idx` ON `api_usage` (`task_status`);