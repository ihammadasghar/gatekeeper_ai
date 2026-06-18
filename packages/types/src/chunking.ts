export interface VectorDocumentMetadata {
  readonly repository_id: string;
  readonly type: 'code' | 'issue' | 'template' | 'doc';
  readonly file_path?: string;
  readonly issue_number?: number;
  readonly issue_state?: 'open' | 'closed';
  readonly labels?: readonly string[];
  readonly language?: string;
}

export interface VectorDocument {
  readonly text: string;
  readonly metadata: VectorDocumentMetadata;
}

export interface ChunkMetadata {
  readonly repository_id: string;
  readonly type: 'doc' | 'template';
  readonly file_path: string;
}

export interface IssueInput {
  readonly number: number;
  readonly title: string;
  readonly state: 'open' | 'closed';
  readonly labels: readonly string[];
  readonly body: string;
  readonly comments: readonly string[];
}

export interface IssueChunkMetadata {
  readonly repository_id: string;
}

export interface IChunker<TContent = string, TMetadata = ChunkMetadata> {
  chunk(content: TContent, metadata: TMetadata): Promise<VectorDocument[]>;
}
