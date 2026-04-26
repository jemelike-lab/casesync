-- 021: Fix infinite recursion in w_user RLS policies
--
-- Migration 020 created two policies on w_user that query w_user inside
-- their own USING clause — this causes "infinite recursion detected in
-- policy for relation w_user" which cascades to ALL tables that reference
-- w_user (evaluations, notifications, tasks, time_entries, etc).
--
-- Fix: use a security-definer helper function to check the role without
-- triggering RLS, breaking the recursion cycle.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Create a security definer function to check w_user role ────────────────
-- This bypasses RLS (SECURITY DEFINER runs as the function owner, not the caller)
-- so it can safely query w_user without triggering its own policies.

CREATE OR REPLACE FUNCTION is_workryn_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM w_user
    WHERE "supabaseId" = (auth.uid())::text
      AND role = ANY (ARRAY['supervisor', 'team_manager'])
  );
$$;

CREATE OR REPLACE FUNCTION get_workryn_user_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM w_user WHERE "supabaseId" = (auth.uid())::text LIMIT 1;
$$;

-- ── 2. Fix w_user policies (the recursive ones) ───────────────────────────────

DROP POLICY IF EXISTS "Admins can read all w_user records" ON w_user;
CREATE POLICY "Admins can read all w_user records" ON w_user
  FOR SELECT TO authenticated
  USING (is_workryn_admin() OR "supabaseId" = (auth.uid())::text);

DROP POLICY IF EXISTS "Admins can update any w_user record" ON w_user;
CREATE POLICY "Admins can update any w_user record" ON w_user
  FOR UPDATE TO authenticated
  USING (is_workryn_admin() OR "supabaseId" = (auth.uid())::text)
  WITH CHECK (is_workryn_admin() OR "supabaseId" = (auth.uid())::text);

-- Also fix self-update policy if it exists
DROP POLICY IF EXISTS "Users can update own w_user record" ON w_user;
CREATE POLICY "Users can update own w_user record" ON w_user
  FOR UPDATE TO authenticated
  USING ("supabaseId" = (auth.uid())::text)
  WITH CHECK ("supabaseId" = (auth.uid())::text);

-- ── 3. Rewrite all other policies that inline the w_user lookup ───────────────
-- Replace inline SELECT FROM w_user subqueries with is_workryn_admin() calls
-- to avoid cascading recursion from other tables too.

-- w_audit_log
DROP POLICY IF EXISTS "Admins can read audit log" ON w_audit_log;
CREATE POLICY "Admins can read audit log" ON w_audit_log
  FOR SELECT TO authenticated
  USING (is_workryn_admin());

-- w_channel_member
DROP POLICY IF EXISTS "Users can leave channels or admins can remove" ON w_channel_member;
CREATE POLICY "Users can leave channels or admins can remove" ON w_channel_member
  FOR DELETE TO authenticated
  USING ("userId" = get_workryn_user_id() OR is_workryn_admin());

-- w_chat_channel
DROP POLICY IF EXISTS "Admins can manage chat channels" ON w_chat_channel;
CREATE POLICY "Admins can manage chat channels" ON w_chat_channel
  FOR ALL TO authenticated
  USING (is_workryn_admin());

-- w_chat_message
DROP POLICY IF EXISTS "Authors and admins can delete chat messages" ON w_chat_message;
CREATE POLICY "Authors and admins can delete chat messages" ON w_chat_message
  FOR DELETE TO authenticated
  USING ("authorId" = get_workryn_user_id() OR is_workryn_admin());

-- w_department
DROP POLICY IF EXISTS "Admins can delete departments" ON w_department;
CREATE POLICY "Admins can delete departments" ON w_department
  FOR DELETE TO authenticated
  USING (is_workryn_admin());

DROP POLICY IF EXISTS "Admins can update departments" ON w_department;
CREATE POLICY "Admins can update departments" ON w_department
  FOR UPDATE TO authenticated
  USING (is_workryn_admin());

-- w_evaluation
DROP POLICY IF EXISTS "Admins can manage evaluations" ON w_evaluation;
CREATE POLICY "Admins can manage evaluations" ON w_evaluation
  FOR ALL TO authenticated
  USING (is_workryn_admin());

DROP POLICY IF EXISTS "Users can read evaluations about themselves" ON w_evaluation;
CREATE POLICY "Users can read evaluations about themselves" ON w_evaluation
  FOR SELECT TO authenticated
  USING (is_workryn_admin() OR "agentId" = get_workryn_user_id());

-- w_evaluation_criterion
DROP POLICY IF EXISTS "Admins can manage evaluation criteria" ON w_evaluation_criterion;
CREATE POLICY "Admins can manage evaluation criteria" ON w_evaluation_criterion
  FOR ALL TO authenticated
  USING (is_workryn_admin());

-- w_evaluation_score
DROP POLICY IF EXISTS "Admins can manage evaluation scores" ON w_evaluation_score;
CREATE POLICY "Admins can manage evaluation scores" ON w_evaluation_score
  FOR ALL TO authenticated
  USING (is_workryn_admin());

DROP POLICY IF EXISTS "Users can read own evaluation scores" ON w_evaluation_score;
CREATE POLICY "Users can read own evaluation scores" ON w_evaluation_score
  FOR SELECT TO authenticated
  USING (
    is_workryn_admin() OR EXISTS (
      SELECT 1 FROM w_evaluation e
      WHERE e.id = w_evaluation_score."evaluationId"
        AND e."agentId" = get_workryn_user_id()
    )
  );

-- w_evaluation_template
DROP POLICY IF EXISTS "Admins can manage evaluation templates" ON w_evaluation_template;
CREATE POLICY "Admins can manage evaluation templates" ON w_evaluation_template
  FOR ALL TO authenticated
  USING (is_workryn_admin());

-- w_invitation
DROP POLICY IF EXISTS "Admins can manage invitations" ON w_invitation;
CREATE POLICY "Admins can manage invitations" ON w_invitation
  FOR ALL TO authenticated
  USING (is_workryn_admin());

-- w_quiz_option
DROP POLICY IF EXISTS "Admins can manage quiz options" ON w_quiz_option;
CREATE POLICY "Admins can manage quiz options" ON w_quiz_option
  FOR ALL TO authenticated
  USING (is_workryn_admin());

-- w_quiz_question
DROP POLICY IF EXISTS "Admins can manage quiz questions" ON w_quiz_question;
CREATE POLICY "Admins can manage quiz questions" ON w_quiz_question
  FOR ALL TO authenticated
  USING (is_workryn_admin());

-- w_shift
DROP POLICY IF EXISTS "Admins can manage shifts" ON w_shift;
CREATE POLICY "Admins can manage shifts" ON w_shift
  FOR ALL TO authenticated
  USING (is_workryn_admin());

DROP POLICY IF EXISTS "Users can read own shifts" ON w_shift;
CREATE POLICY "Users can read own shifts" ON w_shift
  FOR SELECT TO authenticated
  USING ("userId" = get_workryn_user_id() OR is_workryn_admin());

-- w_task
DROP POLICY IF EXISTS "Admins can delete tasks" ON w_task;
CREATE POLICY "Admins can delete tasks" ON w_task
  FOR DELETE TO authenticated
  USING (is_workryn_admin());

DROP POLICY IF EXISTS "Assigned users and admins can update tasks" ON w_task;
CREATE POLICY "Assigned users and admins can update tasks" ON w_task
  FOR UPDATE TO authenticated
  USING ("assignedToId" = get_workryn_user_id() OR is_workryn_admin())
  WITH CHECK ("assignedToId" = get_workryn_user_id() OR is_workryn_admin());

DROP POLICY IF EXISTS "Users can read own and assigned tasks" ON w_task;
CREATE POLICY "Users can read own and assigned tasks" ON w_task
  FOR SELECT TO authenticated
  USING ("assignedToId" = get_workryn_user_id() OR is_workryn_admin());

-- w_task_comment
DROP POLICY IF EXISTS "Authors and admins can delete task comments" ON w_task_comment;
CREATE POLICY "Authors and admins can delete task comments" ON w_task_comment
  FOR DELETE TO authenticated
  USING ("authorId" = get_workryn_user_id() OR is_workryn_admin());

-- w_ticket
DROP POLICY IF EXISTS "Admins can delete tickets" ON w_ticket;
CREATE POLICY "Admins can delete tickets" ON w_ticket
  FOR DELETE TO authenticated
  USING (is_workryn_admin());

DROP POLICY IF EXISTS "Assigned users and admins can update tickets" ON w_ticket;
CREATE POLICY "Assigned users and admins can update tickets" ON w_ticket
  FOR UPDATE TO authenticated
  USING ("assignedToId" = get_workryn_user_id() OR is_workryn_admin())
  WITH CHECK ("assignedToId" = get_workryn_user_id() OR is_workryn_admin());

DROP POLICY IF EXISTS "Users can read own and assigned tickets" ON w_ticket;
CREATE POLICY "Users can read own and assigned tickets" ON w_ticket
  FOR SELECT TO authenticated
  USING ("assignedToId" = get_workryn_user_id() OR is_workryn_admin());

-- w_ticket_internal_note
DROP POLICY IF EXISTS "Admins can manage ticket internal notes" ON w_ticket_internal_note;
CREATE POLICY "Admins can manage ticket internal notes" ON w_ticket_internal_note
  FOR ALL TO authenticated
  USING (is_workryn_admin());

-- w_ticket_message
DROP POLICY IF EXISTS "Authors and admins can delete ticket messages" ON w_ticket_message;
CREATE POLICY "Authors and admins can delete ticket messages" ON w_ticket_message
  FOR DELETE TO authenticated
  USING ("authorId" = get_workryn_user_id() OR is_workryn_admin());

-- w_time_entry
DROP POLICY IF EXISTS "Admins can read all time entries" ON w_time_entry;
CREATE POLICY "Admins can read all time entries" ON w_time_entry
  FOR SELECT TO authenticated
  USING (is_workryn_admin() OR "userId" = get_workryn_user_id());

-- w_training_course
DROP POLICY IF EXISTS "Admins can manage training courses" ON w_training_course;
CREATE POLICY "Admins can manage training courses" ON w_training_course
  FOR ALL TO authenticated
  USING (is_workryn_admin());

-- w_training_enrollment
DROP POLICY IF EXISTS "Admins can read all enrollments" ON w_training_enrollment;
CREATE POLICY "Admins can read all enrollments" ON w_training_enrollment
  FOR SELECT TO authenticated
  USING (is_workryn_admin() OR "userId" = get_workryn_user_id());

-- w_training_lesson
DROP POLICY IF EXISTS "Admins can manage training lessons" ON w_training_lesson;
CREATE POLICY "Admins can manage training lessons" ON w_training_lesson
  FOR ALL TO authenticated
  USING (is_workryn_admin());

-- w_training_quiz
DROP POLICY IF EXISTS "Admins can manage training quizzes" ON w_training_quiz;
CREATE POLICY "Admins can manage training quizzes" ON w_training_quiz
  FOR ALL TO authenticated
  USING (is_workryn_admin());
