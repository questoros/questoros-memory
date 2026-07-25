#!/usr/bin/env node
/**
 * Live Bedrock preflight is intentionally gated.
 * Do not call this from test/build/CI. Requires RUN_LIVE_BEDROCK_PREFLIGHT=true
 * and a later explicit approval step.
 */
if (process.env.RUN_LIVE_BEDROCK_PREFLIGHT !== 'true') {
  console.error(
    'Live Bedrock preflight is disabled. Set RUN_LIVE_BEDROCK_PREFLIGHT=true only after approval.',
  );
  process.exit(1);
}

console.error('Live Bedrock preflight is not implemented in this freeze step.');
process.exit(1);
