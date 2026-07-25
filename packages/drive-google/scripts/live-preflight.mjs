#!/usr/bin/env node
/**
 * Gated live Google Drive preflight.
 * Do not call from test/build/CI.
 * Requires RUN_LIVE_DRIVE_PREFLIGHT=true and explicit approval.
 */
if (process.env.RUN_LIVE_DRIVE_PREFLIGHT !== 'true') {
  console.error(
    'Live Google Drive preflight is disabled. Set RUN_LIVE_DRIVE_PREFLIGHT=true only after approval.',
  );
  process.exit(1);
}

console.error(
  'Live Google Drive preflight gate passed, but live credentials are not configured in this package yet.',
);
process.exit(1);
