import type {
  IAIBinding,
  IVectorizeIndex,
  IVectorizeService,
  IVectorizeVector,
  VectorDocument,
  VectorDocumentMetadata,
  VectorSearchFilter,
} from '@gatekeeper/types';

const UPSERT_BATCH_SIZE = 100;
const TOP_K = 5;
const EMBEDDING_MODEL = '@cf/baai/bge-base-en-v1.5';

const ABBREVIATION_MAP: Record<string, string> = {
  auth: 'authentication authorization',
  authn: 'authentication',
  authz: 'authorization',
  db: 'database',
  api: 'application programming interface',
  ui: 'user interface',
  ux: 'user experience',
  repo: 'repository',
  pr: 'pull request',
  ci: 'continuous integration',
  cd: 'continuous deployment',
  env: 'environment',
} as const;

export class VectorizeService implements IVectorizeService {
  constructor(
    private readonly vectorize: IVectorizeIndex,
    private readonly ai: IAIBinding,
  ) {}

  async upsert(docs: VectorDocument[]): Promise<void> {
    const batches = this.toBatches(docs, UPSERT_BATCH_SIZE);

    for (const batch of batches) {
      const texts = batch.map((d) => d.text);
      const embeddings = await this.embed(texts);
      const vectors = batch.map((doc, i) => this.buildVector(doc, embeddings[i] as number[], i));
      await this.vectorize.upsert(vectors);
    }
  }

  async search(query: string, filter: VectorSearchFilter): Promise<VectorDocument[]> {
    const transformed = this.transformQuery(query);
    const embeddings = await this.embed([transformed]);
    const queryVector = embeddings[0] as number[];

    const vectorizeFilter = this.buildFilter(filter);
    const result = await this.vectorize.query(queryVector, {
      topK: TOP_K,
      filter: vectorizeFilter,
      returnMetadata: 'all',
    });

    return result.matches.flatMap((match) =>
      match.metadata ? [this.reconstructDocument(match.metadata)] : [],
    );
  }

  async delete(ids: string[]): Promise<void> {
    await this.vectorize.deleteByIds(ids);
  }

  private buildVector(doc: VectorDocument, values: number[], chunkIndex: number): IVectorizeVector {
    const pathSegment =
      doc.metadata.file_path ??
      (doc.metadata.issue_number !== undefined ? String(doc.metadata.issue_number) : 'unknown');

    const id = [
      encodeURIComponent(doc.metadata.repository_id),
      encodeURIComponent(pathSegment),
      String(chunkIndex),
    ].join(':');

    const metadata: Record<string, unknown> = {
      repository_id: doc.metadata.repository_id,
      type: doc.metadata.type,
      content: doc.text,
    };

    if (doc.metadata.file_path !== undefined) metadata['file_path'] = doc.metadata.file_path;
    if (doc.metadata.issue_number !== undefined) metadata['issue_number'] = doc.metadata.issue_number;
    if (doc.metadata.issue_state !== undefined) metadata['issue_state'] = doc.metadata.issue_state;
    if (doc.metadata.labels !== undefined) metadata['labels'] = doc.metadata.labels;
    if (doc.metadata.language !== undefined) metadata['language'] = doc.metadata.language;

    return { id, values, metadata };
  }

  private buildFilter(filter: VectorSearchFilter): Record<string, unknown> {
    const vectorizeFilter: Record<string, unknown> = {
      repository_id: { $eq: filter.repository_id },
    };

    if (filter.type !== undefined) {
      vectorizeFilter['type'] = { $eq: filter.type };
    }

    return vectorizeFilter;
  }

  private reconstructDocument(meta: Record<string, unknown>): VectorDocument {
    const text = String(meta['content'] ?? '');

    const metadata: VectorDocumentMetadata = {
      repository_id: String(meta['repository_id'] ?? ''),
      type: (meta['type'] as VectorDocumentMetadata['type']) ?? 'doc',
      ...(meta['file_path'] !== undefined && { file_path: String(meta['file_path']) }),
      ...(meta['issue_number'] !== undefined && { issue_number: Number(meta['issue_number']) }),
      ...(meta['issue_state'] !== undefined && {
        issue_state: meta['issue_state'] as VectorDocumentMetadata['issue_state'],
      }),
      ...(Array.isArray(meta['labels']) && { labels: meta['labels'] as string[] }),
      ...(meta['language'] !== undefined && { language: String(meta['language']) }),
    };

    return { text, metadata };
  }

  private transformQuery(query: string): string {
    const lowercased = query.toLowerCase();
    const stripped = lowercased.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();

    return stripped
      .split(' ')
      .flatMap((word) => {
        const expansion = ABBREVIATION_MAP[word];
        return expansion !== undefined ? expansion.split(' ') : [word];
      })
      .join(' ');
  }

  private async embed(texts: string[]): Promise<number[][]> {
    const response = await this.ai.run(EMBEDDING_MODEL, { text: texts });
    return response.data as number[][];
  }

  private toBatches<T>(items: T[], size: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
      batches.push(items.slice(i, i + size));
    }
    return batches;
  }
}
