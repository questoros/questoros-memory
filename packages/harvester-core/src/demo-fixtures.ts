/**
 * Synthetic / anonymized real-estate organizational-intelligence demo fixtures.
 * No live customer data.
 */

export const HARBORVIEW_PROPERTY_CSV = `property_id,name,address,status,target_occupancy,asset_manager
HV-1001,Harborview Tower,"100 Pier Street, Bay City",ACTIVE,2026-08-20,Alex Rivera
HV-1002,Cedar Court Annex,"14 Maple Lane, Bay City",PIPELINE,2027-01-15,Alex Rivera
`;

export const HARBORVIEW_PROJECT_BRIEF = `
Harborview Tower — Project Brief (synthetic)

Harborview Tower is the active property for Q3 closing readiness.
Budget: $2.4M tenant-improvement envelope.
The buyer committed to a 36-month master lease with early access in September.
Closing deadline is currently listed as July 15, 2026 in the legacy CRM export.
Operating constraint: no paid advertising for this asset class.
We still need the fire-safety certificate before handover.
Reusable template: tenant onboarding checklist v3.
Private: my personal commission split is 60/40 — do not share.
`.trim();

export const HARBORVIEW_MEETING_TRANSCRIPT = `
Weekly ops standup — Harborview (anonymized)

AM: Harborview remains the priority active project.
Broker: Customer commitment confirmed for the 36-month lease.
PM: Closing moved — finance says August 20, 2026 is the real deadline, not July 15.
Compliance: Missing document is the fire-safety certificate; blockers until received.
Marketing: Reminder — constraint is no paid advertising.
Ops: Please reuse the standard form for tenant onboarding checklists.
`.trim();

export const HARBORVIEW_LEASE_SUMMARY = `
Lease summary (synthetic)

Counterparty: Bay Retail Holdings LLC
Commitment: 36-month master lease with early access window
Security deposit: held in escrow
Special condition: fire-safety certificate required before occupancy
Superseding note: closing date August 20, 2026 replaces the CRM July 15 entry
`.trim();

export const HARBORVIEW_SHARED_TEMPLATE = `
Reusable template: tenant onboarding checklist v3

1. Confirm lease commitment
2. Collect insurance certificates
3. Verify fire-safety certificate
4. Schedule early-access walkthrough
5. Publish Project Intelligence Brief for the Continuity Agent
`.trim();

export const HARBORVIEW_SOURCE_BUNDLE = [
  { locator: 'property-master.csv', text: HARBORVIEW_PROPERTY_CSV },
  { locator: 'project-brief.md', text: HARBORVIEW_PROJECT_BRIEF },
  { locator: 'meeting-transcript.md', text: HARBORVIEW_MEETING_TRANSCRIPT },
  { locator: 'lease-summary.md', text: HARBORVIEW_LEASE_SUMMARY },
  { locator: 'shared-template.md', text: HARBORVIEW_SHARED_TEMPLATE },
] as const;

export function combinedHarborviewCorpus(): string {
  return HARBORVIEW_SOURCE_BUNDLE.map((s) => `--- ${s.locator} ---\n${s.text}`).join('\n\n');
}
