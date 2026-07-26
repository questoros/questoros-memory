# Phase 7 — Live Amazon Bedrock reasoning

**Status:** Implementation started on `feat/phase-7-bedrock-reasoning-runtime`. Live model invocation remains disabled until the code path, tests, cost controls, and a one-call staging preflight are reviewed.

## Objective

Activate the existing provider-neutral `ReasoningProvider` through Amazon Bedrock without weakening the Phase 5 governance model or Phase 6 staging controls.

The live provider must support the five existing structured operations:

1. structured organizational-intelligence extraction;
2. conflict analysis;
3. policy evaluation;
4. Continuity Agent tool selection;
5. execution evaluation.

Every model response remains a proposal. It must pass the existing strict Zod schema before any downstream action can occur.

## Safety boundaries

- default provider remains `mock`;
- live calls require both `REASONING_PROVIDER=amazon-bedrock` and `REASONING_ALLOW_LIVE_CALLS=true`;
- no credentials, prompts, source documents, model responses, or reasoning traces are logged;
- no chain-of-thought is requested, stored, returned, or published;
- only concise structured JSON is accepted;
- malformed or schema-invalid output fails closed;
- bounded input and output sizes;
- bounded timeout and retry count;
- no streaming, provisioned throughput, batch inference, or cross-account role assumption;
- no automatic authoritative memory writes;
- existing candidate review and approval gates remain unchanged;
- the Phase 6 $5 monthly budget remains the staging spend guard.

## Runtime design

Implement `AmazonBedrockReasoningProvider` inside `@questoros-memory/reasoning-provider` using the AWS SDK Bedrock Runtime client.

The provider will:

- use an injected client in tests;
- use temporary Lambda role credentials in staging;
- use a separately configured reasoning model ID;
- issue one bounded request per reasoning operation;
- instruct the model to return one JSON object only;
- extract the JSON object without exposing raw model text;
- validate it with the operation-specific schema;
- return a typed `ReasoningProviderError` on timeout, provider failure, malformed JSON, or schema failure.

## Model selection gate

Do not assume that the Titan embedding model is a reasoning model. Phase 7 must select a Bedrock text-generation model that is available to the account and approved for the target region. Model access and current pricing must be verified immediately before the first live call.

The initial staging preflight is limited to one synthetic request with no customer or company data. It must print only:

- provider reachable: true/false;
- model ID selected;
- operation completed: true/false;
- schema validation passed: true/false;
- elapsed milliseconds;
- no prompt, response body, token values, account identifiers, ARNs, or credentials.

## Acceptance gates

Before merge:

- unit tests for all five operations;
- malformed JSON and schema-invalid output tests;
- timeout, throttling, access-denied, and generic provider-error tests;
- proof that raw model text and source input are not logged;
- factory remains fail-closed unless the live-call flag is explicitly enabled;
- CDK IAM permission is limited to the exact approved reasoning model ARN;
- staging environment variables are explicit and do not enable reasoning by default;
- full format, lint, typecheck, test, build, and AWS synthesis gates pass;
- one separately approved synthetic live staging call passes;
- PR remains draft and unmerged until explicit approval.

## Out of scope

- Google Drive or Microsoft Graph live harvesting;
- whole-drive or selected-folder continuous sync;
- desktop harvester;
- remote MCP deployment;
- production deployment;
- automatic memory approval or publication;
- customer data in the first live model call.
