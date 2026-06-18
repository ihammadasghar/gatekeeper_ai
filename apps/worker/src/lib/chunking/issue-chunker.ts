import type { IChunker, IssueChunkMetadata, IssueInput, VectorDocument } from '@gatekeeper/types';

const WINDOW_SIZE = 5;
const WINDOW_STEP = 4; // 1-comment overlap

export type SummarizeThread = (comments: string[]) => Promise<string>;

const defaultSummarizeThread: SummarizeThread = async (comments) => comments.join('\n\n');

export class IssueChunker implements IChunker<IssueInput, IssueChunkMetadata> {
  constructor(private readonly summarizeThread: SummarizeThread = defaultSummarizeThread) {}

  async chunk(issue: IssueInput, metadata: IssueChunkMetadata): Promise<VectorDocument[]> {
    const opChunk = this.buildOpChunk(issue, metadata);
    const threadChunks = await this.buildThreadChunks(issue, metadata);
    return [opChunk, ...threadChunks];
  }

  private buildOpChunk(issue: IssueInput, metadata: IssueChunkMetadata): VectorDocument {
    const labelList = issue.labels.length > 0 ? issue.labels.join(', ') : 'none';
    const text = `#${issue.number}: ${issue.title}\nStatus: ${issue.state}\nLabels: ${labelList}\n\n${issue.body}`;

    return {
      text,
      metadata: this.buildMetadata(issue, metadata),
    };
  }

  private async buildThreadChunks(
    issue: IssueInput,
    metadata: IssueChunkMetadata,
  ): Promise<VectorDocument[]> {
    const comments = issue.comments as string[];

    if (comments.length === 0) {
      return [];
    }

    if (comments.length > 30) {
      const summary = await this.summarizeThread(comments);
      return [
        {
          text: summary,
          metadata: this.buildMetadata(issue, metadata),
        },
      ];
    }

    return this.buildSlidingWindowChunks(comments, issue, metadata);
  }

  private buildSlidingWindowChunks(
    comments: readonly string[],
    issue: IssueInput,
    metadata: IssueChunkMetadata,
  ): VectorDocument[] {
    const windows: VectorDocument[] = [];

    for (let start = 0; start < comments.length; start += WINDOW_STEP) {
      const windowComments = comments.slice(start, start + WINDOW_SIZE);
      const end = Math.min(start + WINDOW_SIZE, comments.length);
      const text = `Comments ${start + 1}–${end}:\n\n${windowComments.join('\n\n')}`;

      windows.push({
        text,
        metadata: this.buildMetadata(issue, metadata),
      });
    }

    return windows;
  }

  private buildMetadata(
    issue: IssueInput,
    metadata: IssueChunkMetadata,
  ): VectorDocument['metadata'] {
    return {
      repository_id: metadata.repository_id,
      type: 'issue',
      issue_number: issue.number,
      issue_state: issue.state,
      labels: issue.labels,
    };
  }
}
