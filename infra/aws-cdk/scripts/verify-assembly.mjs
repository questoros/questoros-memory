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

function resourcesOfType(resources, type) {
  return Object.values(resources).filter((resource) => resource?.Type === type);
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
  return (
    source.includes('RUNTIME_NOT_READY') && source.includes('Memory API runtime is not ready.')
  );
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
const templateText = fs.readFileSync(templatePath, 'utf8');
const template = JSON.parse(templateText);
const resources = template.Resources ?? {};

const applicationFunctions = resourcesOfType(resources, 'AWS::Lambda::Function').filter(
  (resource) => resource?.Properties?.FunctionName === 'questoros-memory-staging-api',
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
if (functionProperties.MemorySize !== 1024) {
  fail('Lambda memory is not limited to 1,024 MB.');
}
if (functionProperties.Timeout !== 30) {
  fail('Lambda timeout is not limited to 30 seconds.');
}
if (functionProperties.ReservedConcurrentExecutions !== undefined) {
  fail('Lambda reserved concurrency must remain unset for reduced-quota staging accounts.');
}
if (!functionProperties.LoggingConfig?.LogGroup) {
  fail('Lambda is not attached to the explicit staging log group.');
}

const variables = functionProperties.Environment?.Variables ?? {};
if (!variables.DATABASE_SECRET_ID) {
  fail('DATABASE_SECRET_ID is not configured.');
}
if (variables.DATABASE_URL) {
  fail('DATABASE_URL must not be embedded in the CloudFormation template.');
}
if (variables.EMBEDDING_AUTO_ON_WRITE !== 'false') {
  fail('automatic embedding on write is not disabled.');
}

const logGroups = resourcesOfType(resources, 'AWS::Logs::LogGroup').filter(
  (resource) => resource?.Properties?.LogGroupName === '/questoros-memory/staging/api',
);
if (logGroups.length !== 1) {
  fail(`expected one explicit staging log group, found ${logGroups.length}.`);
}
const logGroup = logGroups[0];
if (logGroup.Properties?.RetentionInDays !== 14) {
  fail('staging log retention is not 14 days.');
}
if (logGroup.DeletionPolicy !== 'Delete' || logGroup.UpdateReplacePolicy !== 'Delete') {
  fail('staging log group is not configured for stack-scoped teardown.');
}

const stages = resourcesOfType(resources, 'AWS::ApiGatewayV2::Stage').filter(
  (resource) => resource?.Properties?.StageName === 'staging',
);
if (stages.length !== 1) {
  fail(`expected one staging HTTP API stage, found ${stages.length}.`);
}
const routeSettings = stages[0].Properties?.DefaultRouteSettings ?? {};
if (routeSettings.ThrottlingRateLimit !== 20 || routeSettings.ThrottlingBurstLimit !== 40) {
  fail('HTTP API staging throttles are not 20 requests/second with burst 40.');
}

const expectedAlarmNames = new Set([
  'questoros-memory-staging-lambda-errors',
  'questoros-memory-staging-lambda-throttles',
  'questoros-memory-staging-lambda-duration-p95',
  'questoros-memory-staging-api-5xx',
  'questoros-memory-staging-api-latency-p95',
]);
const alarms = resourcesOfType(resources, 'AWS::CloudWatch::Alarm');
const actualAlarmNames = new Set(alarms.map((alarm) => alarm?.Properties?.AlarmName));
for (const alarmName of expectedAlarmNames) {
  if (!actualAlarmNames.has(alarmName)) {
    fail(`required CloudWatch alarm is missing: ${alarmName}.`);
  }
}
if (alarms.length !== expectedAlarmNames.size) {
  fail(`expected ${expectedAlarmNames.size} staging alarms, found ${alarms.length}.`);
}
for (const alarm of alarms) {
  const properties = alarm.Properties ?? {};
  for (const actionProperty of ['AlarmActions', 'OKActions', 'InsufficientDataActions']) {
    if (Array.isArray(properties[actionProperty]) && properties[actionProperty].length > 0) {
      fail(`alarm ${properties.AlarmName ?? 'unknown'} has an unapproved notification action.`);
    }
  }
}

if (templateText.includes('qmem_live_') || templateText.includes('postgresql://')) {
  fail('template appears to contain secret material.');
}

console.log(
  `AWS assembly verified: real handler, Prisma Lambda engine, secret reference, explicit 14-day logs, reduced-quota-safe concurrency, five actionless alarms, ${(totalBytes / 1024 / 1024).toFixed(2)} MiB unzipped.`,
);
