DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM nexus_world_residents
    WHERE kind IN (
      'synthetic-human',
      'software-ai',
      'embodied-robot'
    )
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'nexus_world_residents_kind_ai_only_check'
      AND conrelid = 'nexus_world_residents'::regclass
      AND pg_get_constraintdef(oid) LIKE '%human%'
      AND pg_get_constraintdef(oid) NOT LIKE '%synthetic-human%'
  ) THEN
    ALTER TABLE nexus_world_residents
      DROP CONSTRAINT IF EXISTS nexus_world_residents_kind_ai_only_check;

    UPDATE nexus_world_residents
    SET resident_json = jsonb_set(
      resident_json,
      '{kind}',
      to_jsonb(
        CASE resident_json ->> 'kind'
          WHEN 'synthetic-human' THEN 'human'
          WHEN 'software-ai' THEN 'ai'
          WHEN 'embodied-robot' THEN 'robot'
          ELSE resident_json ->> 'kind'
        END
      ),
      false
    )
    WHERE resident_json ->> 'kind' IN (
      'synthetic-human',
      'software-ai',
      'embodied-robot'
    );

    UPDATE nexus_world_residents
    SET kind = CASE kind
      WHEN 'synthetic-human' THEN 'human'
      WHEN 'software-ai' THEN 'ai'
      WHEN 'embodied-robot' THEN 'robot'
      ELSE kind
    END
    WHERE kind IN (
      'synthetic-human',
      'software-ai',
      'embodied-robot'
    );

    ALTER TABLE nexus_world_residents
      ADD CONSTRAINT nexus_world_residents_kind_ai_only_check
      CHECK (kind IN ('human', 'ai', 'robot'));
  END IF;
END
$$;
