CREATE TABLE `models` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`is_public` integer DEFAULT true NOT NULL,
	`providers` text NOT NULL,
	`arena_score` integer,
	`release_date` text NOT NULL,
	`description` text,
	`examples` text DEFAULT '[]' NOT NULL,
	`capabilities` text DEFAULT '{}' NOT NULL,
	`apply_image_fn` text,
	`apply_mask_fn` text,
	`apply_quality_fn` text,
	`post_calc_price_fn` text,
	`validate_params_fn` text,
	`tags` text DEFAULT '[]' NOT NULL,
	`category` text,
	`max_requests_per_day` integer,
	`requires_whitelist` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deprecated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `models_slug_unique` ON `models` (`slug`);--> statement-breakpoint
CREATE INDEX `models_type_idx` ON `models` (`type`);--> statement-breakpoint
CREATE INDEX `models_status_idx` ON `models` (`status`);--> statement-breakpoint
CREATE INDEX `models_slug_idx` ON `models` (`slug`);