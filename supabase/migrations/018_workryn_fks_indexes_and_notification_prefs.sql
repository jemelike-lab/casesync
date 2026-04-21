-- 018: Workryn FK constraints, indexes, and missing w_notification_preference table
--
-- workryn_tables.sql (run at integration time) created all w_* tables but:
--   1. Omitted FK constraints (Prisma schema.prisma has them; SQL file does not)
--   2. Omitted all indexes
--   3. Missing w_notification_preference table entirely
--
-- All statements are idempotent (IF NOT EXISTS / DO NOTHING).

-- ── 1. Missing table: w_notification_preference ──────────────────────────────

CREATE TABLE IF NOT EXISTS "w_notification_preference" (
  "id"             TEXT        PRIMARY KEY,
  "userId"         TEXT        NOT NULL UNIQUE,
  "channels"       TEXT        NOT NULL DEFAULT '{}',
  "emailDigest"    TEXT        NOT NULL DEFAULT 'instant',
  "pauseAll"       BOOLEAN     NOT NULL DEFAULT false,
  "dndEnabled"     BOOLEAN     NOT NULL DEFAULT false,
  "dndStart"       TEXT        NOT NULL DEFAULT '22:00',
  "dndEnd"         TEXT        NOT NULL DEFAULT '08:00',
  "playSound"      BOOLEAN     NOT NULL DEFAULT true,
  "desktopEnabled" BOOLEAN     NOT NULL DEFAULT false,
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. FK constraints ─────────────────────────────────────────────────────────
-- All reference w_user(id) or each other. Named so they can be dropped if needed.
-- Using DO $$ ... $$ blocks to skip gracefully if constraint already exists.

DO $$ BEGIN
  ALTER TABLE "w_user"
    ADD CONSTRAINT "w_user_departmentId_fkey"
    FOREIGN KEY ("departmentId") REFERENCES "w_department"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "w_department"
    ADD CONSTRAINT "w_department_headId_fkey"
    FOREIGN KEY ("headId") REFERENCES "w_user"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "w_notification_preference"
    ADD CONSTRAINT "w_notification_preference_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "w_user"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "w_time_entry"
    ADD CONSTRAINT "w_time_entry_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "w_user"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "w_time_entry"
    ADD CONSTRAINT "w_time_entry_editedById_fkey"
    FOREIGN KEY ("editedById") REFERENCES "w_user"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "w_time_break"
    ADD CONSTRAINT "w_time_break_timeEntryId_fkey"
    FOREIGN KEY ("timeEntryId") REFERENCES "w_time_entry"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "w_task"
    ADD CONSTRAINT "w_task_assignedToId_fkey"
    FOREIGN KEY ("assignedToId") REFERENCES "w_user"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "w_task"
    ADD CONSTRAINT "w_task_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "w_user"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "w_task"
    ADD CONSTRAINT "w_task_departmentId_fkey"
    FOREIGN KEY ("departmentId") REFERENCES "w_department"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "w_task_comment"
    ADD CONSTRAINT "w_task_comment_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "w_task"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "w_task_comment"
    ADD CONSTRAINT "w_task_comment_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "w_user"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "w_ticket"
    ADD CONSTRAINT "w_ticket_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "w_user"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "w_ticket"
    ADD CONSTRAINT "w_ticket_assignedToId_fkey"
    FOREIGN KEY ("assignedToId") REFERENCES "w_user"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "w_ticket"
    ADD CONSTRAINT "w_ticket_departmentId_fkey"
    FOREIGN KEY ("departmentId") REFERENCES "w_department"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "w_ticket_message"
    ADD CONSTRAINT "w_ticket_message_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "w_ticket"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "w_ticket_message"
    ADD CONSTRAINT "w_ticket_message_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "w_user"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "w_ticket_internal_note"
    ADD CONSTRAINT "w_ticket_internal_note_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "w_ticket"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "w_ticket_internal_note"
    ADD CONSTRAINT "w_ticket_internal_note_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "w_user"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "w_training_course"
    ADD CONSTRAINT "w_training_course_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "w_user"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "w_training_lesson"
    ADD CONSTRAINT "w_training_lesson_courseId_fkey"
    FOREIGN KEY ("courseId") REFERENCES "w_training_course"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "w_lesson_progress"
    ADD CONSTRAINT "w_lesson_progress_lessonId_fkey"
    FOREIGN KEY ("lessonId") REFERENCES "w_training_lesson"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "w_lesson_progress"
    ADD CONSTRAINT "w_lesson_progress_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "w_user"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "w_training_quiz"
    ADD CONSTRAINT "w_training_quiz_courseId_fkey"
    FOREIGN KEY ("courseId") REFERENCES "w_training_course"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "w_quiz_question"
    ADD CONSTRAINT "w_quiz_question_quizId_fkey"
    FOREIGN KEY ("quizId") REFERENCES "w_training_quiz"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "w_quiz_option"
    ADD CONSTRAINT "w_quiz_option_questionId_fkey"
    FOREIGN KEY ("questionId") REFERENCES "w_quiz_question"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "w_quiz_attempt"
    ADD CONSTRAINT "w_quiz_attempt_quizId_fkey"
    FOREIGN KEY ("quizId") REFERENCES "w_training_quiz"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "w_quiz_attempt"
    ADD CONSTRAINT "w_quiz_attempt_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "w_user"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "w_training_enrollment"
    ADD CONSTRAINT "w_training_enrollment_courseId_fkey"
    FOREIGN KEY ("courseId") REFERENCES "w_training_course"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "w_training_enrollment"
    ADD CONSTRAINT "w_training_enrollment_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "w_user"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "w_evaluation_criterion"
    ADD CONSTRAINT "w_evaluation_criterion_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "w_evaluation_template"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "w_evaluation"
    ADD CONSTRAINT "w_evaluation_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "w_evaluation_template"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "w_evaluation"
    ADD CONSTRAINT "w_evaluation_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "w_user"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "w_evaluation"
    ADD CONSTRAINT "w_evaluation_evaluatorId_fkey"
    FOREIGN KEY ("evaluatorId") REFERENCES "w_user"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "w_evaluation_score"
    ADD CONSTRAINT "w_evaluation_score_evaluationId_fkey"
    FOREIGN KEY ("evaluationId") REFERENCES "w_evaluation"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "w_evaluation_score"
    ADD CONSTRAINT "w_evaluation_score_criterionId_fkey"
    FOREIGN KEY ("criterionId") REFERENCES "w_evaluation_criterion"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "w_audit_log"
    ADD CONSTRAINT "w_audit_log_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "w_user"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "w_channel_member"
    ADD CONSTRAINT "w_channel_member_channelId_fkey"
    FOREIGN KEY ("channelId") REFERENCES "w_chat_channel"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "w_channel_member"
    ADD CONSTRAINT "w_channel_member_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "w_user"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "w_message_reaction"
    ADD CONSTRAINT "w_message_reaction_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "w_chat_message"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "w_message_reaction"
    ADD CONSTRAINT "w_message_reaction_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "w_user"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "w_reminder"
    ADD CONSTRAINT "w_reminder_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "w_user"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "w_chat_message"
    ADD CONSTRAINT "w_chat_message_channelId_fkey"
    FOREIGN KEY ("channelId") REFERENCES "w_chat_channel"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "w_chat_message"
    ADD CONSTRAINT "w_chat_message_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "w_user"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "w_notification"
    ADD CONSTRAINT "w_notification_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "w_user"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "w_shift"
    ADD CONSTRAINT "w_shift_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "w_user"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "w_shift"
    ADD CONSTRAINT "w_shift_departmentId_fkey"
    FOREIGN KEY ("departmentId") REFERENCES "w_department"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "w_invitation"
    ADD CONSTRAINT "w_invitation_invitedById_fkey"
    FOREIGN KEY ("invitedById") REFERENCES "w_user"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "w_invitation"
    ADD CONSTRAINT "w_invitation_acceptedById_fkey"
    FOREIGN KEY ("acceptedById") REFERENCES "w_user"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "w_direct_conversation_participant"
    ADD CONSTRAINT "w_dcp_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "w_direct_conversation"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "w_direct_conversation_participant"
    ADD CONSTRAINT "w_dcp_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "w_user"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "w_direct_message"
    ADD CONSTRAINT "w_direct_message_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "w_direct_conversation"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "w_direct_message"
    ADD CONSTRAINT "w_direct_message_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "w_user"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 3. Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_w_user_supabase_id     ON "w_user" ("supabaseId");
CREATE INDEX IF NOT EXISTS idx_w_user_department      ON "w_user" ("departmentId");
CREATE INDEX IF NOT EXISTS idx_w_user_email           ON "w_user" ("email");
CREATE INDEX IF NOT EXISTS idx_w_user_role            ON "w_user" ("role");

CREATE INDEX IF NOT EXISTS idx_w_time_entry_user      ON "w_time_entry" ("userId");
CREATE INDEX IF NOT EXISTS idx_w_time_entry_status    ON "w_time_entry" ("status");
CREATE INDEX IF NOT EXISTS idx_w_time_entry_clock_in  ON "w_time_entry" ("clockInAt" DESC);
CREATE INDEX IF NOT EXISTS idx_w_time_break_entry     ON "w_time_break" ("timeEntryId");

CREATE INDEX IF NOT EXISTS idx_w_task_assigned        ON "w_task" ("assignedToId");
CREATE INDEX IF NOT EXISTS idx_w_task_created_by      ON "w_task" ("createdById");
CREATE INDEX IF NOT EXISTS idx_w_task_status          ON "w_task" ("status");
CREATE INDEX IF NOT EXISTS idx_w_task_department      ON "w_task" ("departmentId");

CREATE INDEX IF NOT EXISTS idx_w_ticket_created_by    ON "w_ticket" ("createdById");
CREATE INDEX IF NOT EXISTS idx_w_ticket_assigned      ON "w_ticket" ("assignedToId");
CREATE INDEX IF NOT EXISTS idx_w_ticket_status        ON "w_ticket" ("status");
CREATE INDEX IF NOT EXISTS idx_w_ticket_department    ON "w_ticket" ("departmentId");

CREATE INDEX IF NOT EXISTS idx_w_ticket_msg_ticket    ON "w_ticket_message" ("ticketId");
CREATE INDEX IF NOT EXISTS idx_w_ticket_note_ticket   ON "w_ticket_internal_note" ("ticketId");

CREATE INDEX IF NOT EXISTS idx_w_chat_msg_channel     ON "w_chat_message" ("channelId");
CREATE INDEX IF NOT EXISTS idx_w_chat_msg_author      ON "w_chat_message" ("authorId");
CREATE INDEX IF NOT EXISTS idx_w_chat_msg_created     ON "w_chat_message" ("createdAt" DESC);

CREATE INDEX IF NOT EXISTS idx_w_dm_conversation      ON "w_direct_message" ("conversationId");
CREATE INDEX IF NOT EXISTS idx_w_dm_author            ON "w_direct_message" ("authorId");
CREATE INDEX IF NOT EXISTS idx_w_dcp_user             ON "w_direct_conversation_participant" ("userId");

CREATE INDEX IF NOT EXISTS idx_w_notification_user    ON "w_notification" ("userId");
CREATE INDEX IF NOT EXISTS idx_w_notification_read    ON "w_notification" ("userId", "isRead");

CREATE INDEX IF NOT EXISTS idx_w_shift_user           ON "w_shift" ("userId");
CREATE INDEX IF NOT EXISTS idx_w_shift_dept           ON "w_shift" ("departmentId");
CREATE INDEX IF NOT EXISTS idx_w_shift_start          ON "w_shift" ("startTime");

CREATE INDEX IF NOT EXISTS idx_w_reminder_user        ON "w_reminder" ("userId");
CREATE INDEX IF NOT EXISTS idx_w_reminder_due         ON "w_reminder" ("dueAt");

CREATE INDEX IF NOT EXISTS idx_w_invitation_token     ON "w_invitation" ("token");
CREATE INDEX IF NOT EXISTS idx_w_invitation_email     ON "w_invitation" ("email");
CREATE INDEX IF NOT EXISTS idx_w_invitation_status    ON "w_invitation" ("status");

CREATE INDEX IF NOT EXISTS idx_w_audit_user           ON "w_audit_log" ("userId");
CREATE INDEX IF NOT EXISTS idx_w_audit_resource       ON "w_audit_log" ("resourceType", "resourceId");
CREATE INDEX IF NOT EXISTS idx_w_audit_created        ON "w_audit_log" ("createdAt" DESC);

CREATE INDEX IF NOT EXISTS idx_w_lesson_prog_user     ON "w_lesson_progress" ("userId");
CREATE INDEX IF NOT EXISTS idx_w_quiz_attempt_user    ON "w_quiz_attempt" ("userId");
CREATE INDEX IF NOT EXISTS idx_w_enrollment_user      ON "w_training_enrollment" ("userId");

CREATE INDEX IF NOT EXISTS idx_w_eval_agent           ON "w_evaluation" ("agentId");
CREATE INDEX IF NOT EXISTS idx_w_eval_evaluator       ON "w_evaluation" ("evaluatorId");
CREATE INDEX IF NOT EXISTS idx_w_eval_template        ON "w_evaluation" ("templateId");
