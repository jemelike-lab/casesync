// lib/pilot-tasks.ts
// Pilot checklist task registry (Option A \u201cPilot HQ card\u201d, approved 2026-07-13).
// task keys are STABLE identifiers persisted in pilot_checklist_progress \u2014
// never rename a key once shipped; add new keys instead.

export interface PilotTask {
  key: string
  t: string
  s?: string
}

export interface PilotGroup {
  name: string
  color: string
  icon: string
  managerOnly?: boolean
  tasks: PilotTask[]
}

export const PILOT_GROUPS: PilotGroup[] = [
  {
    name: 'Verify your caseload',
    color: 'linear-gradient(135deg,#1E7CFF,#1A6FEB)',
    icon: '1',
    tasks: [
      { key: 'verify.roster', t: 'Open Clients \u2192 My Caseload. Is every client of yours here \u2014 and no one who isn\u2019t?', s: 'Missing or extra clients are the single most important thing to catch this week.' },
      { key: 'verify.fields5', t: 'Pick 5 clients and check every field against your own records', s: 'Client ID, eligibility code and end date, program (CFC vs CO).' },
      { key: 'verify.dates5', t: 'Check the dates that drive your work on those 5', s: '3-month visit, waiver, med-tech redet, POS deadline, assessment due, last contact.' },
      { key: 'verify.notes3', t: 'Open Notes on 3 clients \u2014 did your notes and contact attempts come through?' },
    ],
  },
  {
    name: 'Work your week in CaseSync',
    color: 'linear-gradient(135deg,#F97316,#EA580C)',
    icon: '2',
    tasks: [
      { key: 'live.contact', t: 'Log a real contact right after you make one' },
      { key: 'live.deadline', t: 'Update a deadline after a visit' },
      { key: 'live.note', t: 'Add a note to a client record' },
      { key: 'live.search10', t: 'Find a client by name using search \u2014 under 10 seconds?' },
      { key: 'live.calendar', t: 'Check tomorrow\u2019s deadlines on Calendar before you sign off' },
      { key: 'live.left_app', t: 'Anything you had to leave CaseSync to do?', s: 'Excel, email, paper, a coworker\u2019s memory \u2014 tell us. This is the most valuable feedback you can give.' },
    ],
  },
  {
    name: 'Meet Casey',
    color: 'linear-gradient(135deg,#7C3AED,#6D28D9)',
    icon: '3',
    tasks: [
      { key: 'casey.ask', t: 'Ask Casey something you\u2019d normally ask your supervisor' },
      { key: 'casey.briefing', t: 'Read your daily briefing \u2014 does it match what you already knew was urgent?' },
    ],
  },
  {
    name: 'Tell us everything',
    color: 'linear-gradient(135deg,#0D9488,#0F766E)',
    icon: '4',
    tasks: [
      { key: 'tell.bug', t: 'File at least one bug with the blue Feedback tab' },
      { key: 'tell.suggestion', t: 'File at least one suggestion \u2014 big or small' },
      { key: 'tell.rls', t: 'If you ever see a client who isn\u2019t yours, report it immediately', s: 'Even once. That one outranks everything else on this list.' },
    ],
  },
  {
    name: 'See your team from above',
    color: 'linear-gradient(135deg,#4F46E5,#4338CA)',
    icon: '5',
    managerOnly: true,
    tasks: [
      { key: 'team.numbers', t: 'Open the Team and Supervisor views. Do the numbers match what you already know about your people?' },
      { key: 'team.drilldown', t: 'Click into a count and drill down. Is that the right list of clients?' },
      { key: 'team.nocontact', t: 'Check the no-contact queue. Is that actually who has gone quiet?', s: 'A queue you cannot trust is worse than no queue.' },
      { key: 'team.monday', t: 'Could you run your Monday morning from this instead of your spreadsheet?', s: 'If not, tell us exactly what is missing.' },
      { key: 'team.blindspots', t: 'What can you NOT see here that you need to see? Flag it.' },
    ],
  },
]

export const PILOT_TASK_KEYS = new Set(PILOT_GROUPS.flatMap(g => g.tasks.map(t => t.key)))
export const PILOT_TOTAL_TASKS = PILOT_GROUPS.reduce((n, g) => n + g.tasks.length, 0)
