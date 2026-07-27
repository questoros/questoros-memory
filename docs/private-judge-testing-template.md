# Private Judge Testing Instructions Template

This file contains no credential. Copy the completed text into Devpost's private testing-instructions field only. Do not commit the completed key or fixture identifiers to the repository.

## Copy-ready private instructions

```text
QuestorOS Memory — private judge testing instructions

Transport:
MCP Streamable HTTP

Endpoint:
https://blrt2ds22f.execute-api.ap-southeast-1.amazonaws.com/staging/mcp

Authentication header:
Authorization: Bearer [TEMPORARY_READ_ONLY_JUDGE_KEY]

Credential scope:
PROJECT

Permissions:
memory:read

Credential expiry:
[UTC EXPIRY AFTER THE JUDGING PERIOD]

Expected remote tools:
questoros_memory_whoami
questoros_memory_get
questoros_memory_list
questoros_memory_search
questoros_memory_history

Synthetic fixture memory ID:
[STABLE_SYNTHETIC_FIXTURE_MEMORY_ID]

Suggested search query:
Harborview continuity milestone

Expected fixture behavior:
- whoami returns PROJECT scope and read-only permissions;
- list returns only the synthetic project fixture;
- search returns the fixture with an explanation object;
- get returns the current corrected synthetic content, provenance, and metadata;
- history returns immutable revisions 1 and 2;
- a non-allowlisted write tool such as questoros_memory_create fails;
- another project cannot be accessed.

Testing boundaries:
- use only the supplied synthetic fixture;
- do not publish the key;
- do not place the key in screenshots, recordings, issues, or repository files;
- do not submit private, customer, regulated, or confidential data;
- do not perform load, penetration, destructive, denial-of-service, or cost-amplification testing;
- the endpoint is a controlled staging MVP and may be rate-limited.

Safe expected failures:
- missing key: AUTH_REQUIRED;
- invalid, revoked, or expired key: sanitized authentication error;
- another project: SCOPE_DENIED;
- unapproved browser origin: MCP_ORIGIN_DENIED;
- write tool: unavailable or protocol error;
- invalid input: VALIDATION_ERROR.

Support contact during judging:
[PRIVATE SUPPORT EMAIL OR DEVPOST MESSAGE CHANNEL]
```

## Credential requirements

Before sending the private instructions, verify that the judge credential:

- is a newly created dedicated key, not the development or deployment key;
- is scoped to exactly one synthetic project;
- contains only `memory:read`;
- has an expiry after the judging period but not an indefinite lifetime;
- can be revoked independently;
- cannot create, correct, delete, harvest, approve, reject, publish, administer, or access another project; and
- is stored only in approved private channels and an ignored local secret store.

## Fixture requirements

The stable judge fixture must:

- contain synthetic data only;
- use the same project as the judge credential;
- have a clear title and unique marker;
- have a current corrected value;
- have exactly two immutable revisions;
- include actor provenance and synthetic metadata;
- be discoverable by the suggested search query;
- contain no customer, production, regulated, or confidential data; and
- remain unchanged during the judging period.

## Verification before submission

From a clean external MCP client:

1. Connect using only the endpoint and temporary judge key.
2. Call `questoros_memory_whoami`.
3. Confirm exactly five tools are exposed.
4. Call `questoros_memory_list` using the returned project scope.
5. Call `questoros_memory_search` with `Harborview continuity milestone`.
6. Call `questoros_memory_get` using the fixture ID.
7. Call `questoros_memory_history` and confirm revisions 1 and 2.
8. Attempt `questoros_memory_create` and confirm it fails.
9. Confirm no secret appears in tool output or client logs.

## Post-judging cleanup

After the judging period:

1. revoke the temporary judge key;
2. verify the revoked key can no longer initialize MCP;
3. remove the synthetic fixture, revisions, embedding, and fixture-correlated audit records;
4. confirm the project returns to its pre-judge active-memory state;
5. retain only sanitized evidence needed for the submission archive; and
6. follow [`cost-and-cleanup.md`](cost-and-cleanup.md) for staging teardown decisions.
