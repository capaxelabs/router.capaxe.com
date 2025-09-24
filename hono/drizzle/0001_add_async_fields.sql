-- Migration to add async task fields to api_usage table
-- Run this to add async support to existing database

-- Add async task fields to api_usage table
ALTER TABLE api_usage ADD COLUMN task_id TEXT;
ALTER TABLE api_usage ADD COLUMN task_status TEXT DEFAULT 'sync' NOT NULL;
ALTER TABLE api_usage ADD COLUMN task_progress INTEGER DEFAULT 0;
ALTER TABLE api_usage ADD COLUMN task_started_at INTEGER;
ALTER TABLE api_usage ADD COLUMN task_completed_at INTEGER;
ALTER TABLE api_usage ADD COLUMN is_async INTEGER DEFAULT false NOT NULL;

-- Create indexes for async task queries
CREATE INDEX IF NOT EXISTS api_usage_task_id_idx ON api_usage(task_id);
CREATE INDEX IF NOT EXISTS api_usage_task_status_idx ON api_usage(task_status);

-- Update the journal
INSERT INTO _journal (id, prev_hash, hash, created_at) 
VALUES (1, 'prev_hash_value', 'new_hash_value', datetime('now'));