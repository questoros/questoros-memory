import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const infraRoot = path.resolve(scriptDir, '..');
const outDir = path.join(infraRoot, 'cdk.out');

function walk(root) {
  const results = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(...walk(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

function fail(message) {
  console.error(`AWS assembly verification failed: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(outDir)) {
  fail('cdk.out does not exist.');
}

const files = walk(outDir);
const indexAssets = files.filter(
  (file) => path.basename(file) === 'index.js' && file.includes(`${path.sep}asset.`),
);
const handlerCandidates = indexAssets.filter((file) => {
  const source = fs.readFileSync(file, 'utf8');
  return source.includes('RUNTIME_NOT_READY') && source.includes('Memory API runtime is not ready.');
});
if (handlerCandidates.length !== 1) {
  fail(
    `expected one QuestorOS Memory Lambda asset, found ${handlerCandidates.length} among ${indexAssets.length} index.js assets.`,
  );
}

const handlerPath = handlerCandidates[0];
const assetDir = path.dirname(handlerPath);
const handlerSource = fs.readFileSync(handlerPath, 'utf8');
if (handlerSource.includes('Not deployed') || handlerSource.includes('statusCode: 501')) {
  fail('placeholder Lambda handler remains in the deployment asset.');
}

const prismaPackage = path.join(assetDir, 'node_modules', '@prisma', 'client', 'package.json');
const generatedClient = path.join(assetDir, 'node_modules', '.prisma', 'client');
if (!fs.existsSync(prismaPackage)) {
  fail('@prisma/client is missing from the Lambda asset.');
}
if (!fs.existsSync(path.join(generatedClient, 'schema.prisma'))) {
  fail('generated Prisma schema is missing from the Lambda asset.');
}

const generatedFiles = walk(generatedClient);
const lambdaEngine = generatedFiles.find(
  (file) => file.includes('rhel-openssl-3.0.x') && file.endsWith('.node'),
);
if (!lambdaEngine) {
  fail('rhel-openssl-3.0.x Prisma engine is missing from the Lambda asset.');
}

const assetFiles = walk(assetDir);
const totalBytes = assetFiles.reduce((sum, file) => sum + fs.statSync(file).size, 0);
const lambdaUnzippedLimit = 250 * 1024 * 1024;
if (totalBytes >= lambdaUnzippedLimit) {
  fail(`Lambda asset is ${totalBytes} bytes and exceeds the unzipped limit.`);
}

const templatePath = files.find((file) => file.endsWith('.template.json'));
if (!templatePath) {
  fail('CloudFormation template was not generated.');
}
const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
const resources = Object.values(template.Resources ?? {});
const applicationFunctions = resources.filter(
  (resource) =>
    resource?.Type === 'AWS::Lambda::Function' &&
    resource?.Properties?.FunctionName === 'questoros-memory-staging-api',
);
if (applicationFunctions.length !== 1) {
  fail(`expected one named Memory API Lambda function, found ${applicationFunctions.length}.`);
}

const functionProperties = applicationFunctions[0].Properties ?? {};
if (functionProperties.Runtime !== 'nodejs24.x') {
  fail('Lambda runtime is not nodejs24.x.');
}
if (functionProperties.Handler !== 'index.handler') {
  fail('Lambda handler is not index.handler.');
}
if (functionProperties.Code?.ZipFile) {
  fail('Lambda still uses inline source code.');
}
if (!Array.isArray(functionProperties.Layers) || functionProperties.Layers.length !== 1) {
  fail('AWS Parameters and Secrets extension layer is missing.');
}

const variables = functionProperties.Environment?.Variables ?? {};
if (!variables.DATABASE_SECRET_ID) {
  fail('DATABASE_SECRET_ID is not configured.');
}
if (variables.DATABASE_URL) {
  fail('DATABASE_URL must not be embedded in the CloudFormation template.');
}

const templateText = fs.readFileSync(templatePath, 'utf8');
if (templateText.includes('qmem_live_') || templateText.includes('postgresql://')) {
  fail('template appears to contain secret material.');
}

console.log(
  `AWS assembly verified: real handler, Prisma Lambda engine, secret reference, ${(totalBytes / 1024 / 1024).toFixed(2)} MiB unzipped.`,
);
