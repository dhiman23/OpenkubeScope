-- Add description column to workspaces table if it doesn't exist
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS description TEXT;
