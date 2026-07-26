#!/usr/bin/env node
/**
 * Runs the existing gated Phase 8 remote MCP smoke, captures recent private
 * CloudWatch diagnostics through the user's local AWS CLI, sanitizes output,
 * writes one copyable report, and copies it to the Windows clipboard when
 * clip.exe is available.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REQUIRED_GATE = 'RUN_PHASE8_REMOTE_MCP_DIAGNOSTIC';
const AWS_PROFILE = process.env.AWS_PROFILE?.trim() || 'questoros-memory';
const AWS_REGION = process.env.AWS_REGION?.trim() || 'ap-southeast-1';
const LOG_GROUP = '/questoros-memory/staging/api';
const FUNCTION_NAME = 'questoros-memory-staging-api';
const REPORT_NAME = 'phase8-remote-mcp-diagnostic.txt';

if (process.env[REQUIRED_GATE] !== 'true') {
  console.error(
    `Phase 8 remote MCP diagnostics are blocked. Set ${REQUIRED_GATE}=true only for the approved staging endpoint.`,
  );
  process.exit(1);
}

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const smokeScript = path.join(scriptDirectory, 'phase8-remote-staging-smoke.mjs');
const reportPath = path.resolve(process.cwd(), REPORT_NAME);
const startedAt = Date.now();

function sanitize(value) {
  return String(value ?? '')
    .replace(/qmem_live_[A-Za-z0-9_-]+/g, '[REDACTED_API_KEY]')
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, '[REDACTED_DATABASE_URL]')
    .replace(/DATABASE_URL\s*[=:]\s*[^\s"']+/gi, 'DATABASE_URL=[REDACTED]')
    .replace(/(SecretString|secretString)\s*[=:]\s*[^\r\n]+/g, '$1=[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [REDACTED]');
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? process.env,
    encoding: 'utf8',
    windowsHide: true,
    shell: false,
    timeout: options.timeout ?? 120_000,
  });
  return {
    status: result.status,
    signal: result.signal,
    stdout: sanitize(result.stdout),
    stderr: sanitize(result.stderr),
    error: result.error ? sanitize(result.error.message) : '',
  };
}

function parseSmokeJson(output) {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!line.startsWith('{')) continue;
    try {
      return JSON.parse(line);
    } catch {
      // Keep looking for the final valid JSON line.
    }
  }
  return null;
}

const smokeEnvironment = {
  ...process.env,
  RUN_PHASE8_REMOTE_MCP_SMOKE: 'true',
};
const smoke = run(process.execPath, [smokeScript], {
  cwd: path.resolve(scriptDirectory, '..'),
  env: smokeEnvironment,
  timeout: 90_000,
});
const smokePayload = parseSmokeJson(smoke.stdout);
const requestId =
  smokePayload && typeof smokePayload.requestId === 'string' ? smokePayload.requestId : 'not-found';

const startTime = String(Math.max(0, startedAt - 10 * 60_000));
const awsBase = ['--profile', AWS_PROFILE, '--region', AWS_REGION];

const functionConfiguration = run('aws', [
  ...awsBase,
  'lambda',
  'get-function-configuration',
  '--function-name',
  FUNCTION_NAME,
  '--query',
  '{FunctionName:FunctionName,LastModified:LastModified,Runtime:Runtime,State:State,LastUpdateStatus:LastUpdateStatus,CodeSha256:CodeSha256,Version:Version}',
  '--output',
  'json',
]);

const recentLogs = run('aws', [
  ...awsBase,
  'logs',
  'filter-log-events',
  '--log-group-name',
  LOG_GROUP,
  '--start-time',
  startTime,
  '--limit',
  '500',
  '--query',
  'events[].{timestamp:timestamp,message:message,stream:logStreamName}',
  '--output',
  'json',
]);

const reportSections = [
  '# QuestorOS Memory Phase 8 Remote MCP Diagnostic',
  '',
  `Generated: ${new Date().toISOString()}`,
  `Branch head: ${sanitize(run('git', ['rev-parse', 'HEAD']).stdout.trim())}`,
  `Endpoint: ${sanitize(process.env.QUESTOROS_MEMORY_REMOTE_MCP_URL ?? 'not-set')}`,
  `AWS profile: ${AWS_PROFILE}`,
  `AWS region: ${AWS_REGION}`,
  `Smoke request ID: ${sanitize(requestId)}`,
  `Smoke exit status: ${smoke.status ?? 'null'}`,
  '',
  '## Smoke stdout',
  smoke.stdout || '(empty)',
  '',
  '## Smoke stderr',
  smoke.stderr || '(empty)',
  '',
  '## Lambda function configuration',
  functionConfiguration.stdout ||
    functionConfiguration.stderr ||
    functionConfiguration.error ||
    '(empty)',
  '',
  `## CloudWatch events since ${new Date(Number(startTime)).toISOString()}`,
  recentLogs.stdout || recentLogs.stderr || recentLogs.error || '(empty)',
  '',
  '## Command statuses',
  JSON.stringify(
    {
      smoke: smoke.status,
      functionConfiguration: functionConfiguration.status,
      recentLogs: recentLogs.status,
    },
    null,
    2,
  ),
  '',
];

const report = sanitize(reportSections.join('\n'));
fs.writeFileSync(reportPath, report, 'utf8');

let clipboardCopied = false;
if (process.platform === 'win32') {
  const clipboard = spawnSync('clip.exe', [], {
    input: report,
    encoding: 'utf8',
    windowsHide: true,
  });
  clipboardCopied = clipboard.status === 0;
}

process.stdout.write(
  `${JSON.stringify({
    status: 'complete',
    test: 'phase8-remote-mcp-diagnostic',
    smokePassed: smoke.status === 0,
    requestId,
    reportPath,
    clipboardCopied,
    secretsRedacted: true,
  })}\n`,
);
process.stdout.write(`Copyable diagnostic report: ${reportPath}\n`);
if (clipboardCopied) {
  process.stdout.write('The sanitized report was copied to the Windows clipboard.\n');
}

// Diagnostics are considered complete even when the underlying smoke fails.
// This avoids pnpm hiding the report path behind a recursive-run failure banner.
process.exitCode = 0;
