import { describe, expect, it, vi } from 'vitest';
import { IssueChunker } from './issue-chunker';
import type { IssueChunkMetadata, IssueInput } from '@gatekeeper/types';

const BASE_METADATA: IssueChunkMetadata = { repository_id: 'repo-uuid-123' };

const makeIssue = (overrides: Partial<IssueInput> = {}): IssueInput => ({
  number: 42,
  title: 'Login fails on Safari',
  state: 'open',
  labels: ['bug', 'p1'],
  body: 'Users on Safari 16 cannot log in. The OAuth redirect is broken.',
  comments: [],
  ...overrides,
});

describe('IssueChunker', () => {
  describe('chunk()', () => {
    it('produces exactly 1 chunk (OP) when there are 0 comments', async () => {
      // Arrange
      const chunker = new IssueChunker();
      const issue = makeIssue({ comments: [] });

      // Act
      const result = await chunker.chunk(issue, BASE_METADATA);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]?.text).toBe(
        '#42: Login fails on Safari\nStatus: open\nLabels: bug, p1\n\nUsers on Safari 16 cannot log in. The OAuth redirect is broken.',
      );
      expect(result[0]?.metadata.type).toBe('issue');
      expect(result[0]?.metadata.issue_number).toBe(42);
      expect(result[0]?.metadata.issue_state).toBe('open');
      expect(result[0]?.metadata.labels).toEqual(['bug', 'p1']);
      expect(result[0]?.metadata.repository_id).toBe('repo-uuid-123');
    });

    it('produces OP + sliding-window groups for 10 comments', async () => {
      // Arrange
      const chunker = new IssueChunker();
      const comments = Array.from({ length: 10 }, (_, i) => `Comment ${i + 1}`);
      const issue = makeIssue({ comments });

      // Act
      const result = await chunker.chunk(issue, BASE_METADATA);

      // Assert — OP + 3 windows (0-4, 4-8, 8-9)
      expect(result).toHaveLength(4);

      // Chunk 0: OP
      expect(result[0]?.text).toContain('#42: Login fails on Safari');

      // Chunk 1: Comments 1–5
      expect(result[1]?.text).toMatch(/^Comments 1–5:/);
      expect(result[1]?.text).toContain('Comment 1');
      expect(result[1]?.text).toContain('Comment 5');

      // Chunk 2: Comments 5–9 (1-comment overlap: starts at index 4 = "Comment 5")
      expect(result[2]?.text).toMatch(/^Comments 5–9:/);
      expect(result[2]?.text).toContain('Comment 5');
      expect(result[2]?.text).toContain('Comment 9');

      // Chunk 3: Comments 9–10 (last window)
      expect(result[3]?.text).toMatch(/^Comments 9–10:/);
      expect(result[3]?.text).toContain('Comment 10');
    });

    it('produces OP + 1 summary chunk for >30 comments (mocked summarizeThread)', async () => {
      // Arrange
      const mockSummarize = vi.fn().mockResolvedValue('This thread resolved the OAuth issue.');
      const chunker = new IssueChunker(mockSummarize);
      const comments = Array.from({ length: 31 }, (_, i) => `Comment ${i + 1}`);
      const issue = makeIssue({ comments });

      // Act
      const result = await chunker.chunk(issue, BASE_METADATA);

      // Assert
      expect(result).toHaveLength(2);

      // Chunk 0: OP
      expect(result[0]?.text).toContain('#42: Login fails on Safari');

      // Chunk 1: summary
      expect(result[1]?.text).toBe('This thread resolved the OAuth issue.');
      expect(result[1]?.metadata.type).toBe('issue');

      // summarizeThread called with all 31 comments
      expect(mockSummarize).toHaveBeenCalledOnce();
      expect(mockSummarize).toHaveBeenCalledWith(comments);
    });

    it('formats labels as "none" when the issue has no labels', async () => {
      // Arrange
      const chunker = new IssueChunker();
      const issue = makeIssue({ labels: [], comments: [] });

      // Act
      const result = await chunker.chunk(issue, BASE_METADATA);

      // Assert
      expect(result[0]?.text).toContain('Labels: none');
    });

    it('all chunks carry the correct metadata', async () => {
      // Arrange
      const chunker = new IssueChunker();
      const comments = Array.from({ length: 6 }, (_, i) => `Comment ${i + 1}`);
      const issue = makeIssue({ comments });

      // Act
      const result = await chunker.chunk(issue, BASE_METADATA);

      // Assert — every chunk has consistent metadata
      for (const chunk of result) {
        expect(chunk.metadata.repository_id).toBe('repo-uuid-123');
        expect(chunk.metadata.type).toBe('issue');
        expect(chunk.metadata.issue_number).toBe(42);
        expect(chunk.metadata.issue_state).toBe('open');
        expect(chunk.metadata.labels).toEqual(['bug', 'p1']);
      }
    });
  });
});
