-- 019: Fix Workryn RLS policies using {public} role → {authenticated}
--
-- 22 policies were created with TO public instead of TO authenticated.
-- The role logic (qual/with_check) is correct — only the TO clause needs fixing.
-- All drops are safe: the replacement policy is created in the same block.
-- All statements are idempotent when run in sequence.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── w_audit_log ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can read audit log" ON w_audit_log;
CREATE POLICY "Admins can read audit log" ON w_audit_log
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM w_user wu
    WHERE wu."supabaseId" = (auth.uid())::text
      AND wu.role = ANY (ARRAY['supervisor'::text, 'team_manager'::text])
  ));

-- ── w_channel_member ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can leave channels or admins can remove" ON w_channel_member;
CREATE POLICY "Users can leave channels or admins can remove" ON w_channel_member
  FOR DELETE TO authenticated
  USING (
    ("userId" = (SELECT w_user.id FROM w_user WHERE w_user."supabaseId" = (auth.uid())::text))
    OR EXISTS (
      SELECT 1 FROM w_user wu
      WHERE wu."supabaseId" = (auth.uid())::text
        AND wu.role = ANY (ARRAY['supervisor'::text, 'team_manager'::text])
    )
  );

-- ── w_chat_channel ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage chat channels" ON w_chat_channel;
CREATE POLICY "Admins can manage chat channels" ON w_chat_channel
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM w_user wu
    WHERE wu."supabaseId" = (auth.uid())::text
      AND wu.role = ANY (ARRAY['supervisor'::text, 'team_manager'::text])
  ));

-- ── w_chat_message ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authors and admins can delete chat messages" ON w_chat_message;
CREATE POLICY "Authors and admins can delete chat messages" ON w_chat_message
  FOR DELETE TO authenticated
  USING (
    ("authorId" = (SELECT w_user.id FROM w_user WHERE w_user."supabaseId" = (auth.uid())::text))
    OR EXISTS (
      SELECT 1 FROM w_user wu
      WHERE wu."supabaseId" = (auth.uid())::text
        AND wu.role = ANY (ARRAY['supervisor'::text, 'team_manager'::text])
    )
  );

-- ── w_department ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can delete departments" ON w_department;
CREATE POLICY "Admins can delete departments" ON w_department
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM w_user wu
    WHERE wu."supabaseId" = (auth.uid())::text
      AND wu.role = ANY (ARRAY['supervisor'::text, 'team_manager'::text])
  ));

DROP POLICY IF EXISTS "Admins can update departments" ON w_department;
CREATE POLICY "Admins can update departments" ON w_department
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM w_user wu
    WHERE wu."supabaseId" = (auth.uid())::text
      AND wu.role = ANY (ARRAY['supervisor'::text, 'team_manager'::text])
  ));

-- ── w_evaluation ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage evaluations" ON w_evaluation;
CREATE POLICY "Admins can manage evaluations" ON w_evaluation
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM w_user wu
    WHERE wu."supabaseId" = (auth.uid())::text
      AND wu.role = ANY (ARRAY['supervisor'::text, 'team_manager'::text])
  ));

DROP POLICY IF EXISTS "Users can read evaluations about themselves" ON w_evaluation;
CREATE POLICY "Users can read evaluations about themselves" ON w_evaluation
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM w_user wu
    WHERE wu."supabaseId" = (auth.uid())::text
      AND (wu.id = w_evaluation."agentId"
           OR wu.role = ANY (ARRAY['supervisor'::text, 'team_manager'::text]))
  ));

-- ── w_evaluation_criterion ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage evaluation criteria" ON w_evaluation_criterion;
CREATE POLICY "Admins can manage evaluation criteria" ON w_evaluation_criterion
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM w_user wu
    WHERE wu."supabaseId" = (auth.uid())::text
      AND wu.role = ANY (ARRAY['supervisor'::text, 'team_manager'::text])
  ));

-- ── w_evaluation_score ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage evaluation scores" ON w_evaluation_score;
CREATE POLICY "Admins can manage evaluation scores" ON w_evaluation_score
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM w_user wu
    WHERE wu."supabaseId" = (auth.uid())::text
      AND wu.role = ANY (ARRAY['supervisor'::text, 'team_manager'::text])
  ));

DROP POLICY IF EXISTS "Users can read own evaluation scores" ON w_evaluation_score;
CREATE POLICY "Users can read own evaluation scores" ON w_evaluation_score
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM w_evaluation e
    JOIN w_user wu ON wu."supabaseId" = (auth.uid())::text
    WHERE e.id = w_evaluation_score."evaluationId"
      AND (e."agentId" = wu.id
           OR wu.role = ANY (ARRAY['supervisor'::text, 'team_manager'::text]))
  ));

-- ── w_evaluation_template ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage evaluation templates" ON w_evaluation_template;
CREATE POLICY "Admins can manage evaluation templates" ON w_evaluation_template
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM w_user wu
    WHERE wu."supabaseId" = (auth.uid())::text
      AND wu.role = ANY (ARRAY['supervisor'::text, 'team_manager'::text])
  ));

-- ── w_invitation ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage invitations" ON w_invitation;
CREATE POLICY "Admins can manage invitations" ON w_invitation
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM w_user wu
    WHERE wu."supabaseId" = (auth.uid())::text
      AND wu.role = ANY (ARRAY['supervisor'::text, 'team_manager'::text])
  ));

-- ── w_quiz_option ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage quiz options" ON w_quiz_option;
CREATE POLICY "Admins can manage quiz options" ON w_quiz_option
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM w_user wu
    WHERE wu."supabaseId" = (auth.uid())::text
      AND wu.role = ANY (ARRAY['supervisor'::text, 'team_manager'::text])
  ));

-- ── w_quiz_question ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage quiz questions" ON w_quiz_question;
CREATE POLICY "Admins can manage quiz questions" ON w_quiz_question
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM w_user wu
    WHERE wu."supabaseId" = (auth.uid())::text
      AND wu.role = ANY (ARRAY['supervisor'::text, 'team_manager'::text])
  ));

-- ── w_shift ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage shifts" ON w_shift;
CREATE POLICY "Admins can manage shifts" ON w_shift
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM w_user wu
    WHERE wu."supabaseId" = (auth.uid())::text
      AND wu.role = ANY (ARRAY['supervisor'::text, 'team_manager'::text])
  ));

DROP POLICY IF EXISTS "Users can read own shifts" ON w_shift;
CREATE POLICY "Users can read own shifts" ON w_shift
  FOR SELECT TO authenticated
  USING (
    ("userId" = (SELECT w_user.id FROM w_user WHERE w_user."supabaseId" = (auth.uid())::text))
    OR EXISTS (
      SELECT 1 FROM w_user wu
      WHERE wu."supabaseId" = (auth.uid())::text
        AND wu.role = ANY (ARRAY['supervisor'::text, 'team_manager'::text])
    )
  );

-- ── w_task ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can delete tasks" ON w_task;
CREATE POLICY "Admins can delete tasks" ON w_task
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM w_user wu
    WHERE wu."supabaseId" = (auth.uid())::text
      AND wu.role = ANY (ARRAY['supervisor'::text, 'team_manager'::text])
  ));

DROP POLICY IF EXISTS "Assigned users and admins can update tasks" ON w_task;
CREATE POLICY "Assigned users and admins can update tasks" ON w_task
  FOR UPDATE TO authenticated
  USING (
    ("assignedToId" = (SELECT w_user.id FROM w_user WHERE w_user."supabaseId" = (auth.uid())::text))
    OR EXISTS (
      SELECT 1 FROM w_user wu
      WHERE wu."supabaseId" = (auth.uid())::text
        AND wu.role = ANY (ARRAY['supervisor'::text, 'team_manager'::text])
    )
  )
  WITH CHECK (
    ("assignedToId" = (SELECT w_user.id FROM w_user WHERE w_user."supabaseId" = (auth.uid())::text))
    OR EXISTS (
      SELECT 1 FROM w_user wu
      WHERE wu."supabaseId" = (auth.uid())::text
        AND wu.role = ANY (ARRAY['supervisor'::text, 'team_manager'::text])
    )
  );

DROP POLICY IF EXISTS "Users can read own and assigned tasks" ON w_task;
CREATE POLICY "Users can read own and assigned tasks" ON w_task
  FOR SELECT TO authenticated
  USING (
    ("assignedToId" = (SELECT w_user.id FROM w_user WHERE w_user."supabaseId" = (auth.uid())::text))
    OR EXISTS (
      SELECT 1 FROM w_user wu
      WHERE wu."supabaseId" = (auth.uid())::text
        AND wu.role = ANY (ARRAY['supervisor'::text, 'team_manager'::text])
    )
  );

-- ── w_task_comment ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authors and admins can delete task comments" ON w_task_comment;
CREATE POLICY "Authors and admins can delete task comments" ON w_task_comment
  FOR DELETE TO authenticated
  USING (
    ("authorId" = (SELECT w_user.id FROM w_user WHERE w_user."supabaseId" = (auth.uid())::text))
    OR EXISTS (
      SELECT 1 FROM w_user wu
      WHERE wu."supabaseId" = (auth.uid())::text
        AND wu.role = ANY (ARRAY['supervisor'::text, 'team_manager'::text])
    )
  );

-- ── w_ticket ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can delete tickets" ON w_ticket;
CREATE POLICY "Admins can delete tickets" ON w_ticket
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM w_user wu
    WHERE wu."supabaseId" = (auth.uid())::text
      AND wu.role = ANY (ARRAY['supervisor'::text, 'team_manager'::text])
  ));

DROP POLICY IF EXISTS "Assigned users and admins can update tickets" ON w_ticket;
CREATE POLICY "Assigned users and admins can update tickets" ON w_ticket
  FOR UPDATE TO authenticated
  USING (
    ("assignedToId" = (SELECT w_user.id FROM w_user WHERE w_user."supabaseId" = (auth.uid())::text))
    OR EXISTS (
      SELECT 1 FROM w_user wu
      WHERE wu."supabaseId" = (auth.uid())::text
        AND wu.role = ANY (ARRAY['supervisor'::text, 'team_manager'::text])
    )
  )
  WITH CHECK (
    ("assignedToId" = (SELECT w_user.id FROM w_user WHERE w_user."supabaseId" = (auth.uid())::text))
    OR EXISTS (
      SELECT 1 FROM w_user wu
      WHERE wu."supabaseId" = (auth.uid())::text
        AND wu.role = ANY (ARRAY['supervisor'::text, 'team_manager'::text])
    )
  );