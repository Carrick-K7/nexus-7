DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM nexus_world_residents
    WHERE kind = 'participant-avatar'
  ) THEN
    RAISE EXCEPTION
      'AI-only migration refused: participant-avatar rows still exist';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'nexus_world_residents_kind_ai_only_check'
      AND conrelid = 'nexus_world_residents'::regclass
  ) THEN
    ALTER TABLE nexus_world_residents
      DROP CONSTRAINT IF EXISTS nexus_world_residents_kind_check;
    ALTER TABLE nexus_world_residents
      ADD CONSTRAINT nexus_world_residents_kind_ai_only_check
      CHECK (
        kind IN (
          'synthetic-human',
          'software-ai',
          'embodied-robot'
        )
      );
  END IF;
END
$$;

UPDATE nexus_world_residents
SET resident_json = resident_json - 'adult'
WHERE resident_json ? 'adult';

ALTER TABLE nexus_world_residents
  DROP COLUMN IF EXISTS adult;

DROP TABLE IF EXISTS nexus_world_human_intents;
DROP TABLE IF EXISTS nexus_world_private_memory_refs;
