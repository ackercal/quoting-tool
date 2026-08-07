// ─────────────────────────────────────────────────────────────────────────────
// Release history for the Machina Quote Tool.
//
// Add a new entry at the TOP of RELEASES for every deploy. Keep entries newest-
// first. CURRENT_VERSION is derived from the first entry and shown in the sidebar.
//
// change.type controls the colored pill in the UI:
//   'added'   – new capability
//   'changed' – behavior / values updated
//   'fixed'   – bug fix
//   'removed' – capability taken out
// ─────────────────────────────────────────────────────────────────────────────

export type ChangeType = 'added' | 'changed' | 'fixed' | 'removed'

export interface ReleaseChange {
  type: ChangeType
  text: string
}

export interface Release {
  version: string
  date: string // ISO YYYY-MM-DD
  title: string
  summary?: string
  changes: ReleaseChange[]
}

export const RELEASES: Release[] = [
  {
    version: '1.8.3',
    date: '2026-08-07',
    title: 'Rate update & projection years',
    changes: [
      { type: 'changed', text: 'Updated robot hourly rates: Small $10.95, Medium $13.69, Large $18.24.' },
      { type: 'changed', text: 'Projection years are now 2026 / 2028 / 2030 (was 2026 / 2027 / 2028) — the same assumptions, spread further out. Existing projects were remapped automatically (2027→2028, 2028→2030); quote numbers are unchanged.' },
      { type: 'changed', text: 'Updated Formed Parts labor assumptions: 0.5 Tech hrs retained at the 2030 tier across all operations; Unistrut 2030 → 0.5 hrs; Purchaser/PM setup now taper by year (2 / 1 / 0.5).' },
      { type: 'changed', text: 'Updated Custom Auto labor assumptions: 0.5 Tech hrs at the 2030 tier (0.25 for duplicate scanning); Unistrut now tapers 6 / 2 / 0.5; Purchaser/PM setup taper 2 / 1 / 0.5.' },
    ],
  },
  {
    version: '1.8.2',
    date: '2026-08-05',
    title: 'Easier owner picking & sign-in speedup',
    changes: [
      { type: 'changed', text: 'Setting a project’s owner is now a dropdown of people who’ve used the app — or enter any email and the name is filled in automatically.' },
      { type: 'fixed', text: 'Fixed the app hanging on “Signing in…” — sign-in is fast again.' },
    ],
  },
  {
    version: '1.8.1',
    date: '2026-08-05',
    title: 'Owner editing, tab logo & brand polish',
    changes: [
      { type: 'added', text: 'Set a project’s owner and “who can see it” right from the project card’s ⋮ menu (admins).' },
      { type: 'added', text: 'The Machina logo now appears as the browser-tab icon.' },
      { type: 'fixed', text: 'Aligned the new Release Notes / profile / admin accents to the Machina brand orange.' },
    ],
  },
  {
    version: '1.8.0',
    date: '2026-08-05',
    title: 'User accounts, authorship & admin',
    summary: 'The tool now knows who you are, tracks project authorship, and adds an admin area.',
    changes: [
      { type: 'added', text: 'Sign-in identity: a profile button (bottom-left) shows who you are and your permission level, and lets you log out.' },
      { type: 'added', text: 'Every project now has an author, shown on its home-screen card.' },
      { type: 'added', text: 'Admin mode (toggle in your profile) with an Admin area listing everyone who has used the app and when they were last active.' },
      { type: 'added', text: 'Admins can set each person’s project access and edit a project’s author and “who can see it” tag (everyone is “All” for now).' },
      { type: 'changed', text: '“What’s new” alerts are now per person — once you dismiss an update it stays dismissed for you across devices.' },
    ],
  },
  {
    version: '1.7.0',
    date: '2026-08-05',
    title: 'Release notes & version history',
    summary: 'Introduced this update log so changes to the tool are visible in-app.',
    changes: [
      { type: 'added', text: 'New "Release Notes" tab tracking every version and what it included.' },
      { type: 'added', text: 'Backfilled the full update history from the tool’s first release.' },
    ],
  },
  {
    version: '1.6.0',
    date: '2026-08-04',
    title: 'Updated robot rates',
    summary: 'New robot cell hourly costs and cleanup of the experimental robot type.',
    changes: [
      { type: 'changed', text: 'Robot hourly rates updated: Small (KR500, M900) $10.77, Medium (KR1500, M1000) $13.51, Large (M2000) $18.06.' },
      { type: 'removed', text: 'Retired the experimental KR1500 robot type — KR1500 now falls under Medium at the same rate. Existing parts set to KR1500 were moved to Medium automatically.' },
    ],
  },
  {
    version: '1.5.0',
    date: '2026-07-31',
    title: 'KR1500 robot type (experimental)',
    summary: 'Added a fourth robot cell option for testing (later folded into Medium in 1.6.0).',
    changes: [
      { type: 'added', text: 'Added KR1500 as a selectable robot type, listed as "Testing Only" while its rate was being validated.' },
    ],
  },
  {
    version: '1.4.0',
    date: '2026-05-14',
    title: 'Estimation Context: specialty materials',
    summary: 'Reference pricing to help estimate quotes for less common materials.',
    changes: [
      { type: 'added', text: 'Added previous specialty-material quotes to the Estimation Context tab.' },
      { type: 'added', text: 'Added 6061-O aluminum reference quotes.' },
      { type: 'changed', text: 'Updated the specialty-materials table columns for clarity.' },
    ],
  },
  {
    version: '1.3.0',
    date: '2026-05-13',
    title: 'Custom robot cost & project management',
    changes: [
      { type: 'added', text: 'Added "Custom Cost — R&D" robot type with a per-part hourly rate override.' },
      { type: 'added', text: 'Added a project menu on the home page to duplicate or delete projects.' },
    ],
  },
  {
    version: '1.2.2',
    date: '2026-04-30',
    title: 'Breakdown fix',
    changes: [
      { type: 'fixed', text: 'Detailed breakdown was missing the RPE/ME lines for scan operations.' },
    ],
  },
  {
    version: '1.2.1',
    date: '2026-04-29',
    title: 'Finalized labor constants',
    changes: [
      { type: 'changed', text: 'Updated labor constants to the final values from the source spreadsheet.' },
      { type: 'changed', text: 'Custom Auto labor tweaks (duplicate forming ME and duplicate cut RPE).' },
      { type: 'fixed', text: 'Fixed a parts-per-sheet material cost bug.' },
      { type: 'fixed', text: 'Labor and robot cost now zero out for any operation whose hours input is 0.' },
    ],
  },
  {
    version: '1.2.0',
    date: '2026-04-28',
    title: 'Labor models & richer breakdowns',
    summary: 'Introduced the two labor models and reorganized the constants view.',
    changes: [
      { type: 'added', text: 'Added Formed Parts and Custom Auto labor-constant sets, selectable per project.' },
      { type: 'added', text: 'Expanded the per-part cost breakdown into line-item detail.' },
      { type: 'changed', text: 'Reorganized the Process Constants page.' },
      { type: 'changed', text: 'Rewrote the "How Quoting Works" Read Me with new sections.' },
      { type: 'fixed', text: 'Fixed duplicate-scan logic and reduced exported PDF size.' },
    ],
  },
  {
    version: '1.1.0',
    date: '2026-04-23',
    title: 'Non-roboformed parts',
    changes: [
      { type: 'added', text: 'Added non-roboformed manufacturing methods with a first/duplicate cost split and a segmented method toggle.' },
      { type: 'added', text: 'Added a Non-Roboformed category to the cost breakdown.' },
    ],
  },
  {
    version: '1.0.0',
    date: '2026-04-21',
    title: 'Initial release',
    summary: 'First version of the quoting calculator.',
    changes: [
      { type: 'added', text: 'Core quoting engine: Project → Part → Procedure → Operation with a first-part (NRE) vs duplicate (production) cost split.' },
      { type: 'added', text: 'Category cost breakdown and PDF quote export with category pricing.' },
      { type: 'added', text: 'Cloud deployment so the tool is accessible to the team.' },
    ],
  },
]

export const CURRENT_VERSION = RELEASES[0].version
