CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_used_at` integer,
	`name` text NOT NULL,
	`key` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_key_unique` ON `api_keys` (`key`);--> statement-breakpoint
CREATE INDEX `api_keys_user_id_idx` ON `api_keys` (`user_id`);--> statement-breakpoint
CREATE TABLE `api_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`model` text NOT NULL,
	`provider` text NOT NULL,
	`prompt` text NOT NULL,
	`cost` integer NOT NULL,
	`speed_ms` integer NOT NULL,
	`image_size` text NOT NULL,
	`quality` text,
	`status` text NOT NULL,
	`error` text,
	`metadata` text,
	`api_key_temp_jwt` integer DEFAULT false NOT NULL,
	`ip` text,
	`output_urls` text DEFAULT '[]' NOT NULL,
	`api_key_id` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`api_key_id`) REFERENCES `api_keys`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `api_usage_api_key_id_idx` ON `api_usage` (`api_key_id`);--> statement-breakpoint
CREATE INDEX `api_usage_created_at_idx` ON `api_usage` (`created_at`);--> statement-breakpoint
CREATE INDEX `api_usage_user_id_idx` ON `api_usage` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`credits` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
