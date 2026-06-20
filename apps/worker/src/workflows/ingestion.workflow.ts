import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep
} from "cloudflare:workers";
import { DeltaSyncRunner, type DeltaSyncPayload } from './delta-sync.runner';
import { VectorizeService } from '../lib/vectorize.service';
import { D1SyncEventRepository } from '../repositories/sync-event.repository';
import { MarkdownChunker } from '../lib/chunking/markdown-chunker';
import type { CommitFile, IGitHubFileService } from './delta-sync.runner';
import type { IVectorizeIndex, IAIBinding } from '@gatekeeper/types';
import type { ID1Database } from '../repositories/user.repository';

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

interface DeltaSyncWorkflowPayload extends DeltaSyncPayload {
  readonly syncEventId: string;
}

/**
 * Cloudflare Workflow that handles DELTA_SYNC events triggered by GitHub push webhooks.
 * Business logic lives in DeltaSyncRunner (injectable, testable).
 */
export class IngestionWorkflow extends WorkflowEntrypoint<Env, DeltaSyncWorkflowPayload> {
  async run(
    event: WorkflowEvent<DeltaSyncWorkflowPayload>,
    step: WorkflowStep
  ): Promise<void> {
    const { syncEventId, ...payload } = event.payload;

    const runner = new DeltaSyncRunner(
      new VectorizeService(this.env.VECTORIZE as unknown as IVectorizeIndex, this.env.AI as unknown as IAIBinding),
      new D1SyncEventRepository(this.env.DB as unknown as ID1Database),
      new GitHubFileService(this.env.GITHUB_TOKEN),
      new MarkdownChunker(),
    );

    await runner.run(step, payload, syncEventId);
  }
}

