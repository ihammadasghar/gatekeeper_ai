# Gatekeeper AI — Architecture Overhaul Roadmap

> **Purpose:** This document is the single source of truth for migrating Gatekeeper AI from
> its current single-worker prototype to the full production architecture. Every ticket is
> sized for one coding-agent execution session.

## Current State (Baseline)

| Concern   | Current                                   | Target                                              |
| --------- | ----------------------------------------- | --------------------------------------------------- |
| Frontend  | Vite + React 19 SPA                       | Next.js 15 (App Router)                             |
| Backend   | Single Cloudflare Worker                  | Express.js gateway + Cloudflare Worker              |
| Auth      | Personal GitHub token (env var)           | GitHub App + OAuth                                  |
| Tenancy   | Single hardcoded repo (`GITHUB_REPO_URL`) | Multi-tenant (D1 + per-repo state)                  |
| Memory    | Agent Durable Object SQLite only          | D1 (relational) + Vectorize (semantic)              |
| Ingestion | None                                      | Cloudflare Workflows (cold start + delta)           |
| RAG       | None                                      | Vectorize with AST/conversational/markdown chunking |
| Webhooks  | None                                      | GitHub App webhooks → Workflows                     |

## Ticket Format

Each ticket specifies: **Context** (what exists today) · **Acceptance Criteria** (verifiable done conditions) · **Technical Notes** (implementation guidance) · **Dependencies** · **Effort** (S < 2 h | M 2–4 h | L > 4 h).

---

## Phase 0 — Foundation

> Sets up the monorepo skeleton and Cloudflare service bindings. All other phases depend on this phase.

---

### ARCH-001 — Convert project to Turborepo monorepo

**Context:** The project is currently a flat directory with a Cloudflare Worker entry point at
`src/server.ts` and a Vite React SPA sharing the same root. The new architecture requires three
separate services (`apps/worker`, `apps/gateway`, `apps/web`) and a shared types package
(`packages/types`).

**Acceptance Criteria:**

- Root `package.json` configures Turborepo (`turbo.json` with `build`, `dev`, `check`, `test` pipelines).
- `apps/worker/` contains the current Cloudflare Worker source (`src/`, `wrangler.jsonc`, `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `env.d.ts`).
- `apps/gateway/` is an empty Express.js skeleton with its own `package.json` and `tsconfig.json`.
- `apps/web/` is an empty Next.js 15 skeleton with its own `package.json` and `tsconfig.json`.
- `packages/types/` exports the interfaces from the current `src/lib/interfaces.ts` (no changes to interface shapes yet).
- `apps/worker` imports `GitHubIssue` and other shared interfaces from `packages/types` rather than from the local `lib/interfaces.ts`.
- `npm run dev` at the repo root starts all three apps in parallel via Turborepo.
- `npm run check` passes (prettier + biome lint + tsc) across all packages.
- Existing tests in `apps/worker/tests/` still pass.

**Technical Notes:**

- Use `turbo init` and then manually configure workspaces in root `package.json` (`"workspaces": ["apps/*", "packages/*"]`).
- Move files rather than copy — use `git mv` to preserve git history.
- The Vite React SPA assets currently live at the root; they will later be replaced by Next.js (Phase 5). For now, keep them in `apps/worker` so the worker still serves the existing UI.
- `packages/types/src/index.ts` re-exports everything from the migrated interfaces file.
- Update path aliases (`@/lib/...`) in `apps/worker` to use the local `lib/` for non-shared utilities (logger, github-utils, prompts) and `packages/types` for shared data shapes.

**Dependencies:** None.
**Effort:** M

---

### ARCH-002 — Add Cloudflare D1 binding and initial schema migration

**Context:** The worker currently has no relational database. All session state lives inside the
`Chat` Durable Object's embedded SQLite. The new architecture requires a shared D1 database for
`users`, `repositories`, `repository_labels`, `chat_sessions`, and `sync_events`.

**Acceptance Criteria:**

- `apps/worker/wrangler.jsonc` includes a `d1_databases` binding named `DB` pointing to a database named `gatekeeper-db`.
- `apps/worker/migrations/0001_initial_schema.sql` creates the five tables with the exact column definitions from `docs/project-grammar.md`:
  - `users(id, github_id, email, name, avatar_url, created_at)`
  - `repositories(id, github_repo_id, owner, name, installation_id, sync_status, last_synced_at)`
  - `repository_labels(id, repository_id, name, description, color)`
  - `chat_sessions(id, user_id, repository_id, title, created_at, updated_at)`
  - `sync_events(id, repository_id, event_type, commit_sha, status, processed_at)`
- `env.d.ts` is regenerated and includes `DB: D1Database`.
- Migration runs successfully with `wrangler d1 migrations apply gatekeeper-db --local`.
- A `src/lib/db.ts` utility in `apps/worker` exports a typed wrapper (`getDB(env: Env): D1Database`) that enforces the `DB` binding is present.

**Technical Notes:**

- Use UUID v4 primary keys (`TEXT` in D1, generated via `crypto.randomUUID()`).
- `sync_status` is an enum string; store as `TEXT` with a `CHECK` constraint: `CHECK(sync_status IN ('pending','syncing','synced','failed'))`.
- Add `NOT NULL` constraints and `DEFAULT CURRENT_TIMESTAMP` for `created_at` columns.
- Foreign key constraints are not enforced by D1 by default; add them anyway for documentation value.

**Dependencies:** ARCH-001
**Effort:** S

---

### ARCH-003 — Add Cloudflare Vectorize and Workflows bindings

**Context:** The worker currently has no vector search or background job infrastructure. RAG
and ingestion require Cloudflare Vectorize (semantic search) and Cloudflare Workflows (durable
background jobs).

**Acceptance Criteria:**

- `apps/worker/wrangler.jsonc` includes:
  - A `vectorize` binding named `VECTORIZE` pointing to an index named `gatekeeper-vectors`.
  - A `workflows` binding with name `INGESTION_WORKFLOW` referencing the class `IngestionWorkflow`.
- The Vectorize index is configured with dimension `768` (matching `@cf/baai/bge-base-en-v1.5` output) and `cosine` distance metric.
- `env.d.ts` is regenerated and includes `VECTORIZE: VectorizeIndex` and `INGESTION_WORKFLOW: Workflow`.
- A stub `src/workflows/ingestion.workflow.ts` exports an `IngestionWorkflow` class that extends `WorkflowEntrypoint` with an empty `run()` method. This is a placeholder for Phase 3.
- `apps/worker` TypeScript compiles without errors (`npm exec tsc --noEmit`).

**Technical Notes:**

- Create the Vectorize index locally with: `wrangler vectorize create gatekeeper-vectors --dimensions=768 --metric=cosine`.
- The Workflows binding requires the class name to match the export in `wrangler.jsonc` `class_name`.
- Stub `IngestionWorkflow` just needs to satisfy the TypeScript signature — no business logic yet.

**Dependencies:** ARCH-001
**Effort:** S

---

## Phase 1 — GitHub App & OAuth Gateway

> Builds the Express.js gateway service responsible for GitHub OAuth, webhook ingestion, and routing to the Cloudflare Agent.

---

### ARCH-004 — Scaffold Express.js gateway service

**Context:** `apps/gateway` is currently an empty skeleton (created in ARCH-001). This ticket
builds the fully configured Express service with TypeScript, middleware, and route stubs.

**Acceptance Criteria:**

- `apps/gateway/src/server.ts` exports an Express app and a `startServer` function that listens on `PORT` (default `3001`).
- Middleware configured: `express.json()`, `cors` (origin from `FRONTEND_URL` env var), `morgan` for structured request logging.
- Route stubs return `501 Not Implemented` for all paths defined in `docs/api-design.md` Layer A:
  - `GET /api/v1/auth/github`
  - `GET /api/v1/auth/github/callback`
  - `GET /api/v1/repositories`
  - `GET /api/v1/repositories/:repoId/sessions`
  - `GET /api/v1/agent/connect/:sessionId`
  - `POST /api/v1/webhooks/github`
- All routes are declared in separate router files (`src/routes/auth.ts`, `src/routes/repositories.ts`, `src/routes/webhooks.ts`, `src/routes/agent.ts`) and mounted in `server.ts`.
- A `src/middleware/error-handler.ts` catches unhandled errors and returns `{ error: string, status: number }` JSON with the appropriate HTTP status code.
- `npm run dev` in `apps/gateway` starts the server with `ts-node` or `tsx --watch`.
- TypeScript compiles without errors.

**Technical Notes:**

- Dependencies: `express`, `cors`, `morgan`, `dotenv`. Dev: `@types/express`, `@types/cors`, `@types/morgan`, `tsx`.
- Follow the DI principle: every route handler receives its service dependencies through a factory function, not by importing them directly.
- Use `express-async-errors` or wrap all async handlers in a `tryCatch` HOF to propagate async errors to the error handler.

**Dependencies:** ARCH-001
**Effort:** S

---

### ARCH-005 — Implement GitHub OAuth flow

**Context:** Currently there is no authentication. Users interact directly with the agent using
a hardcoded GitHub token. The new architecture requires GitHub OAuth (via a GitHub App) to
identify users and associate them with repositories.

**Acceptance Criteria:**

- `GET /api/v1/auth/github` redirects to GitHub's OAuth authorization URL with correct `client_id` and `scope=read:user,repo` (or `read:org` for org installs).
- `GET /api/v1/auth/github/callback` exchanges the `code` parameter for an access token using the GitHub OAuth API, then:
  - Fetches the user profile from `GET https://api.github.com/user`.
  - Upserts the user into D1 `users` table (via `IUserRepository`).
  - Sets an HTTP-only, `SameSite=Lax` session cookie containing the user's `id`.
  - Redirects to `FRONTEND_URL/dashboard`.
- A `src/repositories/user.repository.ts` in `apps/gateway` implements `IUserRepository` with methods `findByGitHubId(githubId: string)`, `upsert(user: CreateUserDTO)`, `findById(id: string)`.
- `IUserRepository` interface lives in `packages/types`.
- A `src/middleware/auth.ts` middleware reads the session cookie, validates it against D1, and attaches `req.user` to the request. Returns `401` if missing or invalid.
- Unit tests: `auth.route.test.ts` mocks `IUserRepository` via constructor injection and asserts the correct redirect URLs and cookie headers.

**Technical Notes:**

- Use `cookie-parser` middleware for cookie handling.
- Store `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` as environment variables in `apps/gateway/.env`.
- Never store the raw GitHub access token in the session cookie — store only the D1 user ID; fetch the token from D1 on demand.
- For local dev, provide a `.env.example` with placeholder values.

**Dependencies:** ARCH-002, ARCH-004
**Effort:** M

---

### ARCH-006 — Implement GitHub webhook ingestion endpoint

**Context:** There is currently no webhook handling. The new architecture requires the gateway
to receive GitHub App webhooks, validate them cryptographically, and enqueue them as Cloudflare
Workflow jobs without blocking.

**Acceptance Criteria:**

- `POST /api/v1/webhooks/github` does **not** use `express.json()` middleware — it reads the raw body buffer for signature validation.
- The endpoint validates the `X-Hub-Signature-256` header using HMAC-SHA256 with `GITHUB_WEBHOOK_SECRET`. Returns `401` with `{ error: 'Invalid signature' }` on mismatch.
- On valid signature:
  - Parses the JSON payload.
  - For `push` events targeting the default branch: enqueues a `DELTA_SYNC` job to the Ingestion Workflow (via `IWorkflowClient`).
  - For `issues` events: enqueues a `ISSUE_SYNC` job.
  - For `label` events: enqueues a `LABEL_SYNC` job.
  - Returns `202 Accepted` immediately in all valid-signature cases.
- Creates a `SyncEvent` record in D1 with `status: 'pending'` via `ISyncEventService`.
- Unit tests cover: valid `push` event, invalid signature (401), unsupported event type (202 with no job enqueued).

**Technical Notes:**

- Use `express.raw({ type: '*/*' })` on this specific route to get the raw `Buffer` for HMAC verification.
- HMAC comparison must use `crypto.timingSafeEqual()` to prevent timing attacks.
- `IWorkflowClient` is an interface wrapping the Cloudflare Workflow trigger call — inject it so tests can mock it.
- The payload handler for each event type lives in `src/handlers/webhook-handler.ts` to keep the route thin.

**Dependencies:** ARCH-002, ARCH-003, ARCH-004
**Effort:** M

---

### ARCH-007 — Implement repository management endpoints

**Context:** Currently the target repository is hardcoded via `GITHUB_REPO_URL` env var. The
new architecture requires users to connect repositories through the UI, with state stored in D1.

**Acceptance Criteria:**

- `GET /api/v1/repositories` (auth required) returns the list of repositories for the authenticated user from D1, with their `sync_status`.
- `POST /api/v1/repositories` (auth required) accepts `{ githubRepoId, owner, name, installationId }`, creates a `Repository` record in D1 with `sync_status: 'pending'`, and triggers a `COLD_START` Workflow job.
- `GET /api/v1/repositories/:repoId/sessions` (auth required) returns `ChatSession` records for that repository from D1.
- A `src/services/repository.service.ts` implements `IRepositoryService` with methods: `findByUser(userId)`, `create(dto)`, `findById(id)`, `updateSyncStatus(id, status)`.
- A `src/services/chat-session.service.ts` implements `IChatSessionService` with methods: `findByRepository(repoId)`, `create(dto)`.
- Both `IRepositoryService` and `IChatSessionService` interfaces live in `packages/types`.
- Unit tests for both services using D1 mock via constructor injection.

**Technical Notes:**

- The `auth` middleware (ARCH-005) must be applied to all three routes.
- `installationId` is the GitHub App installation ID — required to make API calls on behalf of the repository later.
- Return 403 if the user tries to access a repository they don't own (check `user_id` on ChatSession).

**Dependencies:** ARCH-002, ARCH-005
**Effort:** M

---

## Phase 2 — Data Access Layer (D1)

> Implements the repository pattern for all D1 tables inside the Cloudflare Worker, enabling the Agent and Workflows to read/write relational state.

---

### ARCH-008 — Implement D1-backed UserRepository in the worker

**Context:** The Express gateway has its own `UserRepository` (ARCH-005). The Cloudflare Worker
also needs to read user data (e.g., to verify a session token passed over WebSocket). This
ticket implements the same `IUserRepository` interface against `env.DB` in the worker context.

**Acceptance Criteria:**

- `apps/worker/src/repositories/user.repository.ts` exports `D1UserRepository` implementing `IUserRepository` from `packages/types`.
- Methods: `findById(id: string): Promise<User | null>`, `findByGitHubId(id: string): Promise<User | null>`.
- All D1 queries use parameterized statements (never string interpolation).
- Unit tests mock `D1Database` via a constructor-injected interface (`ID1Database`) and assert the correct SQL for each method.

**Technical Notes:**

- D1 returns `null` from `.first()` when no row is found — handle this explicitly rather than asserting non-null.
- Map D1 snake_case column names to camelCase TypeScript interface properties in a private `mapRow()` method.

**Dependencies:** ARCH-002, ARCH-001
**Effort:** S

---

### ARCH-009 — Implement D1-backed RepositoryRepository in the worker

**Context:** The Cloudflare Worker Durable Object and Workflows need to look up repository
metadata (e.g., to derive `owner/repo` for GitHub API calls in tools, instead of the hardcoded
`env.GITHUB_REPO_URL`).

**Acceptance Criteria:**

- `apps/worker/src/repositories/repository.repository.ts` exports `D1RepositoryRepository` implementing `IRepositoryRepository` from `packages/types`.
- Methods: `findById(id)`, `updateSyncStatus(id, status)`, `findByGitHubRepoId(githubRepoId)`.
- Unit tests with D1 mock cover happy path and not-found cases.
- `sync_status` updates use a dedicated `UPDATE` statement; other fields are read-only after creation.

**Dependencies:** ARCH-002, ARCH-001
**Effort:** S

---

### ARCH-010 — Implement D1-backed ChatSessionRepository in the worker

**Context:** Each `Chat` Durable Object ID maps to a `chat_sessions` row. The worker needs to
read session metadata (e.g., `repository_id`) when initializing a Durable Object.

**Acceptance Criteria:**

- `apps/worker/src/repositories/chat-session.repository.ts` exports `D1ChatSessionRepository` implementing `IChatSessionRepository` from `packages/types`.
- Methods: `findById(id)`, `create(dto)`, `updateTitle(id, title)`.
- `findById` returns the full `ChatSession` including `repositoryId` (mapped from `repository_id`).
- Unit tests cover create and findById, asserting parameterized SQL.

**Dependencies:** ARCH-002, ARCH-001
**Effort:** S

---

### ARCH-011 — Implement D1-backed SyncEventRepository in the worker

**Context:** Workflows update `sync_events` throughout their lifecycle. This repository
provides a typed interface so Workflow steps can record and update sync event state.

**Acceptance Criteria:**

- `apps/worker/src/repositories/sync-event.repository.ts` exports `D1SyncEventRepository` implementing `ISyncEventRepository` from `packages/types`.
- Methods: `create(dto): Promise<SyncEvent>`, `updateStatus(id, status): Promise<void>`, `findByRepository(repoId): Promise<SyncEvent[]>`.
- `status` updates validate against the allowed enum: `'pending' | 'running' | 'completed' | 'failed'`.
- Unit tests cover `create` and `updateStatus` with mock D1.

**Dependencies:** ARCH-002, ARCH-001
**Effort:** S

---

## Phase 3 — Background Ingestion (Cloudflare Workflows)

> Implements the full RAG ingestion pipeline: chunking strategies, Vectorize operations, and the Workflow orchestrators for cold start and delta sync.

---

### ARCH-012 — Implement Markdown chunking service

**Context:** `.md` files and `.github/ISSUE_TEMPLATE/` templates need to be chunked for
embedding. The strategy from `docs/rag-strategy.md`: split strictly by `##`/`###` headers,
prepend the parent header to each chunk.

**Acceptance Criteria:**

- `apps/worker/src/lib/chunking/markdown-chunker.ts` exports a `MarkdownChunker` class implementing `IChunker`.
- `IChunker` is defined in `packages/types` with method `chunk(content: string, metadata: ChunkMetadata): VectorDocument[]`.
- Chunks split at `##` and `###` boundaries; the text under each header becomes one chunk.
- Each chunk prepends its parent `##` header (if the split was at `###`) so context is preserved.
- `VectorDocument` metadata fields populated: `repository_id`, `type: 'doc' | 'template'`, `file_path`.
- Empty chunks (headers with no body text) are filtered out.
- Unit tests: a document with 3 `##` sections produces 3 chunks; a `###` subsection prepends its parent `##` header; empty sections are excluded.

**Technical Notes:**

- Parse headers with a simple regex: `/^#{2,3}\s+(.+)$/m`. Do not use a full Markdown parser (edge-runtime constraint).
- `VectorDocument` shape: `{ text: string; metadata: VectorDocumentMetadata }`. `text` is what gets embedded; `metadata` is stored alongside the vector.
- Use the exact `VectorDocumentMetadata` schema from `docs/rag-strategy.md` — do not add extra fields.

**Dependencies:** ARCH-003
**Effort:** S

---

### ARCH-013 — Implement issue/PR conversational chunking service

**Context:** GitHub issues have an initial description and a comment thread. The strategy from
`docs/rag-strategy.md`: first chunk = OP + metadata; long threads use a sliding window (groups
of 5 comments, 1-comment overlap); threads with >30 comments trigger summarization.

**Acceptance Criteria:**

- `apps/worker/src/lib/chunking/issue-chunker.ts` exports `IssueChunker` implementing `IChunker`.
- Given an issue with body + N comments:
  - Always produces chunk 0: `"#<number>: <title>\nStatus: <state>\nLabels: <labels>\n\n<body>"`.
  - For N ≤ 30 comments: sliding window groups of 5 with 1-comment overlap.
  - For N > 30: a single summary chunk is produced using a placeholder `summarizeThread()` function (to be wired to a real LLM call in Phase 4).
- `VectorDocument` metadata: `repository_id`, `type: 'issue'`, `issue_number`, `issue_state`, `labels` (string array).
- Unit tests: 0 comments → 1 chunk; 10 comments → OP + sliding-window groups; >30 comments → OP + 1 summary chunk (mock `summarizeThread`).

**Technical Notes:**

- `summarizeThread()` should accept an array of comment strings and return `Promise<string>`. Stub it to return `comments.join('\n\n')` for now; it will be replaced in ARCH-022.
- Inject `summarizeThread` through the constructor so tests can mock it without `vi.mock`.

**Dependencies:** ARCH-003
**Effort:** M

---

### ARCH-014 — Implement AST-based code chunking service

**Context:** Source code files need to be chunked at semantic boundaries (functions, classes,
interfaces) rather than by character count. The architecture mandates Tree-sitter; however,
Tree-sitter's WASM build is too large for the Cloudflare Workers bundle limit, so a regex-based
fallback must be provided.

**Acceptance Criteria:**

- `apps/worker/src/lib/chunking/code-chunker.ts` exports `CodeChunker` implementing `IChunker`.
- For TypeScript/JavaScript files, chunks are extracted at: `function` declarations, `class` declarations, `interface` declarations, standalone `export const` arrow functions.
- Each chunk prepends: file path + containing class name (if any) + JSDoc comment (if present immediately before the declaration).
- For JSON/YAML files (config fallback): one chunk per top-level key.
- Files smaller than 100 tokens are returned as a single chunk.
- `VectorDocument` metadata: `repository_id`, `type: 'code_file'`, `file_path`, `language`.
- Unit tests: a TypeScript file with 2 functions and 1 class produces 3+ chunks; file path is prepended to each.

**Technical Notes:**

- Do not import Tree-sitter — use regex patterns for TypeScript extraction (edge-runtime constraint). The comment in the architecture docs about Tree-sitter is aspirational; the regex approach is the pragmatic edge-compatible solution.
- Match TypeScript function/class boundaries with multiline regex. Use the `multiline` flag.
- `language` is derived from the file extension (`.ts` → `'typescript'`, `.js` → `'javascript'`, etc.).

**Dependencies:** ARCH-003
**Effort:** M

---

### ARCH-015 — Implement VectorizeService

**Context:** No vector operations exist today. This service provides a typed, injectable
abstraction over `env.VECTORIZE` for upserting, querying, and deleting vector documents.

**Acceptance Criteria:**

- `apps/worker/src/lib/vectorize.service.ts` exports `VectorizeService` implementing `IVectorizeService`.
- `IVectorizeService` (in `packages/types`) has methods:
  - `upsert(docs: VectorDocument[]): Promise<void>` — embeds and upserts in batches of 100.
  - `search(query: string, filter: VectorSearchFilter): Promise<VectorDocument[]>` — transforms query, embeds it, runs Vectorize query with metadata filter, returns top 5 results.
  - `delete(ids: string[]): Promise<void>` — removes vectors by ID.
- `upsert` generates vector IDs as `<repository_id>:<file_path>:<chunk_index>` (URL-encoded).
- `search` pre-filters by `repository_id` (mandatory) and optional `type`.
- Embedding calls use `env.AI.run('@cf/baai/bge-base-en-v1.5', { text: [...] })`.
- Unit tests mock `IVectorizeIndex` and `IAIBinding` via constructor injection; assert batch splitting at 100 docs.

**Technical Notes:**

- Vectorize `upsert` requires `{ id: string, values: number[], metadata: object }[]`.
- `search` query transformation: lowercase, strip punctuation, expand abbreviations via a small lookup map (e.g., `auth` → `authentication authorization`). This is a simple keyword expansion, not an LLM call.
- Store the `text` content of each chunk in the metadata under `content` key so it can be retrieved after a semantic match (Vectorize does not store the original text in the vector itself).

**Dependencies:** ARCH-003
**Effort:** M

---

### ARCH-016 — Implement Cold Start ingestion Workflow

**Context:** When a repository is first connected, all its code files, issue templates, and
issue history need to be ingested into Vectorize. This is a long-running operation that must
survive timeouts and be retried on failure — ideal for Cloudflare Workflows.

**Acceptance Criteria:**

- `apps/worker/src/workflows/ingestion.workflow.ts` implements the `COLD_START` step sequence:
  1. **Step `fetch-file-tree`**: call GitHub API `GET /repos/{owner}/{repo}/git/trees/HEAD?recursive=1` to list all files.
  2. **Step `fetch-and-chunk-code`**: for each `.ts`, `.js`, `.tsx`, `.jsx` file, fetch content and run `CodeChunker`. Skip `node_modules`, `dist`, `.git`.
  3. **Step `fetch-and-chunk-docs`**: for each `.md` file and `.github/ISSUE_TEMPLATE/*.md`, fetch content and run `MarkdownChunker`.
  4. **Step `fetch-and-chunk-issues`**: call GitHub Issues API (paginated), run `IssueChunker` for each issue.
  5. **Step `upsert-vectors`**: call `VectorizeService.upsert()` with all produced `VectorDocument[]`.
  6. **Step `update-sync-status`**: update `repositories.sync_status` to `'synced'` in D1.
- `RepositoryRepository.updateSyncStatus` is called with `'syncing'` before step 1 and `'synced'` or `'failed'` after step 6.
- A `SyncEvent` record transitions through `pending → running → completed/failed`.
- The Workflow accepts a payload of `{ repositoryId: string, owner: string, repo: string, installationId: string }`.
- Unit tests for each step using mocked services.

**Technical Notes:**

- Each step in a Cloudflare Workflow should be wrapped in `step.do('name', async () => { ... })` to enable checkpointing and retries.
- Fetch file content in batches of 10 (to avoid hitting GitHub rate limits). Use `Promise.all` within each batch.
- Use the GitHub App installation token (derived from `installationId`) rather than a personal token. This requires calling the GitHub App JWT endpoint — implement a `getInstallationToken(installationId)` helper in `apps/worker/src/lib/github-app.ts`.
- Set `COLD_START` as the `WorkflowEvent` type discriminator in the payload.

**Dependencies:** ARCH-009, ARCH-011, ARCH-012, ARCH-013, ARCH-014, ARCH-015
**Effort:** L

---

### ARCH-017 — Implement Delta Sync Workflow (push event)

**Context:** After the cold start, Vectorize must stay current as code changes. When a `push`
webhook fires, only the changed files should be re-chunked and re-embedded.

**Acceptance Criteria:**

- `apps/worker/src/workflows/ingestion.workflow.ts` handles the `DELTA_SYNC` event type with steps:
  1. **Step `fetch-diff`**: call GitHub API `GET /repos/{owner}/{repo}/commits/{sha}` to get the list of changed file paths and their patch status (`added`, `modified`, `removed`).
  2. **Step `delete-old-vectors`**: call `VectorizeService.delete()` with the IDs of all vectors for `removed` and `modified` files.
  3. **Step `fetch-and-chunk-changed`**: fetch content for `added` and `modified` files; run the appropriate chunker based on file extension.
  4. **Step `upsert-new-vectors`**: upsert the new chunks.
  5. **Step `update-sync-event`**: mark `SyncEvent` as `completed`.
- Payload: `{ repositoryId, owner, repo, commitSha, installationId }`.
- Unit tests mock all services; assert that `delete` is called for modified files before `upsert`.

**Technical Notes:**

- Vector IDs are deterministic (`<repository_id>:<file_path>:<chunk_index>`), so you can reconstruct the IDs of old vectors from the file path without querying Vectorize first.
- Handle the edge case where a file extension changes (e.g., `.js` → `.ts`) — delete old path, insert new.

**Dependencies:** ARCH-015, ARCH-016
**Effort:** M

---

### ARCH-018 — Implement Label Ingestion step

**Context:** Repository labels define the taxonomy for issue tagging. They must be ingested
into D1 on cold start and refreshed on `label` webhook events.

**Acceptance Criteria:**

- A `fetchAndStoreLabels` step is added to the Cold Start Workflow (ARCH-016) between steps 1 and 2.
- The step calls `GET /repos/{owner}/{repo}/labels` (paginated), upserts all labels into `repository_labels` D1 table, and deletes labels that no longer exist.
- A separate `LABEL_SYNC` Workflow event triggers only the `fetchAndStoreLabels` step.
- A `D1RepositoryLabelRepository` in `apps/worker/src/repositories/repository-label.repository.ts` implements `IRepositoryLabelRepository` with methods `upsertAll(repoId, labels[])` and `findByRepository(repoId)`.
- Unit tests for `upsertAll` assert that deleted labels are removed.

**Dependencies:** ARCH-016
**Effort:** S

---

## Phase 4 — Agent RAG Integration

> Refactors the `Chat` Durable Object to support multi-tenancy and real-time semantic search, wires up the RAG pipeline, and updates all existing tools.

---

### ARCH-019 — Refactor `GatekeeperState` and `Chat` Durable Object for multi-tenancy

**Context:** `Chat` currently stores messages only and derives `owner/repo` from the global
`env.GITHUB_REPO_URL`. In the new architecture, each Durable Object instance maps to a specific
`repositoryId` stored in D1 `chat_sessions`.

**Acceptance Criteria:**

- `GatekeeperState` is defined in `apps/worker/src/lib/agent-state.ts`:
  ```typescript
  interface GatekeeperState {
    readonly repositoryId: string;
    readonly isThinking: boolean;
    readonly contextReferences: ReadonlyArray<{
      readonly fileName: string;
      readonly url: string;
    }>;
  }
  ```
- `Chat.onChatMessage()` reads `this.state.storage.get<GatekeeperState>('state')` on every call.
- A new `Chat.initialize(repositoryId: string)` callable method sets `repositoryId` in state storage on first use. Returns early if already initialized.
- The `GITHUB_REPO_URL` env var is removed from all tool calls inside `Chat` — replaced by reading `state.repositoryId` and calling `D1RepositoryRepository.findById()` to get `owner` and `repo`.
- `env.d.ts` no longer has `GITHUB_REPO_URL` as a required field (it can remain optional for backward compatibility during migration).
- Existing tests updated for the new initialization flow.

**Technical Notes:**

- `this.state.storage` is the Durable Object's persistent KV. `get()` returns `undefined` if the key has never been set — handle this with a null guard and throw a descriptive error if `initialize()` was not called.
- `isThinking` is set to `true` at the start of `onChatMessage()` and `false` on completion.

**Dependencies:** ARCH-009
**Effort:** M

---

### ARCH-020 — Implement `searchCodebase` RAG tool

**Context:** Currently the Agent has no way to query repository context. This tool gives it
semantic search over the ingested vectors, enabling context-aware responses.

**Acceptance Criteria:**

- `apps/worker/src/tools.ts` exports a new `searchCodebase` tool (auto-execute, no human confirmation needed):
  - Input schema: `{ query: string, type?: 'code_file' | 'issue' | 'doc' | 'template' }`.
  - Calls `VectorizeService.search(query, { repository_id: state.repositoryId, type })`.
  - Returns a formatted string:

    ```
    <context>
    [Source: src/lib/auth.ts]
    <content of chunk>

    [Source: Issue #42: Login timeout]
    <content of chunk>
    </context>
    ```

  - Appends matched sources to `state.contextReferences` in Durable Object storage.

- The tool is added to the `tools` export in `tools.ts` and referenced in `SYSTEM_PROMPT`.
- Unit tests mock `IVectorizeService`; assert context XML format and state update.

**Technical Notes:**

- `VectorizeService` is injected into the `Chat` Durable Object constructor — do not import it directly.
- The `searchCodebase` tool description in `TOOL_DESCRIPTIONS` (prompts.ts) should instruct the LLM: "Always call this before answering questions about the codebase, architecture, or existing issues."
- If Vectorize returns 0 results, return `<context>No relevant context found.</context>` — do not return an empty string.

**Dependencies:** ARCH-015, ARCH-019
**Effort:** M

---

### ARCH-021 — Update existing tools for multi-tenancy

**Context:** All 8 existing tools (`createTicketForGithubRepo`, `searchIssuesForGithubRepo`,
etc.) read `env.GITHUB_REPO_URL` directly. With multi-tenancy, `owner/repo` must come from the
agent state's `repositoryId` via D1.

**Acceptance Criteria:**

- All 8 tools in `tools.ts` derive `[owner, repo]` via `getOwnerRepoFromState(repositoryId, env.DB)` — a new helper in `apps/worker/src/lib/github-utils.ts`.
- `getOwnerRepoFromState` queries D1 `repositories` for the record with `id = repositoryId` and returns `[owner, name]`.
- `env.GITHUB_REPO_URL` is no longer referenced in `tools.ts`.
- For backward-compatibility during development, if `repositoryId` is `'__legacy__'` the helper falls back to `env.GITHUB_REPO_URL` (if set).
- All existing tool unit tests are updated to inject a mock D1 repository instead of reading from env.
- TypeScript compiles without errors.

**Technical Notes:**

- `getOwnerRepoFromState` should be memoized per request (cache within the Durable Object's request lifecycle using a `Map` on `this`) to avoid redundant D1 lookups on every tool call.
- Keep the `GITHUB_TOKEN` env binding for the personal token as a temporary fallback; Phase 1 (ARCH-005) adds installation token support.

**Dependencies:** ARCH-009, ARCH-019
**Effort:** M

---

### ARCH-022 — Wire `summarizeThread` to real LLM call and inject context into prompt

**Context:** `IssueChunker.summarizeThread()` (ARCH-013) is currently a stub. This ticket
replaces it with a real LLM call and also implements context injection into `SYSTEM_PROMPT`.

**Acceptance Criteria:**

- `IssueChunker` accepts an `ISummarizer` dependency via constructor: `interface ISummarizer { summarize(text: string): Promise<string> }`.
- `WorkerAISummarizer` implements `ISummarizer` using `env.AI.run('@cf/meta/llama-3-8b-instruct', ...)` with a tight summary prompt (`"Summarize this GitHub issue thread in 2-3 sentences: ..."` ).
- In `Chat.onChatMessage()`, retrieved context chunks from `state.contextReferences` are formatted as `<context>...</context>` XML and appended to `SYSTEM_PROMPT` before the `streamText` call.
- If `contextReferences` is empty, no `<context>` block is appended.
- Unit tests for `WorkerAISummarizer` mock `env.AI`; assert the summary prompt format.

**Technical Notes:**

- The context injection must happen after `processToolCalls()` and before `streamText()` to reflect any context retrieved mid-conversation.
- Cap the injected context at 4,000 characters total (truncate oldest chunks first) to avoid exceeding the model's context window.

**Dependencies:** ARCH-013, ARCH-020
**Effort:** M

---

### ARCH-023 — Implement `draftIssue` RPC callable method

**Context:** `docs/api-design.md` specifies an `agent.stub.draftIssue(title, body, labels[])` RPC method that bypasses conversational flow to directly create an issue and return its URL.

**Acceptance Criteria:**

- `Chat` class in `server.ts` exposes a `@callable draftIssue(title: string, body: string, labels: string[]): Promise<string>` method.
- The method validates that `title` is non-empty and `body` has more than 50 characters; throws `Error` with a descriptive message otherwise.
- Calls `createGitHubIssue` from `github-issues.ts` and returns the `html_url` of the created issue.
- Does not go through `onChatMessage()` — skips LLM entirely.
- Unit test: mocked `github-issues.ts` dependency; asserts the URL is returned and validation errors are thrown correctly.

**Technical Notes:**

- `@callable` decorator is from the `agents` SDK — it makes the method invokable from the client via `agent.stub.draftIssue(...)`.
- Ensure `repositoryId` is initialized before this method runs (throw `'Agent not initialized'` if not).

**Dependencies:** ARCH-019, ARCH-021
**Effort:** S

---

### ARCH-024 — Implement agent session routing via Express gateway

**Context:** `docs/api-design.md` specifies `GET /api/v1/agent/connect/:sessionId` which
upgrades the connection to WebSocket, routing to the correct Durable Object instance.

**Acceptance Criteria:**

- `GET /api/v1/agent/connect/:sessionId` in `apps/gateway/src/routes/agent.ts`:
  - Requires auth (apply `auth` middleware).
  - Looks up the `ChatSession` in D1 to verify the authenticated user owns it (403 if not).
  - Proxies the WebSocket upgrade request to the Cloudflare Worker's Durable Object using the session ID as the Durable Object name.
- If the `ChatSession` does not exist in D1, creates one (calls `ChatSessionService.create()`) and calls `agent.stub.initialize(repositoryId)` on the newly created Durable Object.
- The Express gateway proxies WebSocket frames bidirectionally using `http-proxy` or `ws`.
- Integration test: mocked D1 and WebSocket upgrade asserts correct proxy target and 403 on unauthorized session.

**Technical Notes:**

- The Cloudflare Worker's agent route follows the pattern `https://<worker-url>/agents/chat/<session-id>`. Configure `WORKER_URL` as an env var in `apps/gateway`.
- Session IDs should be UUIDs matching the D1 `chat_sessions.id`.

**Dependencies:** ARCH-007, ARCH-023
**Effort:** M

---

## Phase 5 — Frontend Migration (Next.js)

> Replaces the Vite React SPA with a Next.js 15 App Router application that supports GitHub OAuth, multi-repo selection, and the new agent connection flow.

---

### ARCH-025 — Scaffold Next.js 15 app in `apps/web`

**Context:** `apps/web` is currently an empty skeleton (ARCH-001). This ticket installs and
configures Next.js 15 with App Router, Tailwind v4, and shared type imports.

**Acceptance Criteria:**

- `apps/web` is a valid Next.js 15 app with `app/` directory (App Router).
- Tailwind CSS v4 is configured via the `@tailwindcss/postcss` plugin.
- `packages/types` is importable as `@gatekeeper/types` inside `apps/web`.
- `shadcn/ui` components are initialized (or Radix UI primitives are available — match current component library from `apps/worker/src/components`).
- `npm run dev` in `apps/web` serves the app on port `3000`.
- TypeScript compiles without errors.
- A placeholder `app/page.tsx` renders "Gatekeeper AI" text.

**Technical Notes:**

- Use `create-next-app` with `--typescript --tailwind --app --src-dir=false` flags, then move into `apps/web`.
- Configure `next.config.ts` with `transpilePackages: ['@gatekeeper/types']`.
- Do not start migrating components in this ticket — only foundation.

**Dependencies:** ARCH-001
**Effort:** S

---

### ARCH-026 — Implement GitHub OAuth login page

**Context:** The current app has no login UI. Users need to authenticate with GitHub before
they can connect repositories or use the chat.

**Acceptance Criteria:**

- `app/page.tsx` (root route) checks for a session cookie. If absent, renders a login page with a "Sign in with GitHub" button.
- Clicking the button redirects to `GET <GATEWAY_URL>/api/v1/auth/github`.
- `app/auth/callback/page.tsx` is a client-side page that reads query params and redirects to `/dashboard` after successful OAuth.
- A `useSession()` React hook reads the user session from a `GET <GATEWAY_URL>/api/v1/me` endpoint and returns `{ user: User | null, isLoading: boolean }`.
- `app/dashboard/layout.tsx` wraps protected routes and redirects to `/` if `useSession()` returns `user: null`.
- Matches the existing dark/light theme from the current SPA (re-uses CSS variables and the `useTheme` hook logic).

**Technical Notes:**

- Store the session as an HTTP-only cookie set by the gateway — the Next.js app reads it via `credentials: 'include'` fetch calls.
- `GET /api/v1/me` should be added to `apps/gateway/src/routes/auth.ts` — returns the authenticated user's profile from D1.

**Dependencies:** ARCH-025, ARCH-005
**Effort:** M

---

### ARCH-027 — Implement repository selector page

**Context:** In the current app, the repo is hardcoded. Users now need to see which repos have
the GitHub App installed and connect them before chatting.

**Acceptance Criteria:**

- `app/dashboard/page.tsx` renders a list of repositories fetched from `GET <GATEWAY_URL>/api/v1/repositories`.
- Each repository card shows: name, `sync_status` (with a spinner for `pending`/`syncing`), and a "Chat" button.
- Clicking "Chat" for a `synced` repository navigates to `/dashboard/chat/[repoId]`.
- Clicking "Chat" for a `pending` repository shows a toast: "Repository sync in progress…".
- A "Connect Repository" button opens a modal with a GitHub App installation URL (fetched from the gateway).
- `sync_status` auto-refreshes every 5 seconds while any repository is in `pending` or `syncing` state (use `setInterval` + SWR or React Query).
- Matches the existing dark/light theme.

**Technical Notes:**

- Use `fetch` with `credentials: 'include'` for all gateway API calls to send the session cookie.
- The installation URL for connecting a new repo is `https://github.com/apps/<APP_SLUG>/installations/new` — expose `APP_SLUG` as `NEXT_PUBLIC_GITHUB_APP_SLUG` in `apps/web/.env.local`.

**Dependencies:** ARCH-025, ARCH-026, ARCH-007
**Effort:** M

---

### ARCH-028 — Migrate chat components to Next.js

**Context:** The chat UI currently lives in `apps/worker/src/components/chat/` (Vite). All
chat components and their hooks must be moved to `apps/web` with minimal changes.

**Acceptance Criteria:**

- The following components are copied (and adapted for Next.js) from `apps/worker`:
  - `ChatInput.tsx`, `MessageList.tsx`, `EmptyState.tsx`
  - `hooks/usePendingToolConfirmation.ts`, `hooks/useTheme.ts`
  - `shared.ts` (APPROVAL constant — source from `packages/types`)
- `useAgentChat` connects via the Express gateway WebSocket (`ws://<GATEWAY_URL>/api/v1/agent/connect/:sessionId`) rather than directly to the Worker.
- Human-in-the-loop tool confirmation flow works identically to the current implementation.
- All tool `executions` confirmation UI renders correctly in Next.js.
- No `localStorage` access during SSR — wrap theme initialization in `useEffect` or `'use client'` guard.

**Technical Notes:**

- `apps/web/app/dashboard/chat/[repoId]/page.tsx` is the chat route — it creates a `ChatSession` via the gateway if one doesn't exist and then renders the chat UI.
- `useAgentChat` from `@cloudflare/ai-chat/react` connects via `useAgent({ agent: 'chat', host: GATEWAY_WS_URL })` — verify the package supports a custom host.
- Add `'use client'` directive to all interactive components.

**Dependencies:** ARCH-024, ARCH-025, ARCH-027
**Effort:** M

---

### ARCH-029 — Implement split-pane layout with issue context and clickable links

**Context:** The current app has a split-pane layout (chat | issue list). The Next.js migration
must recreate this with the `GitHubIssues` and `GitHubIssueDetails` components, and add
clickable external links to GitHub.

**Acceptance Criteria:**

- `app/dashboard/chat/[repoId]/page.tsx` renders a split-pane layout matching the current `app.tsx` (chat on left, issue panel on right).
- `GitHubIssues` and `GitHubIssueDetails` components are migrated from `apps/worker` to `apps/web`.
- Issue list fetches from `GET <GATEWAY_URL>/api/v1/repositories/:repoId/issues` (a new endpoint added to `apps/gateway/src/routes/repositories.ts` that proxies to the GitHub API using the installation token).
- Clicking an issue number inside a chat message opens it in a new tab via `target="_blank" rel="noopener noreferrer"` — the `html_url` is parsed from issue links in assistant message content.
- `TopBar` is migrated and includes repository name display (from the selected repo in state).
- Dark/light theme toggle works.

**Technical Notes:**

- The `GET /api/v1/repositories/:repoId/issues` gateway endpoint calls `getIssues()` from the worker's `github-issues.ts` — extract this helper into `packages/types` or duplicate it in `apps/gateway/src/lib/github-issues.ts`.
- The issue detail modal uses the existing `Modal` component — migrate it as-is.

**Dependencies:** ARCH-028
**Effort:** M

---

## Phase 6 — Observability & Quality

> Adds test coverage for all new services and updates project documentation.

---

### ARCH-030 — Add unit tests for chunking services

**Context:** The three chunking services (ARCH-012, ARCH-013, ARCH-014) have been specified
with their test cases; this ticket implements them fully.

**Acceptance Criteria:**

- `apps/worker/src/lib/chunking/markdown-chunker.test.ts`: ≥6 test cases covering section splitting, parent-header prepending, empty-section filtering.
- `apps/worker/src/lib/chunking/issue-chunker.test.ts`: ≥5 test cases covering 0-comment, N≤30, N>30 paths; mock `ISummarizer`.
- `apps/worker/src/lib/chunking/code-chunker.test.ts`: ≥4 test cases covering function extraction, class extraction, JSON fallback, file-path prepending.
- All tests pass via `npm test` in `apps/worker`.
- Code coverage for chunking services ≥ 90%.

**Dependencies:** ARCH-012, ARCH-013, ARCH-014
**Effort:** M

---

### ARCH-031 — Add unit tests for D1 repository services

**Context:** ARCH-008 through ARCH-011 implement D1 services with constructor-injected D1
mocks. This ticket fills in full test suites for each.

**Acceptance Criteria:**

- Test files co-located with each repository file: `*.repository.test.ts`.
- Each test file uses a `MockD1Database` class (defined once in `apps/worker/tests/helpers/mock-d1.ts`) that accepts pre-set query results.
- `UserRepository`: findById (found, not found), findByGitHubId.
- `RepositoryRepository`: findById, updateSyncStatus (valid enum, invalid enum throws).
- `ChatSessionRepository`: create, findById, updateTitle.
- `SyncEventRepository`: create, updateStatus, findByRepository.
- All tests pass; coverage ≥ 80%.

**Dependencies:** ARCH-008, ARCH-009, ARCH-010, ARCH-011
**Effort:** M

---

### ARCH-032 — Add integration tests for webhook endpoint

**Context:** The webhook endpoint (ARCH-006) has complex security and async behavior. Integration
tests are needed to assert signature validation and correct Workflow triggering.

**Acceptance Criteria:**

- `apps/gateway/src/routes/webhooks.test.ts` uses `supertest` to test the Express router directly.
- Tests cover: valid `push` event (202 + Workflow called), invalid signature (401), missing signature (401), unknown event type (202 + no Workflow called), `issues` event (202 + ISSUE_SYNC Workflow).
- `IWorkflowClient` and `ISyncEventService` are mocked via constructor injection (no module patching).
- All tests pass via `npm test` in `apps/gateway`.

**Dependencies:** ARCH-006
**Effort:** M

---

### ARCH-033 — Add unit tests for VectorizeService and `searchCodebase` tool

**Context:** VectorizeService (ARCH-015) and the RAG tool (ARCH-020) are core to the new
architecture's value proposition. They must be thoroughly tested.

**Acceptance Criteria:**

- `apps/worker/src/lib/vectorize.service.test.ts`: ≥5 tests — upsert batching at 100, search pre-filtering by `repository_id`, empty result handling, delete by IDs, query transformation (abbreviation expansion).
- `apps/worker/src/tools.test.ts` (new tests for `searchCodebase`): mock `IVectorizeService` returning 2 results; assert `<context>` XML format; assert `state.contextReferences` is updated; assert empty-result case.
- Coverage ≥ 90% for `vectorize.service.ts` and the `searchCodebase` tool execute function.

**Dependencies:** ARCH-015, ARCH-020
**Effort:** M

---

### ARCH-034 — Update Cold Start Workflow integration test

**Context:** ARCH-016 has unit tests per step; a higher-level integration test should verify
the full step sequence and status transitions.

**Acceptance Criteria:**

- `apps/worker/src/workflows/ingestion.workflow.test.ts` tests the `COLD_START` event:
  - All 6 steps execute in order.
  - `RepositoryRepository.updateSyncStatus` is called with `'syncing'` then `'synced'`.
  - `SyncEventRepository.updateStatus` is called with `'running'` then `'completed'`.
  - On simulated step failure, `updateSyncStatus` is called with `'failed'`.
- Uses mock implementations of all injected services.
- All tests pass.

**Dependencies:** ARCH-016, ARCH-030, ARCH-031
**Effort:** M

---

### ARCH-035 — Update `docs/` and `.github/copilot-instructions.md` for new architecture

**Context:** `docs/system-archtecture.md` sections 1–3 are missing; `.github/copilot-instructions.md` still describes the old single-worker architecture. Both must be updated to reflect the final state after all ARCH tickets are implemented.

**Acceptance Criteria:**

- `docs/system-archtecture.md` sections 1–3 are added:
  - Section 1: Executive summary of the three-layer architecture.
  - Section 2: System diagram (text-based, showing `apps/web → apps/gateway → apps/worker → GitHub API / Vectorize / D1 / Workflows`).
  - Section 3: Environment setup and local development guide (monorepo commands, required env vars per app, Wrangler local dev for D1/Vectorize/Workflows).
- `.github/copilot-instructions.md` is updated:
  - Tech stack table includes Express.js, Next.js 15, D1, Vectorize, Cloudflare Workflows.
  - Architecture overview section reflects the three-app monorepo structure.
  - New Cloudflare bindings are listed (VECTORIZE, DB, INGESTION_WORKFLOW).
  - New canonical dev commands include `turbo dev` and per-app `npm run dev`.
- `AGENTS.md` is updated with correct test commands (replacing any remaining `pnpm` references).

**Dependencies:** All previous phases (this is the final ticket).
**Effort:** S

---

## Dependency Graph (summary)

```
Phase 0:  ARCH-001 → ARCH-002, ARCH-003
Phase 1:  ARCH-004 → ARCH-005, ARCH-006, ARCH-007
Phase 2:  ARCH-002 + ARCH-001 → ARCH-008, ARCH-009, ARCH-010, ARCH-011
Phase 3:  ARCH-003 → ARCH-012, ARCH-013, ARCH-014, ARCH-015
          ARCH-009/011/012/013/014/015 → ARCH-016
          ARCH-015/016 → ARCH-017
          ARCH-016 → ARCH-018
Phase 4:  ARCH-009 → ARCH-019
          ARCH-015/019 → ARCH-020
          ARCH-009/019 → ARCH-021
          ARCH-013/020 → ARCH-022
          ARCH-019/021 → ARCH-023
          ARCH-007/023 → ARCH-024
Phase 5:  ARCH-001 → ARCH-025
          ARCH-025/005 → ARCH-026
          ARCH-025/026/007 → ARCH-027
          ARCH-024/025/027 → ARCH-028
          ARCH-028 → ARCH-029
Phase 6:  ARCH-012/013/014 → ARCH-030
          ARCH-008/.../011 → ARCH-031
          ARCH-006 → ARCH-032
          ARCH-015/020 → ARCH-033
          ARCH-016/030/031 → ARCH-034
          All → ARCH-035
```

## Effort Summary

| Effort    | Count  | Tickets                                                                                                                |
| --------- | ------ | ---------------------------------------------------------------------------------------------------------------------- |
| S (< 2 h) | 13     | ARCH-002, 003, 008, 009, 010, 011, 018, 023, 025, 018, 023, 025, 035                                                   |
| M (2–4 h) | 19     | ARCH-001, 004, 005, 006, 007, 012, 013, 015, 017, 019, 020, 021, 022, 024, 026, 027, 028, 029, 030, 031, 032, 033, 034 |
| L (> 4 h) | 2      | ARCH-014, ARCH-016                                                                                                     |
| **Total** | **35** |                                                                                                                        |
