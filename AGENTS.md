# AGENTS.md — Project Governance & Intelligence

> **Role:** You are an expert Cloudflare Workers and GitHub App developer. You are helping maintain the **Gatekeeper AI** system.

## 🎯 System Mission

Issue Arcitect AI is a GitHub App powered by Cloudflare Agents. Its primary job is to automate repository management (like filling out `ISSUE_TEMPLATE.md` and triaging logs) using the Cloudflare `agents-sdk`.

---

## 🛠 Tech Stack & Commands

- **Runtime:** Node.js (via Cloudflare Workers)
- **Frameworks:** Cloudflare Agents (`agents-sdk`), GitHub Apps (`octokit`)
- **Package Manager:** `npm` (Never use `pnpm` or `yarn`)
- **Deployment:** `wrangler`

### Canonical Commands

- **Dev:** `npm run dev` (Wrangler local development)
- **Deploy:** `npm run deploy` (Deploy to Cloudflare)
- **Lint:** `npm run lint` / `npm run format`
- **Type Check:** `npm exec tsc --noEmit`

---

## 📜 Coding Standards (Non-Negotiable)

## Design Principles

### 1. Dependency Injection

- Every class that calls an external system (graph DB, GitHub API, filesystem) **receives its dependencies through the constructor**, typed as interfaces.
- Never call `new ConcreteService()` inside a class body — always inject from outside.
- Define a `I<ServiceName>` interface for every injectable dependency.
- Tests pass mock objects that satisfy the interface — no module-level patching needed.

```typescript
interface IGitHubService {
  createBranch(params: CreateBranchParams): Promise<Branch>;
}

export class SimulationService {
  constructor(private readonly github: IGitHubService) {}

  async start(params: CreateBranchParams): Promise<Branch> {
    return this.github.createBranch(params);
  }
}
```

### 2. OOP Structure + Functional Method Style

- Use **classes** to group related behaviour and encapsulate dependencies (OOP).
- Write **methods** in a functional style — prefer `map`, `filter`, `reduce`, `flatMap` over imperative loops.
- Keep methods short and pure where possible; extract complex logic into small named private helpers.
- Compose helpers rather than writing deep method chains or nested ternaries.

### 3. Immutability

- All class fields and interface properties must be `readonly`.
- Never mutate function arguments — return new objects/arrays via spread or non-mutating array methods.
- Use `as const` for fixed-value lookup objects.
- Avoid in-place mutators: `push`, `splice`, `sort` (without copy), `delete obj[key]`.

---

## Testing Instructions

- Framework: Vitest with React Testing Library
- Follow AAA pattern: Arrange, Act, Assert
- Mock external dependencies by passing mock implementations to constructors (dependency injection) — avoid patching modules with `vi.mock` unless absolutely necessary
- Co-locate tests: `Component.test.tsx` next to `Component.tsx`
- Target: 80%+ coverage on controllers, 90%+ on utilities

**DI mocking example:**

```typescript
// Define interface
interface IGraphService {
  queryConflicts(simId: string): Promise<RawConflict[]>;
}

// Test — inject mock directly; no module patching needed
describe("ConflictAnalyser", () => {
  it("filters out soft conflicts", async () => {
    // Arrange
    const mockGraph: IGraphService = {
      queryConflicts: vi.fn().mockResolvedValue([
        { id: "1", type: "HARD", msg: "Room overlap", severity: 10 },
        { id: "2", type: "SOFT", msg: "Gap too large", severity: 2 }
      ])
    };
    const analyser = new ConflictAnalyser(mockGraph);

    // Act
    const result = await analyser.findConflicts("sim-1");

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("1");
  });
});
```

```bash
pnpm test              # Run all tests
pnpm test --watch      # Watch mode
pnpm test --coverage   # With coverage report
pnpm vitest run -t "<test name>"  # Run specific test
```

Add or update tests for any code you change, even if not explicitly asked.

---

### TypeScript & Logic

- **Strictness:** `strict: true` is enabled. **Never use `any**`. Use `unknown` if a type is truly uncertain.
- **Return Types:** Every function **must** have an explicit return type.
- **Data Structures:** Prefer `interface` over `type` for object definitions.
- **Literals:** Use `as const` assertions for literal types to ensure type safety.
- **Asynchronous Flow:** Use `async/await`. Avoid `.then()` blocks.

### Style Guide

- **Indentation:** 2 spaces.
- **Quotes:** Single quotes `'` only.
- **Semicolons:** Always required.
- **Line Length:** Max 100 characters.

### Naming Conventions

| Entity                    | Convention         | Example           |
| ------------------------- | ------------------ | ----------------- |
| **Types / Interfaces**    | `PascalCase`       | `GitHubEvent`     |
| **Functions / Variables** | `camelCase`        | `processWebhook`  |
| **Constants**             | `UPPER_SNAKE_CASE` | `MAX_RETRIES`     |
| **Files**                 | `kebab-case.ts`    | `github-logic.ts` |

---

## 🤖 Agent Instructions (Behavioral)

1. **Context Check:** Before modifying `src/index.ts`, always read `docs/architecture.md` to understand the current state-machine logic.
2. **State Management:** When using Cloudflare Agents, remember that state is persisted. Ensure you handle `this.state.storage` updates safely.
3. **GitHub Auth:** Use the authenticated `octokit` instance; never attempt to hardcode tokens.
4. **Step-by-Step:** For complex features, update `docs/architecture.md` first, then implement.

---

## 🚫 No-Go Zones

- Do not modify `tsconfig.json` without explicit permission.
- Do not change the `name` or `compatibility_date` in `wrangler.toml`.
- Do not add external dependencies unless they are compatible with Cloudflare Workers (Edge runtime).
