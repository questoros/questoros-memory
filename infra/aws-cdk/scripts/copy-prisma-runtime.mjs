import fs from 'node:fs';
import path from 'node:path';

const [inputDir, outputDir] = process.argv.slice(2);
if (!inputDir || !outputDir) {
  console.error('copy-prisma-runtime requires input and output directories.');
  process.exit(1);
}

const packageSource = path.join(
  inputDir,
  'packages',
  'database',
  'node_modules',
  '@prisma',
  'client',
);
const packageDestination = path.join(
  outputDir,
  'node_modules',
  '@prisma',
  'client',
);

if (!fs.existsSync(packageSource)) {
  console.error('Generated @prisma/client package was not found.');
  process.exit(1);
}

const pnpmStore = path.join(inputDir, 'node_modules', '.pnpm');
if (!fs.existsSync(pnpmStore)) {
  console.error('pnpm store was not found for Prisma packaging.');
  process.exit(1);
}

const generatedCandidates = fs
  .readdirSync(pnpmStore, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name.startsWith('@prisma+client@'))
  .map((entry) =>
    path.join(pnpmStore, entry.name, 'node_modules', '.prisma', 'client'),
  )
  .filter((candidate) => fs.existsSync(candidate));

const generatedSource = generatedCandidates.find((candidate) =>
  fs
    .readdirSync(candidate)
    .some((name) => name.includes('rhel-openssl-3.0.x') && name.endsWith('.node')),
);

if (!generatedSource) {
  console.error('Lambda-compatible Prisma engine rhel-openssl-3.0.x was not generated.');
  process.exit(1);
}

const generatedDestination = path.join(
  outputDir,
  'node_modules',
  '.prisma',
  'client',
);

fs.rmSync(packageDestination, { recursive: true, force: true });
fs.rmSync(generatedDestination, { recursive: true, force: true });
fs.mkdirSync(path.dirname(packageDestination), { recursive: true });
fs.mkdirSync(path.dirname(generatedDestination), { recursive: true });
fs.cpSync(packageSource, packageDestination, {
  recursive: true,
  dereference: true,
});
fs.cpSync(generatedSource, generatedDestination, {
  recursive: true,
  dereference: true,
});

console.log('Prisma Lambda runtime copied with rhel-openssl-3.0.x engine.');
