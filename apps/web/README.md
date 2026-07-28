# MemoryOS Client Portal

This package is the standalone customer workspace for **MemoryOS by QuestorOS**.

It intentionally keeps the user experience simple:

- **Overview** — current organizational-intelligence signals and recent retained knowledge
- **Ask** — explainable search across the authorized scope
- **Knowledge** — unified intelligence library with source links and immutable history
- **Review** — human review by exception for proposals, conflicts, and duplicates

## Real service connection

The portal calls the existing authenticated Memory API. It does not contain a mock data mode and does not claim a successful connection when the API cannot be reached.

For a controlled client pilot:

1. Create a temporary tenant-, workspace-, or project-scoped API key with only the required permissions.
2. Deploy the portal with `MEMORYOS_PUBLIC_API_BASE_URL` set to the public Memory API base URL.
3. Configure the API with `MEMORYOS_PORTAL_ORIGINS` containing the portal's exact browser origin.
4. Give the presenter or approved client user the temporary scoped key through a separate secure channel.
5. Revoke or rotate the key after the presentation or pilot window.

The browser stores the API key only in `sessionStorage`. The endpoint may be retained in `localStorage`; credentials are never written there or embedded in the static build.

## Local build

```bash
pnpm --filter @questoros-memory/web build
pnpm --filter @questoros-memory/web test
pnpm --filter @questoros-memory/web dev
```

The local portal runs at `http://127.0.0.1:4173` by default. Add that exact origin to `MEMORYOS_PORTAL_ORIGINS` for local API access.

## Public status page

`/status` performs unauthenticated `/healthz` and `/readyz` checks against the configured public API endpoint. It never displays customer, tenant, credential, connector, or private diagnostic information.

## Current authentication boundary

This portal is suitable for a controlled real-client presentation and scoped pilot. Enterprise SSO, invitation workflows, account recovery, and long-lived user sessions belong to the production onboarding workstream and must be completed before broad self-service release.
