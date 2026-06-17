# Gatekeeper AI: RAG & Chunking Strategy

## 1. Core Philosophy

Our RAG (Retrieval-Augmented Generation) pipeline must respect the semantic boundaries of the data. Naive character-count splitting (e.g., splitting every 1000 characters) will break code logic in half and sever issue descriptions from their resolutions. We will use a **Semantic & Structural Chunking Strategy**.

## 2. Ingestion & Chunking Rules

### A. Source Code Chunking (AST-Based)

Code is strictly hierarchical. We will use **Tree-sitter** (an Abstract Syntax Tree parser) to parse the code before chunking.

- **The Rule:** Chunk by structural nodes: `Functions`, `Classes`, and `Interfaces`.
- **Context Preservation:** A chunk containing a function must automatically prepend the file path, the class it belongs to, and any inline documentation (docstrings).
- **Fallback:** If a file is purely configuration (e.g., a massive JSON or YAML file), we chunk by top-level keys.

### B. Issues & Pull Requests (Conversational Chunking)

Issues contain an initial description followed by a chronological thread of comments.

- **The Rule:** The first chunk of an issue is always the **Original Post (OP) + Issue Metadata** (Status, Labels, Author).
- **Thread Chunking:** For long comment threads, we use a "Sliding Window" approach. We group comments by time or logical resolution steps, ensuring overlapping context (e.g., Comments 1-5, Comments 4-8) so the LLM doesn't miss the transition from "debugging" to "solution."
- **Summarization:** If an issue has >30 comments, the Cloudflare Workflow will use a cheaper, fast LLM (like Claude Haiku or Llama 3) to generate a "Thread Summary" and embed _that_ summary instead of all 30 individual comments.

### C. Markdown & Documentation (.md, .github templates)

- **The Rule:** Chunk strictly by Markdown Headers (`##`, `###`). The parent header is prepended to the chunk so the LLM knows what section it's looking at.

---

## 3. Metadata Schema (Crucial for Cloudflare Vectorize)

To prevent cross-tenant data leaks and improve search relevance, every embedded chunk MUST include this exact metadata payload:

```json
{
  "repository_id": "uuid", // STRICTLY REQUIRED FOR MULTI-TENANCY
  "type": "code | issue | template | doc",
  "file_path": "src/utils/auth.ts", // (If code/doc)
  "issue_number": 42, // (If issue)
  "issue_state": "open | closed", // (If issue)
  "labels": ["bug", "p1"], // (If issue)
  "language": "typescript" // (If code)
}
```

---

## 4. The Retrieval Strategy (Search)

When a user asks: _"Is there an open bug for the auth timeout?"_

1. **Query Transformation:** The Agent does not just search the raw user query. It transforms it into an optimized search vector: `"authentication timeout database connection bug"`.
2. **Pre-Filtering (Vectorize):** The search query strictly filters by `repository_id = "user_current_repo"` AND `type = "issue"`.
3. **Hybrid Search:** (If supported by Cloudflare Vectorize in the future, otherwise Semantic) We retrieve the top 5 most semantically similar chunks.
4. **Context Injection:** The retrieved chunks are formatted into an XML-like block `<context>...</context>` and fed to the LLM to generate the final response.
