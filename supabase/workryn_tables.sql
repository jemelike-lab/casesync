CREATE TABLE IF NOT EXISTS "w_user" (
  "id" TEXT PRIMARY KEY,
  "supabaseId" TEXT UNIQUE,
  "name" TEXT,
  "email" TEXT UNIQUE,
  "emailVerified" TIMESTAMPTZ,
  "image" TEXT,
  "password" TEXT,
  "role" TEXT NOT NULL DEFAULT 'STAFF',
  "jobTitle" TEXT,
  "phone" TEXT,
  "bio" TEXT,
  "avatarColor" TEXT NOT NULL DEFAULT '#6366f1',
  "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
  "mfaSecret" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastLogin" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "departmentId" TEXT
);

CREATE TABLE IF NOT EXISTS "w_department" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL UNIQUE,
  "description" TEXT,
  "color" TEXT NOT NULL DEFAULT '#6366f1',
  "icon" TEXT NOT NULL DEFAULT 'building-2',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "headId" TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS "w_time_entry" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "clockInAt" TIMESTAMPTZ NOT NULL,
  "clockOutAt" TIMESTAMPTZ,
  "totalMinutes" INTEGER NOT NULL DEFAULT 0,
  "breakMinutes" INTEGER NOT NULL DEFAULT 0,
  "workedMinutes" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "notes" TEXT,
  "editedById" TEXT,
  "editReason" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "w_time_break" (
  "id" TEXT PRIMARY KEY,
  "timeEntryId" TEXT NOT NULL,
  "startAt" TIMESTAMPTZ NOT NULL,
  "endAt" TIMESTAMPTZ,
  "plannedMinutes" INTEGER NOT NULL,
  "actualMinutes" INTEGER,
  "type" TEXT NOT NULL DEFAULT 'LUNCH',
  "createdAt" TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS "w_task" (
  "id" TEXT PRIMARY KEY,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'TODO',
  "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
  "tags" TEXT,
  "dueDate" TIMESTAMPTZ,
  "completedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "assignedToId" TEXT,
  "createdById" TEXT NOT NULL,
  "departmentId" TEXT
);

CREATE TABLE IF NOT EXISTS "w_task_comment" (
  "id" TEXT PRIMARY KEY,
  "content" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS "w_ticket" (
  "id" TEXT PRIMARY KEY,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
  "category" TEXT,
  "tags" TEXT,
  "requesterFirstName" TEXT,
  "requesterLastName" TEXT,
  "requesterEmail" TEXT,
  "requesterPhone" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "resolvedAt" TIMESTAMPTZ,
  "archivedAt" TIMESTAMPTZ,
  "createdById" TEXT NOT NULL,
  "assignedToId" TEXT,
  "departmentId" TEXT
);

CREATE TABLE IF NOT EXISTS "w_ticket_message" (
  "id" TEXT PRIMARY KEY,
  "content" TEXT NOT NULL,
  "sentViaEmail" BOOLEAN NOT NULL DEFAULT false,
  "isFromAgent" BOOLEAN NOT NULL DEFAULT false,
  "ticketId" TEXT NOT NULL,
  "authorId" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS "w_ticket_internal_note" (
  "id" TEXT PRIMARY KEY,
  "content" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS "w_training_course" (
  "id" TEXT PRIMARY KEY,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "thumbnail" TEXT,
  "category" TEXT,
  "isRequired" BOOLEAN NOT NULL DEFAULT false,
  "isPublished" BOOLEAN NOT NULL DEFAULT false,
  "passThreshold" INTEGER NOT NULL DEFAULT 70,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "w_training_lesson" (
  "id" TEXT PRIMARY KEY,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL DEFAULT '',
  "videoUrl" TEXT,
  "videoFileName" TEXT,
  "durationSeconds" INTEGER,
  "order" INTEGER NOT NULL DEFAULT 0,
  "courseId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "w_lesson_progress" (
  "id" TEXT PRIMARY KEY,
  "completed" BOOLEAN NOT NULL DEFAULT false,
  "watchedSeconds" INTEGER NOT NULL DEFAULT 0,
  "lessonId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("lessonId", "userId")
);

CREATE TABLE IF NOT EXISTS "w_training_quiz" (
  "id" TEXT PRIMARY KEY,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "passThreshold" INTEGER NOT NULL DEFAULT 70,
  "courseId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "w_quiz_question" (
  "id" TEXT PRIMARY KEY,
  "text" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'MULTIPLE_CHOICE',
  "order" INTEGER NOT NULL DEFAULT 0,
  "points" INTEGER NOT NULL DEFAULT 1,
  "quizId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS "w_quiz_option" (
  "id" TEXT PRIMARY KEY,
  "text" TEXT NOT NULL,
  "isCorrect" BOOLEAN NOT NULL DEFAULT false,
  "order" INTEGER NOT NULL DEFAULT 0,
  "questionId" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "w_quiz_attempt" (
  "id" TEXT PRIMARY KEY,
  "score" INTEGER NOT NULL,
  "passed" BOOLEAN NOT NULL,
  "answers" TEXT NOT NULL,
  "quizId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "startedAt" TIMESTAMPTZ NOT NULL,
  "completedAt" TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS "w_training_enrollment" (
  "id" TEXT PRIMARY KEY,
  "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
  "completedAt" TIMESTAMPTZ,
  "courseId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "enrolledAt" TIMESTAMPTZ NOT NULL,
  UNIQUE ("courseId", "userId")
);

CREATE TABLE IF NOT EXISTS "w_evaluation_template" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "documentUrl" TEXT,
  "documentName" TEXT,
  "documentSize" INTEGER,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "w_evaluation_criterion" (
  "id" TEXT PRIMARY KEY,
  "label" TEXT NOT NULL,
  "description" TEXT,
  "order" INTEGER NOT NULL DEFAULT 0,
  "maxScore" INTEGER NOT NULL DEFAULT 5,
  "templateId" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "w_evaluation" (
  "id" TEXT PRIMARY KEY,
  "overallRating" INTEGER,
  "comments" TEXT,
  "isPrivate" BOOLEAN NOT NULL DEFAULT false,
  "documentUrl" TEXT,
  "documentName" TEXT,
  "documentSize" INTEGER,
  "templateId" TEXT NOT NULL,
  "agentId" TEXT NOT NULL,
  "evaluatorId" TEXT NOT NULL,
  "acknowledgedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "w_evaluation_score" (
  "id" TEXT PRIMARY KEY,
  "score" INTEGER NOT NULL,
  "comment" TEXT,
  "evaluationId" TEXT NOT NULL,
  "criterionId" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "w_audit_log" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "resourceType" TEXT NOT NULL,
  "resourceId" TEXT,
  "details" TEXT,
  "ipAddress" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS "w_chat_channel" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL UNIQUE,
  "description" TEXT,
  "isGeneral" BOOLEAN NOT NULL DEFAULT false,
  "visibility" TEXT NOT NULL DEFAULT 'PUBLIC',
  "createdById" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS "w_channel_member" (
  "id" TEXT PRIMARY KEY,
  "role" TEXT NOT NULL DEFAULT 'MEMBER',
  "joinedAt" TIMESTAMPTZ NOT NULL,
  "channelId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  UNIQUE ("channelId", "userId")
);

CREATE TABLE IF NOT EXISTS "w_message_reaction" (
  "id" TEXT PRIMARY KEY,
  "emoji" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("messageId", "userId", "emoji")
);

CREATE TABLE IF NOT EXISTS "w_reminder" (
  "id" TEXT PRIMARY KEY,
  "title" TEXT NOT NULL,
  "note" TEXT,
  "dueAt" TIMESTAMPTZ NOT NULL,
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "userId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "w_chat_message" (
  "id" TEXT PRIMARY KEY,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "editedAt" TIMESTAMPTZ,
  "channelId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "w_notification" (
  "id" TEXT PRIMARY KEY,
  "type" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'SYSTEM',
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "link" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "userId" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "w_shift" (
  "id" TEXT PRIMARY KEY,
  "title" TEXT NOT NULL,
  "startTime" TIMESTAMPTZ NOT NULL,
  "endTime" TIMESTAMPTZ NOT NULL,
  "notes" TEXT,
  "color" TEXT NOT NULL DEFAULT '#6366f1',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "userId" TEXT NOT NULL,
  "departmentId" TEXT
);

CREATE TABLE IF NOT EXISTS "w_invitation" (
  "id" TEXT PRIMARY KEY,
  "email" TEXT NOT NULL,
  "token" TEXT NOT NULL UNIQUE,
  "role" TEXT NOT NULL DEFAULT 'STAFF',
  "departmentId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "message" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "invitedById" TEXT NOT NULL,
  "acceptedById" TEXT
);

CREATE TABLE IF NOT EXISTS "w_direct_conversation" (
  "id" TEXT PRIMARY KEY,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "w_direct_conversation_participant" (
  "id" TEXT PRIMARY KEY,
  "conversationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "joinedAt" TIMESTAMPTZ NOT NULL,
  UNIQUE ("conversationId", "userId")
);

CREATE TABLE IF NOT EXISTS "w_direct_message" (
  "id" TEXT PRIMARY KEY,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "editedAt" TIMESTAMPTZ,
  "conversationId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL
);
