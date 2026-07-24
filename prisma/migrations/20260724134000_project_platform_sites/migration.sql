-- Add optional multi-select marketing dimensions to projects.
-- Existing projects retain their names and receive empty JSON arrays.
ALTER TABLE "Project"
ADD COLUMN "promoPlatforms" TEXT NOT NULL DEFAULT '[]';

ALTER TABLE "Project"
ADD COLUMN "targetSites" TEXT NOT NULL DEFAULT '[]';
