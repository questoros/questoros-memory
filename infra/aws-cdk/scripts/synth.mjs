import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const infraRoot = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(infraRoot, '..', '..');
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const node = process.execPath;

function run(command, args, cwd, extraEnv = {}, options = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...extraEnv },
    stdio: 'inherit',
    // Windows requires a shell for .cmd launchers such as pnpm.cmd, but using a
    // shell for process.execPath breaks when Node is installed under
    // "C:\\Program Files". Native executables must be spawned directly.
    shell: options.shell ?? false,
  });

  if (result.error || result.signal || result.status !== 0) {
    console.error(`Command failed: ${command} ${args.join(' ')}`);
    process.exit(1);
  }
}

run(pnpm, ['build'], repoRoot, {}, { shell: process.platform === 'win32' });
run(node, [path.join(scriptDir, 'prepare-prisma-runtime.mjs')], infraRoot);

const outDir = path.join(infraRoot, 'cdk.out');
fs.rmSync(outDir, { recursive: true, force: true });
run(node, [path.join(infraRoot, 'dist', 'app.js')], infraRoot, {
  CDK_OUTDIR: outDir,
});
run(node, [path.join(scriptDir, 'verify-assembly.mjs')], infraRoot);

console.log('Phase 6 AWS synthesis completed without deployment.');
