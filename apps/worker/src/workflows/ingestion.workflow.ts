import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep
} from "cloudflare:workers";
import { DeltaSyncRunner, type DeltaSyncPayload } from './delta-sync.runner';
import { LabelSyncRunner, type LabelSyncPayload, type IGitHubLabelService } from './label-sync.runner';
import { VectorizeService } from '../lib/vectorize.service';
import { D1SyncEventRepository } from '../repositories/sync-event.repository';
import { D1RepositoryLabelRepository } from '../repositories/repository-label.repository';
import { MarkdownChunker } from '../lib/chunking/markdown-chunker';
import type { CommitFile, IGitHubFileService } from './delta-sync.runner';
import type { IVectorizeIndex, IAIBinding, LabelInput } from '@gatekeeper/types';
import type { ID1Database } from '../repositories/user.repository';

// ── Concrete GitHub service implementations ───────────────────────────────────

class GitHubFileService implements IGitHubFileService {
  constructor(private readonly token: string) {}

  async getCommitFiles(owner: string, repo: string, sha: string): Promise<CommitFile[]> {
    const url = `https://api.github.com/repos/${owner}/${repo}/commits/${sha}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'gatekeeper-ai',
      },
    });

    if (!response.ok) return [];

    const data = await response.json() as { files?: CommitFile[] };
    return data.files ?? [];
  }

  async getFileContent(
    owner: string,
    repo: string,
    filePath: string,
    ref: string,
  ): Promise<string | null> {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}?ref=${ref}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'gatekeeper-ai',
      },
    });

    if (!response.ok) return null;

    const data = await response.json() as { content?: string; encoding?: string };
    if (data.encoding !== 'base64' || !data.content) return null;

    return atob(data.content.replace(/\n/g, ''));
  }
}

class GitHubLabelService implements IGitHubLabelService {
  constructor(private readonly token: string) {}

  async fetchAllLabels(owner: string, repo: string): Promise<LabelInput[]> {
    const labels: LabelInput[] = [];
    let page = 1;

    while (true) {
      const url = `https://api.github.com/repos/${owner}/${repo}/labels?per_page=100&page=${page}`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'gatekeeper-ai',
        },
      });

      if (!response.ok) break;

      const page_labels = await response.json() as Array<{ name: string; color: string; description: string | null }>;
      labels.push(...page_labels.map((l) => ({ name: l.name, color: l.color, description: l.description })));

      if (page_labels.length < 100) break;
      page++;
    }

    return labels;
  }
}

// ── Workflow payload (discriminated union) ────────────────────────────────────

type IngestionWorkflowPayload =
  | ({ readonly event_type: 'DELTA_SYNC' } & DeltaSyncPayload & { readonly syncEventId: string })
  | ({ readonly event_type: 'LABEL_SYNC' } & LabelSyncPayload);

/**
 * Cloudflare Workflow that handles DELTA_SYNC and LABEL_SYNC events.
 * Business logic lives in DeltaSyncRunner / LabelSyncRunner (injectable, testable).
 */
export class IngestionWorkflow extends WorkflowEntrypoint<Env, IngestionWorkflowPayload> {
  async run(
    event: WorkflowEvent<IngestionWorkflowPayload>,
    step: WorkflowStep
  ): Promise<void> {
    const db = this.env.DB as unknown as ID1Database;

    if (event.payload.event_type === 'DELTA_SYNC') {
      const { syncEventId, event_type: _, ...payload } = event.payload;

      const runner = new DeltaSyncRunner(
        new VectorizeService(
          this.env.VECTORIZE as unknown as IVectorizeIndex,
          this.env.AI as unknown as IAIBinding,
        ),
        new D1SyncEventRepository(db),
        new GitHubFileService(this.env.GITHUB_TOKEN),
        new MarkdownChunker(),
      );

      await runner.run(step, payload, syncEventId);
      return;
    }

    if (event.payload.event_type === 'LABEL_SYNC') {
      const runner = new LabelSyncRunner(
        new D1RepositoryLabelRepository(db),
        new D1SyncEventRepository(db),
        new GitHubLabelService(this.env.GITHUB_TOKEN),
      );

      await runner.run(step, event.payload);
    }
  }
}

