import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const infraRoot = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(infraRoot, '..', '..');
const databaseRoot = path.join(repoRoot, 'packages', 'database');
const schemaPath = path.join(databaseRoot, 'prisma', 'schema.prisma');
const generatedDir = path.join(databaseRoot, 'prisma', '.generated');
const generatedSchemaPath = path.join(generatedDir, 'schema.lambda.prisma');

const source = fs.readFileSync(schemaPath, 'utf8');
const generatorPattern = /generator client \{\s*provider\s*=\s*"prisma-client-js"\s*\}/m;
if (!generatorPattern.test(source)) {
  console.error('Prisma client generator block was not found.');
  process.exit(1);
}

const lambdaSchema = source.replace(
  generatorPattern,
  'generator client {\n  provider      = "prisma-client-js"\n  binaryTargets = ["native", "rhel-openssl-3.0.x"]\n}',
);

fs.rmSync(generatedDir, { recursive: true, force: true });
fs.mkdirSync(generatedDir, { recursive: true });
fs.writeFileSync(generatedSchemaPath, lambdaSchema, 'utf8');

const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const result = spawnSync(
  command,
  ['exec', 'prisma', 'generate', '--schema', generatedSchemaPath],
  {
    cwd: databaseRoot,
    env: process.env,
    encoding: 'utf8',
    stdio: 'inherit',
    shell: process.platform === 'win32',
  },
);

if (result.error || result.signal || result.status !== 0) {
  console.error('Lambda Prisma generation failed.');
  process.exit(1);
}

console.log('Lambda Prisma client generated for native and rhel-openssl-3.0.x targets.');
