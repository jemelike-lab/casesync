// lib/pilot-email-drafts.ts
// Approved pilot re-engagement drafts (Josh, 2026-07-18) \u2014 final copy,
// keyed by profile UUID. Seeded into the compose modal (editable) and the
// "Schedule pilot emails" batch dialog (sent as approved).
//
// NOTE: progress references ("3 of 15") are frozen at approval time.
// If a member completes tasks before send, re-approve updated copy.

export interface PilotEmailDraft {
  userId: string
  name: string
  subject: string
  body: string
}

export const PILOT_EMAIL_DRAFTS: PilotEmailDraft[] = [
  {
    userId: '247dffc9-08be-4ea1-a64b-8b2e866c3c1e',
    name: 'Clarissa Powell',
    subject: "Your CaseSync pilot: you're leading it (3/15) \u2014 let's finish",
    body: `Hi Clarissa,

First, thank you \u2014 you're the furthest along in the pilot. You're at 3 of 15: you've verified your roster, checked fields and dates on your caseload, and already filed two pieces of feedback. That's exactly what this is for.

Here's what's next. You've finished the \u201cVerify your caseload\u201d section except one task \u2014 open Notes on 3 clients and confirm your notes and contact attempts came through. After that, \u201cWork your week in CaseSync\u201d is the heart of it: log a real contact right after you make one, update a deadline after a visit, add a note, find a client by search, and check tomorrow's deadlines on Calendar. \u201cMeet Casey\u201d and \u201cTell us everything\u201d round out the 15.

We need all five of you at 15/15 for this pilot to give us a real answer on whether we can run the agency on CaseSync \u2014 and you're closest. You're close enough that about 10 minutes a day would finish it this week, and with your caseload we don't want it taking any more than that \u2014 your time matters here. Could you aim to wrap it up this week? Your checklist is on your dashboard (the Pilot HQ card): https://www.blhcasesync.com/dashboard

Thank you,
Josh`,
  },
  {
    userId: '8a6c8b06-d8f3-4976-8c48-24914bb58ee5',
    name: 'Megan Walters',
    subject: "CaseSync pilot: let's get you started \u2014 you're one of five",
    body: `Hi Megan,

Checking in on the CaseSync pilot. We don't see any tasks marked done yet, and it's been about a week since your access opened, so we want to make sure nothing's blocking you.

The whole thing is 15 short tasks, and the first one takes two minutes: open Clients \u2192 My Caseload and confirm every client of yours is there \u2014 and no one who isn't. Missing or extra clients are the single most important thing we need caught this week. From there you'll check a few fields and dates, do some real work in the app, and tell us what feels clunky.

You're one of only five people whose feedback decides whether we roll CaseSync out to the whole agency, so we genuinely need your part to make that call. We also know you're stretched with a full caseload, so the last thing we want is for this to feel like one more big task \u2014 it isn't. Ten minutes a day is genuinely enough to work through it, and we'd rather you go slow than not at all. If anything's in your way \u2014 time, a login issue, an unclear task \u2014 reply and we'll clear it today. Your checklist is on your dashboard (the Pilot HQ card): https://www.blhcasesync.com/dashboard

Thank you,
Josh`,
  },
  {
    userId: '3ba2fc10-572c-4f40-bd0e-a523c00c99bb',
    name: 'Mariama Jalloh',
    subject: 'CaseSync pilot: you set the tone for your team (0/15)',
    body: `Hi Mariama,

Quick one on the CaseSync pilot. You're at 0 of 15, and as the team manager in this group your progress counts twice \u2014 your planners will take their cue from whether you've done it yourself.

Please start with \u201cVerify your caseload\u201d: open Clients \u2192 My Caseload, confirm every client is there and no one who isn't, then check fields and dates on 5 of them. That's the core 15 that everyone completes. Your team-manager view \u2014 the \u201cSee your team from above\u201d section \u2014 stays locked until your planners are added in the next wave, so don't worry about that part yet; focus on the 15.

We need all five of you at 15/15 for the pilot to give us a real answer, and we'd like you leading from the front so you can vouch for it when your planners come on. We know you're busy, so to be clear this is a light lift \u2014 10 minutes a day is enough to work through the 15, and that pace is completely fine. Your time matters, so please don't feel you have to carve out a big block. Can you get started this week? If anything's in your way, just reply. Your checklist is on your dashboard (Pilot HQ card): https://www.blhcasesync.com/dashboard

Thank you,
Josh`,
  },
  {
    userId: 'c2af0564-cea8-4d08-b6f5-6b3eba493f24',
    name: 'Alissa Schaberick',
    subject: 'CaseSync pilot: your caseload verify matters most (0/15)',
    body: `Hi Alissa,

Checking in on the CaseSync pilot. You're at 0 of 15 so far, and honestly yours is the pass we most want to see done \u2014 you have the largest caseload of the group (51 clients) and a set of CO clients that still need confirming.

Please start with \u201cVerify your caseload\u201d:

- Open Clients \u2192 My Caseload and confirm everyone's there \u2014 and no one who isn't.
- Then pick 5 clients and check every field against your records, especially program (CFC vs CO) and eligibility code and end date.

That field check is exactly where your CO clients that need a second look will surface, so your pass does double duty \u2014 you're both testing CaseSync and cleaning up real data at the same time.

We need all five pilot members at 15/15 to know CaseSync is ready for everyone. You've got the biggest caseload of the group, so we especially don't want this eating your time \u2014 even 10 minutes a day is enough to chip through it, and that steady pace is exactly what we're hoping for. Your time matters, so please don't feel you have to set aside a big block. Can you make a start this week? If anything's blocking you, tell us and we'll sort it. Your checklist is on your dashboard (Pilot HQ card): https://www.blhcasesync.com/dashboard

Thank you,
Josh`,
  },
  {
    userId: 'fc4c83f6-bf53-4c31-aba6-495875ece552',
    name: 'Blair Morales',
    subject: "CaseSync pilot: you're at 1/15 \u2014 here's your next step",
    body: `Hi Blair,

Quick check-in on the pilot. You've made a start \u2014 you verified your caseload roster, so you're at 1 of 15. The next two tasks pick up right where you left off in \u201cVerify your caseload\u201d:

- Pick 5 of your clients and check every field against your own records \u2014 Client ID, eligibility code and end date, and program (CFC vs CO).
- Then check the dates that drive your work on those 5 \u2014 3-month visit, waiver, med-tech redet, POS deadline, assessment due, last contact.

That's the most important part of the whole pilot: catching anything missing or wrong in your own caseload while it's easy to fix. From there it's logging live work, meeting Casey, and sending us feedback \u2014 15 tasks in total.

We need you at 15/15 for this to tell us whether CaseSync is ready for everyone. We know your caseload is heavy, so to be clear this isn't a big time sink \u2014 even 10 minutes a day gets you through it, and that steady pace is completely fine with us. Your time matters, so we'd rather you chip at it than block out an afternoon. Can you keep it moving this week? If anything's in your way, just reply. Your checklist is on your dashboard (Pilot HQ card): https://www.blhcasesync.com/dashboard

Thank you,
Josh`,
  },
]

export function getPilotDraft(userId: string): PilotEmailDraft | undefined {
  return PILOT_EMAIL_DRAFTS.find(d => d.userId === userId)
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Plain text (paragraphs on blank lines, "- " bullets) -> branded email HTML
// body content. Wrap the result in baseLayout() from lib/email-templates.
export function textToEmailHtml(text: string): string {
  const P = 'margin:0 0 16px;font-size:14px;line-height:1.65;color:#c9c9d1;'
  const LI = 'margin:0 0 8px;font-size:14px;line-height:1.6;color:#c9c9d1;'
  const blocks = text.replace(/\r\n/g, '\n').split(/\n{2,}/)
  const out: string[] = []
  for (const block of blocks) {
    const lines = block.split('\n')
    const isList = lines.length > 0 && lines.every(l => l.trim().startsWith('- '))
    if (isList) {
      const items = lines
        .map(l => `<li style="${LI}">${linkify(escapeHtml(l.trim().slice(2)))}</li>`)
        .join('')
      out.push(`<ul style="margin:0 0 16px;padding-left:20px;">${items}</ul>`)
    } else {
      out.push(`<p style="${P}">${linkify(escapeHtml(block)).replace(/\n/g, '<br />')}</p>`)
    }
  }
  return out.join('\n')
}

function linkify(escaped: string): string {
  return escaped.replace(
    /(https:\/\/[^\s<]+)/g,
    '<a href="$1" style="color:#8ab4ff;text-decoration:none;">$1</a>'
  )
}
