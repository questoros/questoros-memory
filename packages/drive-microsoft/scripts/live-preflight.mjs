#!/usr/bin/env node
/**
 * Gated live Microsoft Graph (OneDrive / SharePoint) preflight.
 * Do not call from test/build/CI.
 * Requires RUN_LIVE_MICROSOFT_DRIVE_PREFLIGHT=true and explicit approval.
 */
if (process.env.RUN_LIVE_MICROSOFT_DRIVE_PREFLIGHT !== 'true') {
  console.error(
    'Live Microsoft Graph Drive preflight is disabled. Set RUN_LIVE_MICROSOFT_DRIVE_PREFLIGHT=true only after approval.',
  );
  process.exit(1);
}

console.error(
  'Live Microsoft Graph Drive preflight gate passed, but live OAuth credentials are not configured in this package yet.',
);
process.exit(1);
