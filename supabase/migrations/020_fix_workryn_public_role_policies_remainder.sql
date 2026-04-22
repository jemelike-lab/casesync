-- 020: Fix remaining Workryn RLS policies using {public} role → {authenticated}
--
-- 10 policies missed by migration 019 (tables w_ticket through w_user).
-- Role logic (qual/with_check) is correct — only the TO clause needs fixing.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── w_ticket ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can read own and assigned tickets" ON w_ticket;
CREATE POLICY "Users can read own and assigned tickets" ON w_ticket
  FOR SELECT TO authenticated
  USING (
    ("assignedToId" = (SELECT w_user.id FROM w_user WHERE w_user."supabaseId" = (auth.uid())::text))
    OR EXISTS (
      SELECT 1 FROM w_user wu
      WHERE wu."supabaseId" = (auth.uid())::text
        AND wu.role = ANY (ARRAY['supervisor'::text, 'team_manager'::text])
    )
  );

-- ── w_ticket_internal_note ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage ticket internal notes" ON w_ticket_internal_note;
CREATE POLICY "Admins can manage ticket internal notes" ON w_ticket_internal_note
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM w_user wu
    WHERE wu."supabaseId" = (auth.uid())::text
      AND wu.role = ANY (ARRAY['supervisor'::text, 'team_manager'::text])
  ));

-- ── w_ticket_message ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authors and admins can delete ticket messages" ON w_ticket_message;
CREATE POLICY "Authors and admins can delete ticket messages" ON w_ticket_message
  FOR DELETE TO authenticated
  USING (
    ("authorId" = (SELECT w_user.id FROM w_user WHERE w_user."supabaseId" = (auth.uid())::text))
    OR EXISTS (
      SELECT 1 FROM w_user wu
      WHERE wu."supabaseId" = (auth.uid())::text
        AND wu.role = ANY (ARRAY['supervisor'::text, 'team_manager'::text])
    )
  );

-- ── w_time_entry ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can read all time entries" ON w_time_entry;
CREATE POLICY "Admins can read all time entries" ON w_time_entry
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM w_user wu
    WHERE wu."supabaseId" = (auth.uid())::text
      AND wu.role = ANY (ARRAY['supervisor'::text, 'team_manager'::text])
  ));

-- ── w_training_course ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage training courses" ON w_training_course;
CREATE POLICY "Admins can manage training courses" ON w_training_course
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM w_user wu
    WHERE wu."supabaseId" = (auth.uid())::text
      AND wu.role = ANY (ARRAY['supervisor'::text, 'team_manager'::text])
  ));

-- ── w_training_enrollment ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can read all enrollments" ON w_training_enrollment;
CREATE POLICY "Admins can read all enrollments" ON w_training_enrollment
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM w_user wu
    WHERE wu."supabaseId" = (auth.uid())::text
      AND wu.role = ANY (ARRAY['supervisor'::text, 'team_manager'::text])
  ));

-- ── w_training_lesson ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage training lessons" ON w_training_lesson;
CREATE POLICY "Admins can manage training lessons" ON w_training_lesson
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM w_user wu
    WHERE wu."supabaseId" = (auth.uid())::text
      AND wu.role = ANY (ARRAY['supervisor'::text, 'team_manager'::text])
  ));

-- ── w_training_quiz ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage training quizzes" ON w_training_quiz;
CREATE POLICY "Admins can manage training quizzes" ON w_training_quiz
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM w_user wu
    WHERE wu."supabaseId" = (auth.uid())::text
      AND wu.role = ANY (ARRAY['supervisor'::text, 'team_manager'::text])
  ));

-- ── w_user ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can read all w_user records" ON w_user;
CREATE POLICY "Admins can read all w_user records" ON w_user
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM w_user wu
    WHERE wu."supabaseId" = (auth.uid())::text
      AND wu.role = ANY (ARRAY['supervisor'::text, 'team_manager'::text])
  ));

DROP POLICY IF EXISTS "Admins can update any w_user record" ON w_user;
CREATE POLICY "Admins can update any w_user record" ON w_user
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM w_user wu
    WHERE wu."supabaseId" = (auth.uid())::text
      AND wu.role = ANY (ARRAY['supervisor'::text, 'team_manager'::text])
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM w_user wu
    WHERE wu."supabaseId" = (auth.uid())::text
      AND wu.role = ANY (ARRAY['supervisor'::text, 'team_manager'::text])
  ));