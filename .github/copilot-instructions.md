# Gatekeeper AI — Copilot Instructions

## Project Overview

**Gatekeeper AI** is a context-aware GitHub Issue Manager built as a Cloudflare Worker.
It exposes a chat interface (React SPA) that lets users create, search, edit, and close
GitHub issues through an AI agent. The agent enforces issue templates, prevents duplicates
via semantic search, and suggests labels — acting as a "Triage Gate" before anything hits
the backlog.

---

## Tech Stack & Commands

| Concern         | Tool                                                           |
| --------------- | -------------------------------------------------------------- |
| Runtime         | Cloudflare Workers (edge, no Node built-ins unless polyfilled) |
| AI Agent        | `@cloudflare/ai-chat` (`AIChatAgent`) + `agents` SDK           |
| LLM             | Google Gemini 2.5 Flash via `@ai-sdk/google`                   |
| Frontend        | React 19 + Tailwind v4, bundled by Vite                        |
| GitHub API      | Raw `fetch` calls + `octokit`-style token auth                 |
| Package manager | **`npm`** only — never `pnpm` or `yarn`                        |
| Deployment      | `wrangler`                                                     |

### Canonical scripts

```bash
npm run dev          # Vite + Wrangler local dev
npm run deploy       # vite build && wrangler deploy
npm run check        # prettier + biome lint + tsc (run before every commit)
npm run lint         # eslint only
npm exec tsc --noEmit  # type-check without emit
npm test             # vitest
```

---

## Architecture Overview

```
Browser (React SPA)
  └─► Cloudflare Worker  (src/server.ts)
        ├─ GET /api/github-issues        → fetches open issues
        ├─ GET /api/repository-info      → repo metadata
        └─ * (agent routes)  ──────────► Chat (AIChatAgent Durable Object)
                                            ├─ onChatMessage() — streams via Gemini
                                            └─ tools.ts — 8 callable GitHub tools
                                                └─ src/lib/github-issues.ts
```

### Key source files

| File                       | Purpose                                                               |
| -------------------------- | --------------------------------------------------------------------- |
| `src/server.ts`            | Worker entry point; `Chat` class (extends `AIChatAgent`)              |
| `src/tools.ts`             | All AI tool definitions + `executions` (confirmation-required tools)  |
| `src/shared.ts`            | Shared constants (`APPROVAL`) between frontend & backend              |
| `src/lib/prompts.ts`       | `SYSTEM_PROMPT`, `TOOL_DESCRIPTIONS`, `ISSUE_BODY_GUIDELINES`         |
| `src/lib/github-issues.ts` | GitHub REST helpers (create/edit/close/search/comment)                |
| `src/lib/interfaces.ts`    | All shared TypeScript interfaces (`GitHubIssue`, `RepositoryData`, …) |
| `src/lib/github-utils.ts`  | Utility: parse `owner/repo` from `env.GITHUB_REPO_URL`                |
| `src/app.tsx`              | React root — chat UI layout                                           |

> **Before modifying `src/server.ts`**, read `docs/system-archtecture.md` to understand
> the current agent state-machine and data-flow.

---

## Ubiquitous Language

Use these terms consistently in code, comments, and commit messages:

| Term                   | Meaning                                                                  |
| ---------------------- | ------------------------------------------------------------------------ |
| **Gatekeeper / Agent** | The `AIChatAgent` Durable Object that talks to the user                  |
| **Triage Gate**        | The step where the Agent validates an issue draft against a template     |
| **Semantic Duplicate** | An issue expressing the same intent as an existing one (different words) |
| **Cold Start**         | Heavy one-time ingestion when a repo is first connected                  |
| **Delta Sync**         | Lightweight webhook-triggered update to keep context fresh               |
| **Tool Call**          | An autonomous `@callable` action (e.g., `searchIssuesForGithubRepo`)     |
| **Context Chunk**      | A 500–1000-token fragment of code/text stored in the vector DB           |

---

## Design Principles

### 1. Dependency Injection

Every class that touches an external system receives dependencies via the constructor,
typed as interfaces. Never `new ConcreteService()` inside a class body.

```typescript
interface IGitHubService {
  createIssue(params: CreateIssueParams): Promise<CreateIssueResponse>;
}

export class TriageService {
  constructor(private readonly github: IGitHubService) {}

  async triage(params: CreateIssueParams): Promise<CreateIssueResponse> {
    return this.github.createIssue(params);
  }
}
```

### 2. OOP Structure + Functional Methods

- Group related behaviour into **classes**; inject deps through the constructor.
- Write methods functionally: prefer `map`, `filter`, `reduce`, `flatMap` over `for` loops.
- Keep methods short and pure; extract complex logic into small named `private` helpers.

### 3. Immutability

- All class fields and interface properties must be `readonly`.
- Never mutate function arguments — return new objects/arrays via spread or non-mutating methods.
- Use `as const` for fixed-value lookup objects.
- Forbidden in-place mutators: `push`, `splice`, `sort` (without a copy), `delete obj[key]`.

---

## TypeScript Standards

- **`strict: true`** is on. **Never use `any`**; use `unknown` if a type is truly uncertain.
- Every function **must** have an explicit return type annotation.
- Prefer **`interface`** over `type` for object shapes.
- Use **`as const`** for literal-type objects.
- Use **`async/await`**; avoid `.then()` chains.

---

## Style Guide

- **Indentation:** 2 spaces
- **Quotes:** single `'`
- **Semicolons:** always required
- **Line length:** max 100 characters

### Naming

| Entity                | Convention         | Example           |
| --------------------- | ------------------ | ----------------- |
| Types / Interfaces    | `PascalCase`       | `GitHubIssue`     |
| Functions / Variables | `camelCase`        | `processWebhook`  |
| Constants             | `UPPER_SNAKE_CASE` | `MAX_RETRIES`     |
| Files                 | `kebab-case.ts`    | `github-utils.ts` |

---

## Testing

- **Framework:** Vitest (`npm test`)
- **Pattern:** Arrange → Act → Assert
- **Mocking:** pass mock objects directly to constructors (DI) — avoid `vi.mock` module patching
- **Co-location:** `MyModule.test.ts` lives next to `MyModule.ts`
- **Coverage targets:** 80 %+ on services/controllers, 90 %+ on utilities

```typescript
describe("TriageService", () => {
  it("rejects vague issue titles", async () => {
    // Arrange
    const mockGitHub: IGitHubService = {
      createIssue: vi.fn()
    };
    const service = new TriageService(mockGitHub);

    // Act & Assert
    await expect(service.triage({ title: "bug", body: "" })).rejects.toThrow();
    expect(mockGitHub.createIssue).not.toHaveBeenCalled();
  });
});
```

Add or update tests for every code change, even if not asked.

---

## Agent Behavioural Rules

1. **Architecture first:** Read `docs/system-archtecture.md` before editing `src/server.ts`.
2. **State safety:** When writing to `this.state.storage` in an `AIChatAgent`, always await
   the write and handle errors — state is persisted in a Durable Object SQLite.
3. **GitHub auth:** Use `env.GITHUB_TOKEN` via the authenticated helper functions in
   `src/lib/github-issues.ts`. Never hard-code tokens.
4. **Tool confirmations:** Tools that mutate state (`createTicketForGithubRepo`,
   `editTicketForGithubRepo`, `closeTicketForGithubRepo`, `addCommentToGithubIssue`) require
   human-in-the-loop confirmation — they are defined in `tools.ts` without `execute` and
   have their execution logic in the `executions` map.
5. **Prompts:** All system prompts and tool descriptions live in `src/lib/prompts.ts`.
   Do not inline prompt strings in other files.

---

## No-Go Zones

- **Do not** modify `tsconfig.json` without explicit permission.
- **Do not** change the `name` or `compatibility_date` in `wrangler.jsonc`.
- **Do not** add packages that use Node.js built-ins unavailable on the Cloudflare Workers
  edge runtime (e.g., `fs`, `net`, `child_process`).
- **Do not** call `console.log` in production paths — use `src/lib/logger.ts`.
