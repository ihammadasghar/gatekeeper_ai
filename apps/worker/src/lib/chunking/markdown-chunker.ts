import type { ChunkMetadata, IChunker, VectorDocument } from '@gatekeeper/types';

const HEADER_REGEX = /^(#{2,3})\s+(.+)$/m;

interface ParsedSection {
  readonly level: 2 | 3;
  readonly header: string;
  readonly body: string;
}

export class MarkdownChunker implements IChunker {
  chunk(content: string, metadata: ChunkMetadata): VectorDocument[] {
    const sections = this.parseSections(content);
    return this.buildDocuments(sections, metadata);
  }

  private parseSections(content: string): readonly ParsedSection[] {
    const lines = content.split('\n');
    const sections: ParsedSection[] = [];
    let currentLevel: 2 | 3 | null = null;
    let currentHeader = '';
    let bodyLines: string[] = [];

    const flush = (): void => {
      if (currentHeader !== '') {
        sections.push({
          level: currentLevel as 2 | 3,
          header: currentHeader,
          body: bodyLines.join('\n'),
        });
      }
    };

    for (const line of lines) {
      const match = HEADER_REGEX.exec(line);
      if (match !== null) {
        flush();
        const hashes = match[1] as string;
        currentLevel = hashes.length === 2 ? 2 : 3;
        currentHeader = match[2] as string;
        bodyLines = [];
      } else {
        bodyLines.push(line);
      }
    }

    flush();
    return sections;
  }

  private buildDocuments(
    sections: readonly ParsedSection[],
    metadata: ChunkMetadata,
  ): VectorDocument[] {
    let currentH2Header = '';
    const documents: VectorDocument[] = [];

    for (const section of sections) {
      if (section.level === 2) {
        currentH2Header = section.header;
      }

      const trimmedBody = section.body.trim();
      if (trimmedBody === '') {
        continue;
      }

      const text =
        section.level === 3 && currentH2Header !== ''
          ? `## ${currentH2Header}\n\n### ${section.header}\n\n${trimmedBody}`
          : `## ${section.header}\n\n${trimmedBody}`;

      documents.push({
        text,
        metadata: {
          repository_id: metadata.repository_id,
          type: metadata.type,
          file_path: metadata.file_path,
        },
      });
    }

    return documents;
  }
}
