-- ============================================================================
-- RLS policies — CLAUDE.md §7, N10. Applied by `pnpm db:policies`.
-- These live in the repo and are applied by script. Never clicked into the
-- Supabase dashboard: a policy you cannot diff is a policy you cannot trust.
--
-- auth.uid() is NOT used anywhere. It returns uuid; Clerk subjects are text.
-- ============================================================================

create or replace function public.clerk_user_id() returns text
language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::text
$$;

-- ---------------------------------------------------------------- user data
-- Every table carrying clerk_user_id gets the same shape: own rows only, and
-- the request must carry the authenticated role from the Clerk integration.

do $$
declare
  t text;
  user_tables text[] := array[
    'users',
    'source_documents',
    'master_profiles',
    'experience_bullets',
    'analyses',
    'jd_requirements',
    'coverage_items',
    'resume_drafts',
    'tailored_bullets',
    'interview_questions',
    'question_answers',
    'skill_gaps',
    'exports',
    'ai_runs'
  ];
  key_column text;
begin
  foreach t in array user_tables loop
    key_column := case when t = 'users' then 'clerk_user_id' else 'clerk_user_id' end;

    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated
         using      (%I = public.clerk_user_id())
         with check (%I = public.clerk_user_id())',
      t, key_column, key_column
    );
  end loop;
end $$;

-- ------------------------------------------------------------ reference data
-- templates / skills / courses are seeded, not user-owned: public read, no
-- write policy for authenticated users. Writes go through the service role,
-- which bypasses RLS by design.

do $$
declare
  t text;
begin
  foreach t in array array['templates', 'skills', 'courses'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "public read" on public.%I', t);
    execute format(
      'create policy "public read" on public.%I for select to authenticated, anon using (true)', t
    );
  end loop;
end $$;

-- --------------------------------------------------------------- storage RLS
-- Path prefix must match the requesting subject (specs §6.3):
--   resume/{clerk_user_id}/...
--   exports/{clerk_user_id}/{analysis_id}/...

do $$
declare
  b text;
begin
  foreach b in array array['resume', 'exports'] loop
    execute format('drop policy if exists "own objects %s" on storage.objects', b);
    execute format(
      'create policy "own objects %s" on storage.objects for all to authenticated
         using      (bucket_id = %L and (storage.foldername(name))[1] = public.clerk_user_id())
         with check (bucket_id = %L and (storage.foldername(name))[1] = public.clerk_user_id())',
      b, b, b
    );
  end loop;
end $$;
