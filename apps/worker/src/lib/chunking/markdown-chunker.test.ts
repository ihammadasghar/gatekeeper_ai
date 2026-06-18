import { describe, expect, it } from 'vitest';
import { MarkdownChunker } from './markdown-chunker';
import type { ChunkMetadata } from '@gatekeeper/types';

const BASE_METADATA: ChunkMetadata = {
  repository_id: 'repo-uuid-123',
  type: 'doc',
  file_path: 'docs/guide.md',
};

describe('MarkdownChunker', () => {
  const chunker = new MarkdownChunker();

  describe('chunk()', () => {
    it('produces one chunk per ## section', async () => {
      // Arrange
      const content = `
## Section One
Body of section one.

## Section Two
Body of section two.

## Section Three
Body of section three.
`.trim();

      // Act
      const result = await chunker.chunk(content, BASE_METADATA);

      // Assert
      expect(result).toHaveLength(3);
      expect(result[0]?.text).toContain('Section One');
      expect(result[0]?.text).toContain('Body of section one.');
      expect(result[1]?.text).toContain('Section Two');
      expect(result[2]?.text).toContain('Section Three');
    });

    it('prepends the parent ## header to ### subsection chunks', async () => {
      // Arrange
      const content = `
## Installation

Install the package using npm.

### Prerequisites

You need Node 18+.
`.trim();

      // Act
      const result = await chunker.chunk(content, BASE_METADATA);

      // Assert
      expect(result).toHaveLength(2);

      const subsectionChunk = result.find((c) => c.text.includes('Prerequisites'));
      expect(subsectionChunk).toBeDefined();
      expect(subsectionChunk?.text).toMatch(/^## Installation/);
      expect(subsectionChunk?.text).toContain('### Prerequisites');
      expect(subsectionChunk?.text).toContain('You need Node 18+.');
    });

    it('filters out empty sections (headers with no body text)', async () => {
      // Arrange
      const content = `
## Has Content
Some content here.

## Barren Header

## Also Has Content
More content here.
`.trim();

      // Act
      const result = await chunker.chunk(content, BASE_METADATA);

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0]?.text).toContain('Has Content');
      expect(result[1]?.text).toContain('Also Has Content');
      expect(result.some((c) => c.text.includes('Barren Header'))).toBe(false);
    });

    it('attaches the supplied metadata to every chunk', async () => {
      // Arrange
      const metadata: ChunkMetadata = {
        repository_id: 'my-repo-id',
        type: 'template',
        file_path: '.github/ISSUE_TEMPLATE/bug_report.md',
      };
      const content = '## Overview\nSome overview text.';

      // Act
      const result = await chunker.chunk(content, metadata);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]?.metadata.repository_id).toBe('my-repo-id');
      expect(result[0]?.metadata.type).toBe('template');
      expect(result[0]?.metadata.file_path).toBe('.github/ISSUE_TEMPLATE/bug_report.md');
    });

    it('returns an empty array for content with no recognisable headers', async () => {
      // Arrange
      const content = 'Just plain text with no headers.';

      // Act
      const result = await chunker.chunk(content, BASE_METADATA);

      // Assert
      expect(result).toHaveLength(0);
    });

    it('handles a ### section before any ## section without crashing', async () => {
      // Arrange
      const content = `
### Orphan Subsection
Content without a parent.
`.trim();

      // Act
      const result = await chunker.chunk(content, BASE_METADATA);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]?.text).toContain('Orphan Subsection');
      expect(result[0]?.text).toContain('Content without a parent.');
    });
  });
});
