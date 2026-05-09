-- Training Channels: New Hire & Refresher

-- Course-level: channel type and score visibility
ALTER TABLE w_training_course ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT NULL;
ALTER TABLE w_training_course ADD COLUMN IF NOT EXISTS scores_visibility TEXT DEFAULT 'ALL';

-- Lesson-level: day-based unlock and manual lock
ALTER TABLE w_training_lesson ADD COLUMN IF NOT EXISTS unlock_day INT DEFAULT NULL;
ALTER TABLE w_training_lesson ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false;

-- Quiz-level: day-based unlock and manual lock  
ALTER TABLE w_training_quiz ADD COLUMN IF NOT EXISTS unlock_day INT DEFAULT NULL;
ALTER TABLE w_training_quiz ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false;
