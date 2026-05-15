-- 025: Add criterion type field & seed PurelyHR question bank
-- ────────────────────────────────────────────────────────────

-- 1. Add type column to w_evaluation_criterion
ALTER TABLE public.w_evaluation_criterion
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'RATING';

COMMENT ON COLUMN public.w_evaluation_criterion.type IS 'Question type: RATING, TEXT, YES_NO, COMMENT';

-- 2. Seed evaluation templates from PurelyHR Performance Reviews
-- Each competency becomes a template; each question becomes a criterion.

DO $$
DECLARE
  t_id TEXT;
BEGIN

-- ─── New Hire 10-Day Call Agenda ───
t_id := gen_random_uuid()::TEXT;
INSERT INTO public.w_evaluation_template (id, name, description, "isActive", "createdAt", "updatedAt")
VALUES (t_id, 'New Hire 10-Day Call Agenda', 'Structured check-in call for employees at the 10-day mark.', true, NOW(), NOW());
INSERT INTO public.w_evaluation_criterion (id, label, "order", "maxScore", type, "templateId") VALUES
  (gen_random_uuid()::TEXT, 'How is everything going so far?', 0, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'How long have you been with the company?', 1, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'How large is your current caseload?', 2, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'How do you feel about your caseload?', 3, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'What do you enjoy about your position?', 4, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'How is your relationship with your supervisors?', 5, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'Have you had the chance to review your contract?', 6, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'Do you have any questions about your contract?', 7, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'How long until your next contract renewal?', 8, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'Is there any aspect of the job where you would benefit from additional training?', 9, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'Do you need any assistance with your clients?', 10, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'Do you have any other questions for me?', 11, 5, 'TEXT', t_id);

-- ─── New Hire 10-Day Inquiry ───
t_id := gen_random_uuid()::TEXT;
INSERT INTO public.w_evaluation_template (id, name, description, "isActive", "createdAt", "updatedAt")
VALUES (t_id, 'New Hire 10-Day Inquiry', 'Benefits awareness check and initial experience assessment at 10 days.', true, NOW(), NOW());
INSERT INTO public.w_evaluation_criterion (id, label, "order", "maxScore", type, "templateId") VALUES
  (gen_random_uuid()::TEXT, 'How is everything going so far?', 0, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'How long have you been with the company?', 1, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'What do you enjoy about your position?', 2, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'Health and Dental Insurance — starting Day One of employment.', 3, 5, 'RATING', t_id),
  (gen_random_uuid()::TEXT, '401(k) Retirement Plan — starting Day One of employment.', 4, 5, 'RATING', t_id),
  (gen_random_uuid()::TEXT, 'Employee Assistance Program — starting Day One of employment.', 5, 5, 'RATING', t_id),
  (gen_random_uuid()::TEXT, 'Paid Time Off (PTO) Accrual — starting Day One of employment.', 6, 5, 'RATING', t_id),
  (gen_random_uuid()::TEXT, 'Gym Membership Discount — starting Day One of employment.', 7, 5, 'RATING', t_id),
  (gen_random_uuid()::TEXT, 'State Recreational Discounts — starting Day One of employment.', 8, 5, 'RATING', t_id),
  (gen_random_uuid()::TEXT, 'Mileage Reimbursement — starting after 30 days of employment (see Employee Handbook).', 9, 5, 'RATING', t_id),
  (gen_random_uuid()::TEXT, 'Access to Equipment — starting after 30 days of employment.', 10, 5, 'RATING', t_id),
  (gen_random_uuid()::TEXT, 'Paid Lunch — eligibility after 90 days of employment.', 11, 5, 'RATING', t_id),
  (gen_random_uuid()::TEXT, 'Provide Bianca''s email address for follow-up on the benefits listed above.', 12, 5, 'RATING', t_id);

-- ─── Eval: 30-Day Self-Assessment ───
t_id := gen_random_uuid()::TEXT;
INSERT INTO public.w_evaluation_template (id, name, description, "isActive", "createdAt", "updatedAt")
VALUES (t_id, 'Eval: 30-Day Self-Assessment', 'Self-assessment for employees at the 30-day milestone.', true, NOW(), NOW());
INSERT INTO public.w_evaluation_criterion (id, label, "order", "maxScore", type, "templateId") VALUES
  (gen_random_uuid()::TEXT, 'Describe your primary role and how well you have fulfilled it over the past 30 days. Please provide examples.', 0, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'What do you feel are the strongest areas of your performance?', 1, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'What do you think you need to improve now that you have been in the role for 30 days?', 2, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'What challenges have you encountered so far? Please provide examples.', 3, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'Which aspects of the job are you most excited about? Which are you most concerned about?', 4, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'Do you feel you were supported during your first 30 days at BLH?', 5, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'Do you feel you have the information, tools, and resources needed to do your job successfully?', 6, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'How would you describe your understanding of the deadlines and policies currently in place?', 7, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'If applicable, are you comfortable conducting POC visits and developing a POS independently?', 8, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'What specific, measurable goals do you plan to accomplish during the next six months?', 9, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'Are there additional skills or knowledge that would help you perform your current role more effectively?', 10, 5, 'TEXT', t_id);

-- ─── Eval: 90-Day Self-Assessment ───
t_id := gen_random_uuid()::TEXT;
INSERT INTO public.w_evaluation_template (id, name, description, "isActive", "createdAt", "updatedAt")
VALUES (t_id, 'Eval: 90-Day Self-Assessment', 'Comprehensive self-assessment for employees at the 90-day milestone.', true, NOW(), NOW());
INSERT INTO public.w_evaluation_criterion (id, label, "order", "maxScore", type, "templateId") VALUES
  (gen_random_uuid()::TEXT, 'Did the orientation and new-hire training prepare you to be successful in your current role?', 0, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'Do you feel positively challenged and engaged in your job?', 1, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'Do you have any expertise or experience that you think could be better utilized?', 2, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'Do you have the resources needed to perform your responsibilities more than adequately?', 3, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'Does your manager or supervisor provide regular and effective feedback that helps you improve your performance?', 4, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'Have you found communicating with your team supervisor to be a straightforward and productive process?', 5, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'Have there been any roadblocks or challenges in performing your duties? If so, what were they?', 6, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'How would you rate your overall performance, and why? (1 = lowest, 5 = highest)', 7, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'What are some of your strengths and areas for development?', 8, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'What are your goals and objectives for the next evaluation period?', 9, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'What future training would you be interested in?', 10, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'What billing technique do you use, if any?', 11, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'Do you understand the expectations of your job?', 12, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'Are there additional skills or knowledge that would help you perform your current role more effectively?', 13, 5, 'TEXT', t_id);

-- ─── Eval: 6-Month Self-Assessment ───
t_id := gen_random_uuid()::TEXT;
INSERT INTO public.w_evaluation_template (id, name, description, "isActive", "createdAt", "updatedAt")
VALUES (t_id, 'Eval: 6-Month Self-Assessment', 'Mid-year self-assessment evaluating progress, goals, and manager support.', true, NOW(), NOW());
INSERT INTO public.w_evaluation_criterion (id, label, "order", "maxScore", type, "templateId") VALUES
  (gen_random_uuid()::TEXT, 'How well have you achieved the goals you set during your 90-day evaluation?', 0, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'What do you enjoy most about your work?', 1, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'What do you enjoy most about being part of BLH?', 2, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'What is one recent project to which you have made significant contributions, and how did you contribute?', 3, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'Do you feel comfortable taking risks and approaching your manager with new ideas? Why or why not?', 4, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'How has your manager helped you achieve your goals over the past few months?', 5, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'Looking back, how has your manager helped you improve and do your best work? Please share one or two examples.', 6, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'In what ways can your manager better support and challenge you?', 7, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'What are your top three priorities for the next six months?', 8, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'What are your personal development goals (e.g., new skills, knowledge, or work experience you would like to acquire)?', 9, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'What future training would benefit you in reaching your goals?', 10, 5, 'TEXT', t_id);

-- ─── 1-Year Check-In ───
t_id := gen_random_uuid()::TEXT;
INSERT INTO public.w_evaluation_template (id, name, description, "isActive", "createdAt", "updatedAt")
VALUES (t_id, '1-Year Check-In', 'Annual check-in to assess experience, challenges, and support needs.', true, NOW(), NOW());
INSERT INTO public.w_evaluation_criterion (id, label, "order", "maxScore", type, "templateId") VALUES
  (gen_random_uuid()::TEXT, 'Tell me about your experience here at BLH.', 0, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'Do you feel you are able to be productive and effective in your position?', 1, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'How are you managing the deadlines and goals expected of your position?', 2, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'Can you identify some challenges you have faced so far?', 3, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'What are some issues you have identified, and how can you be part of the solution?', 4, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'How can we better support your work?', 5, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'What resources would help you succeed in your role?', 6, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'Would you say that your supervisor is supportive?', 7, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'Are there additional skills or knowledge that would help you perform your current role more effectively?', 8, 5, 'TEXT', t_id);

-- ─── Annual Self-Assessment ───
t_id := gen_random_uuid()::TEXT;
INSERT INTO public.w_evaluation_template (id, name, description, "isActive", "createdAt", "updatedAt")
VALUES (t_id, 'Annual Self-Assessment', 'End-of-year self-review covering career growth, goals, vision alignment, and mentorship.', true, NOW(), NOW());
INSERT INTO public.w_evaluation_criterion (id, label, "order", "maxScore", type, "templateId") VALUES
  (gen_random_uuid()::TEXT, 'How do you feel about your progress to date? Are you where you thought you would be?', 0, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'How have your responsibilities changed and evolved over the past year compared to a year ago?', 1, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'Please explain what you believe the company''s goals, vision, and strategy are.', 2, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'Please describe your role within the company''s overall goals, vision, and strategy.', 3, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'If given the opportunity, what would you want your next role at this company to be? How would your responsibilities change?', 4, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'How could your job be done differently?', 5, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'What professional growth opportunities would you like to explore to get there?', 6, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'Given your strengths and talents, how do you think you could use them to serve or help others?', 7, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'What skills do you have that you believe we could use more effectively?', 8, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'At what point in your career were you most challenged? What circumstances were at play, and how did you handle them?', 9, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'Who is your mentor — the person who pushes you to be more, learn more, accomplish more, and grow?', 10, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'Do you have any questions related to your work here and your future goals at the company?', 11, 5, 'TEXT', t_id);

-- ─── Annual Competency Review ───
t_id := gen_random_uuid()::TEXT;
INSERT INTO public.w_evaluation_template (id, name, description, "isActive", "createdAt", "updatedAt")
VALUES (t_id, 'Annual Competency Review', 'Supervisor-led annual review of competency, alignment with company mission, and career direction.', true, NOW(), NOW());
INSERT INTO public.w_evaluation_criterion (id, label, "order", "maxScore", type, "templateId") VALUES
  (gen_random_uuid()::TEXT, 'Are you satisfied with the progress you have made to date? Are you where you thought you would be?', 0, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'How have your responsibilities changed and evolved this year compared to a year ago? What are you most proud of?', 1, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'Please explain your understanding of the company''s mission statement, vision, and strategy.', 2, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'Please describe how your role aligns with the company''s overall goals, vision, and strategy.', 3, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'If you had your choice, what would you like to do next at this company? How would your responsibilities change?', 4, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'In what ways could your job be accomplished differently?', 5, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'Given your skills and abilities, how could you best use them to serve or benefit others?', 6, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'What specialized skills do you have that could be utilized more?', 7, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'In your career, when have you been most challenged? What were the circumstances, and how did you respond?', 8, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'Who is your mentor — the person who pushes you to be more, learn more, accomplish more, take on more, and grow?', 9, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'Do you have any questions regarding your role and your career goals at the company?', 10, 5, 'YES_NO', t_id);

-- ─── Communication ───
t_id := gen_random_uuid()::TEXT;
INSERT INTO public.w_evaluation_template (id, name, description, "isActive", "createdAt", "updatedAt")
VALUES (t_id, 'Communication', 'Evaluates verbal and written communication with peers, staff, and leadership.', true, NOW(), NOW());
INSERT INTO public.w_evaluation_criterion (id, label, "order", "maxScore", type, "templateId") VALUES
  (gen_random_uuid()::TEXT, 'Effectively communicates expectations.', 0, 5, 'RATING', t_id),
  (gen_random_uuid()::TEXT, 'Effectively communicates upward, downward, and laterally.', 1, 5, 'RATING', t_id),
  (gen_random_uuid()::TEXT, 'Communicates well with peers.', 2, 5, 'YES_NO', t_id);

-- ─── Teamwork ───
t_id := gen_random_uuid()::TEXT;
INSERT INTO public.w_evaluation_template (id, name, description, "isActive", "createdAt", "updatedAt")
VALUES (t_id, 'Teamwork', 'Assesses collaboration, helpfulness, and team orientation.', true, NOW(), NOW());
INSERT INTO public.w_evaluation_criterion (id, label, "order", "maxScore", type, "templateId") VALUES
  (gen_random_uuid()::TEXT, 'Works well in a team environment.', 0, 5, 'RATING', t_id),
  (gen_random_uuid()::TEXT, 'Works with and helps others accomplish their goals.', 1, 5, 'RATING', t_id),
  (gen_random_uuid()::TEXT, 'Do you feel that you and your team work well together? If not, what problems are you experiencing?', 2, 5, 'COMMENT', t_id);

-- ─── Self-Development ───
t_id := gen_random_uuid()::TEXT;
INSERT INTO public.w_evaluation_template (id, name, description, "isActive", "createdAt", "updatedAt")
VALUES (t_id, 'Self-Development', 'Evaluates willingness to learn, goal-setting, and areas of growth.', true, NOW(), NOW());
INSERT INTO public.w_evaluation_criterion (id, label, "order", "maxScore", type, "templateId") VALUES
  (gen_random_uuid()::TEXT, 'Is always willing to learn new skills.', 0, 5, 'YES_NO', t_id),
  (gen_random_uuid()::TEXT, 'Where did this individual perform well?', 1, 5, 'COMMENT', t_id),
  (gen_random_uuid()::TEXT, 'What are the areas for growth for this individual?', 2, 5, 'COMMENT', t_id),
  (gen_random_uuid()::TEXT, 'What are you hoping to accomplish over the next quarter, six months, and year?', 3, 5, 'COMMENT', t_id),
  (gen_random_uuid()::TEXT, 'What are your biggest challenges?', 4, 5, 'COMMENT', t_id),
  (gen_random_uuid()::TEXT, 'Do you feel you were supported during your first 30 days at BLH?', 5, 5, 'COMMENT', t_id),
  (gen_random_uuid()::TEXT, 'What specific, measurable goals do you plan to accomplish during the next six months?', 6, 5, 'COMMENT', t_id);

-- ─── Growth Competency ───
t_id := gen_random_uuid()::TEXT;
INSERT INTO public.w_evaluation_template (id, name, description, "isActive", "createdAt", "updatedAt")
VALUES (t_id, 'Growth Competency', 'Comprehensive growth review covering accomplishments, obstacles, career objectives, recognition preferences, and development goals.', true, NOW(), NOW());
INSERT INTO public.w_evaluation_criterion (id, label, "order", "maxScore", type, "templateId") VALUES
  (gen_random_uuid()::TEXT, 'What do you consider your major on-the-job accomplishments since your last review?', 0, 5, 'COMMENT', t_id),
  (gen_random_uuid()::TEXT, 'List your areas of strength and areas needing improvement.', 1, 5, 'COMMENT', t_id),
  (gen_random_uuid()::TEXT, 'What are the ideal working conditions for you to be most productive?', 2, 5, 'COMMENT', t_id),
  (gen_random_uuid()::TEXT, 'What are your biggest obstacles to getting your work done?', 3, 5, 'COMMENT', t_id),
  (gen_random_uuid()::TEXT, 'What changes could be made to improve your effectiveness?', 4, 5, 'COMMENT', t_id),
  (gen_random_uuid()::TEXT, 'What motivates you to get your job done?', 5, 5, 'COMMENT', t_id),
  (gen_random_uuid()::TEXT, 'How and when do you do your best work?', 6, 5, 'COMMENT', t_id),
  (gen_random_uuid()::TEXT, 'What do you appreciate most about the workplace?', 7, 5, 'COMMENT', t_id),
  (gen_random_uuid()::TEXT, 'What do you like most about working for this company?', 8, 5, 'COMMENT', t_id),
  (gen_random_uuid()::TEXT, 'Which job responsibilities or tasks do you enjoy most? Which do you enjoy least?', 9, 5, 'COMMENT', t_id),
  (gen_random_uuid()::TEXT, 'How can you bring added value to this organization?', 10, 5, 'COMMENT', t_id),
  (gen_random_uuid()::TEXT, 'What do you think the goals of the company are? What do you think the goals of your team are?', 11, 5, 'COMMENT', t_id),
  (gen_random_uuid()::TEXT, 'How would you assess communication within your agency? How well informed are you of the information you need?', 12, 5, 'COMMENT', t_id),
  (gen_random_uuid()::TEXT, 'Are you comfortable with the corporate culture, and are there areas that need improvement?', 13, 5, 'COMMENT', t_id),
  (gen_random_uuid()::TEXT, 'Do you have access to all the tools and resources you need to do your job? If not, what is missing?', 14, 5, 'COMMENT', t_id),
  (gen_random_uuid()::TEXT, 'What can I do to make your job more enjoyable?', 15, 5, 'COMMENT', t_id),
  (gen_random_uuid()::TEXT, 'What can you, your supervisor, or the agency do to improve your performance and increase your overall satisfaction?', 16, 5, 'COMMENT', t_id),
  (gen_random_uuid()::TEXT, 'What are your long-range career objectives, and what are your plans to accomplish them? Or would you like help setting these?', 17, 5, 'COMMENT', t_id),
  (gen_random_uuid()::TEXT, 'What goals would you like to work toward between now and the next performance evaluation?', 18, 5, 'COMMENT', t_id),
  (gen_random_uuid()::TEXT, 'How will you measure progress toward these goals?', 19, 5, 'COMMENT', t_id),
  (gen_random_uuid()::TEXT, 'What kinds of professional development or training opportunities interest you most?', 20, 5, 'COMMENT', t_id),
  (gen_random_uuid()::TEXT, 'What skills or new knowledge would you like to develop to improve your performance?', 21, 5, 'COMMENT', t_id),
  (gen_random_uuid()::TEXT, 'What tools or technology would make your job easier?', 22, 5, 'COMMENT', t_id),
  (gen_random_uuid()::TEXT, 'What type of career growth is most important to you (e.g., additional responsibility, leading a team, salary advancement, new skills)?', 23, 5, 'COMMENT', t_id),
  (gen_random_uuid()::TEXT, 'Do you prefer private or public recognition?', 24, 5, 'COMMENT', t_id),
  (gen_random_uuid()::TEXT, 'Do you prefer recognition from your peers, your supervisor, or senior leadership?', 25, 5, 'COMMENT', t_id),
  (gen_random_uuid()::TEXT, 'Which types of recognition are most meaningful to you? Which are least meaningful?', 26, 5, 'COMMENT', t_id),
  (gen_random_uuid()::TEXT, 'Do you have any questions related to your work here and your future goals at the company?', 27, 5, 'COMMENT', t_id);

-- ─── Staff Performance Rating ───
t_id := gen_random_uuid()::TEXT;
INSERT INTO public.w_evaluation_template (id, name, description, "isActive", "createdAt", "updatedAt")
VALUES (t_id, 'Staff Performance Rating', 'Formal supervisor evaluation covering communication, customer service, quality of work, work habits, and goal setting.', true, NOW(), NOW());
INSERT INTO public.w_evaluation_criterion (id, label, "order", "maxScore", type, "templateId") VALUES
  (gen_random_uuid()::TEXT, 'Accomplishment #1 the staff member achieved during this evaluation period:', 0, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'Accomplishment #2 the staff member achieved during this evaluation period:', 1, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'Accomplishment #3 the staff member achieved during this evaluation period:', 2, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'Communication — Communicates well with clients, staff, and outside constituencies; listens effectively and responds appropriately.', 3, 5, 'RATING', t_id),
  (gen_random_uuid()::TEXT, 'Communication — Produces written documents that are clear and concise.', 4, 5, 'RATING', t_id),
  (gen_random_uuid()::TEXT, 'Communication — Works well with other team members; willingly shares ideas and is able to collaborate constructively.', 5, 5, 'RATING', t_id),
  (gen_random_uuid()::TEXT, 'Communication — Explanation and Recommendation (required for ratings of 1, 2, or 5):', 6, 5, 'COMMENT', t_id),
  (gen_random_uuid()::TEXT, 'Customer Service — Demonstrates flexibility with clients and other staff by considering alternative approaches and solutions.', 7, 5, 'RATING', t_id),
  (gen_random_uuid()::TEXT, 'Customer Service — Displays a positive attitude in dealings with clients.', 8, 5, 'RATING', t_id),
  (gen_random_uuid()::TEXT, 'Customer Service — Handles all client-relations issues in a timely manner.', 9, 5, 'RATING', t_id),
  (gen_random_uuid()::TEXT, 'Customer Service — Explanation and Recommendation (required for ratings of 1, 2, or 5):', 10, 5, 'COMMENT', t_id),
  (gen_random_uuid()::TEXT, 'Quality/Quantity of Work — Completes all projects on time and accurately.', 11, 5, 'RATING', t_id),
  (gen_random_uuid()::TEXT, 'Quality/Quantity of Work — Consistently completes work in a timely manner that is accurate, thorough, and well-organized.', 12, 5, 'RATING', t_id),
  (gen_random_uuid()::TEXT, 'Quality/Quantity of Work — Has mastered BLH''s tracking system.', 13, 5, 'RATING', t_id),
  (gen_random_uuid()::TEXT, 'Quality/Quantity of Work — Possesses the skills necessary to meet the expectations of the position.', 14, 5, 'RATING', t_id),
  (gen_random_uuid()::TEXT, 'Quality/Quantity of Work — Explanation and Recommendation (required for ratings of 1, 2, or 5):', 15, 5, 'COMMENT', t_id),
  (gen_random_uuid()::TEXT, 'Work Habits — Accepts additional responsibility when asked.', 16, 5, 'RATING', t_id),
  (gen_random_uuid()::TEXT, 'Work Habits — Benchmarks and implements best practices.', 17, 5, 'RATING', t_id),
  (gen_random_uuid()::TEXT, 'Work Habits — Consistently exercises good judgment in analyzing work situations and draws sound conclusions.', 18, 5, 'RATING', t_id),
  (gen_random_uuid()::TEXT, 'Work Habits — Effectively plans and organizes assigned work so it is completed without excessive instruction or follow-up.', 19, 5, 'RATING', t_id),
  (gen_random_uuid()::TEXT, 'Work Habits — Formulates alternative solutions to problems.', 20, 5, 'RATING', t_id),
  (gen_random_uuid()::TEXT, 'Work Habits — Is committed to completing tasks by set deadlines; makes effort to overcome obstacles.', 21, 5, 'RATING', t_id),
  (gen_random_uuid()::TEXT, 'Work Habits — Is resourceful and seeks new ways to accomplish tasks.', 22, 5, 'RATING', t_id),
  (gen_random_uuid()::TEXT, 'Work Habits — Is willing to ask questions when not fully understanding the work to be done.', 23, 5, 'RATING', t_id),
  (gen_random_uuid()::TEXT, 'Work Habits — Takes initiative to learn new skills.', 24, 5, 'RATING', t_id),
  (gen_random_uuid()::TEXT, 'Work Habits — Willingly adapts to new or changed situations.', 25, 5, 'RATING', t_id),
  (gen_random_uuid()::TEXT, 'Work Habits — Explanation and Recommendation (required for ratings of 1, 2, or 5):', 26, 5, 'COMMENT', t_id),
  (gen_random_uuid()::TEXT, 'Indicate Overall Performance Rating (1 = Unsatisfactory, 2 = Needs Development, 3 = Meets Expectations, 4 = Exceeds Expectations, 5 = Outstanding):', 27, 5, 'RATING', t_id),
  (gen_random_uuid()::TEXT, 'Goal #1 for the Upcoming Year:', 28, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'Goal #2 for the Upcoming Year:', 29, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'Goal #3 for the Upcoming Year:', 30, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'Goal #4 for the Upcoming Year:', 31, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'Final Probation Determination (Continue Probation / Passed Probation / Not Applicable):', 32, 5, 'TEXT', t_id),
  (gen_random_uuid()::TEXT, 'Detailed Supervisor Comments:', 33, 5, 'COMMENT', t_id);

-- ─── Technical ───
t_id := gen_random_uuid()::TEXT;
INSERT INTO public.w_evaluation_template (id, name, description, "isActive", "createdAt", "updatedAt")
VALUES (t_id, 'Technical', 'Technical competency questions for field-specific role requirements.', true, NOW(), NOW());
INSERT INTO public.w_evaluation_criterion (id, label, "order", "maxScore", type, "templateId") VALUES
  (gen_random_uuid()::TEXT, 'If applicable, are you comfortable conducting POC visits and developing a POS independently?', 0, 5, 'COMMENT', t_id),
  (gen_random_uuid()::TEXT, 'Which aspects of the job are you most excited about? Which are you most concerned about?', 1, 5, 'COMMENT', t_id);

-- ─── Job Knowledge ───
t_id := gen_random_uuid()::TEXT;
INSERT INTO public.w_evaluation_template (id, name, description, "isActive", "createdAt", "updatedAt")
VALUES (t_id, 'Job Knowledge', 'Assesses understanding of deadlines, policies, and role requirements.', true, NOW(), NOW());
INSERT INTO public.w_evaluation_criterion (id, label, "order", "maxScore", type, "templateId") VALUES
  (gen_random_uuid()::TEXT, 'How would you describe your understanding of the deadlines and policies currently in place?', 0, 5, 'COMMENT', t_id);

END $$;
