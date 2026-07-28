import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const packageDirectory = path.resolve(currentDirectory, '..');
const publicDirectory = path.join(packageDirectory, 'public');
const outputDirectory = path.join(packageDirectory, 'dist');

await mkdir(outputDirectory, { recursive: true });
for (const fileName of ['index.html', 'styles.css', 'favicon.svg']) {
  await copyFile(path.join(publicDirectory, fileName), path.join(outputDirectory, fileName));
}

const rawApiBaseUrl = process.env.MEMORYOS_PUBLIC_API_BASE_URL?.trim() ?? '';
let apiBaseUrl = '';
if (rawApiBaseUrl) {
  const parsed = new URL(rawApiBaseUrl);
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('MEMORYOS_PUBLIC_API_BASE_URL must be a credential-free HTTP or HTTPS URL.');
  }
  apiBaseUrl = parsed.toString().replace(/\/$/, '');
}

const runtimeConfig = {
  apiBaseUrl,
  productName: 'MemoryOS by QuestorOS',
  statusPageTitle: 'MemoryOS Service Status',
};

await writeFile(
  path.join(outputDirectory, 'config.js'),
  `window.__MEMORYOS_CONFIG__ = Object.freeze(${JSON.stringify(runtimeConfig)});\n`,
  'utf8',
);

process.stdout.write(`MemoryOS portal built at ${outputDirectory}\n`);
