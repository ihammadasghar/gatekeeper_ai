import type { VectorDocumentMetadata } from './chunking';

export interface IVectorizeVector {
  readonly id: string;
  readonly values: number[];
  readonly metadata?: Record<string, unknown>;
}

export interface IVectorizeMatch {
  readonly id: string;
  readonly score: number;
  readonly metadata?: Record<string, unknown>;
}

export interface IVectorizeIndex {
  upsert(vectors: IVectorizeVector[]): Promise<unknown>;
  query(
    vector: number[],
    options: {
      readonly topK: number;
      readonly filter?: Record<string, unknown>;
      readonly returnMetadata?: string;
    },
  ): Promise<{ readonly matches: readonly IVectorizeMatch[] }>;
  deleteByIds(ids: string[]): Promise<unknown>;
}

export interface IAIBinding {
  run(model: string, options: { readonly text: readonly string[] }): Promise<{ readonly data: readonly (readonly number[])[] }>;
}

export interface VectorSearchFilter {
  readonly repository_id: string;
  readonly type?: VectorDocumentMetadata['type'];
}

export interface IVectorizeService {
  upsert(docs: import('./chunking').VectorDocument[]): Promise<void>;
  search(query: string, filter: VectorSearchFilter): Promise<import('./chunking').VectorDocument[]>;
  delete(ids: string[]): Promise<void>;
}
