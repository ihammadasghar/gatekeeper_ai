/**
 * Tool input/output parsing utilities
 * Handles parsing and validation of tool inputs for preview generation
 */

import { parseLabelsString } from "./github-utils";

interface GitHubIssuePreview {
  id: number;
  number: number;
  title: string;
  body: string;
  state: string;
  labels: Array<{ name: string; color: string }>;
  created_at: string;
  updated_at: string;
  html_url: string;
  user: {
    login: string;
    avatar_url: string;
  };
}

/**
 * Parse labels string and convert to GitHub issue label format
 * @param labelsStr - Labels as JSON array or comma-separated string
 * @param color - Color to use for labels (hex code)
 * @returns Array of label objects
 */
export const parseLabelsForPreview = (
  labelsStr: string | undefined,
  color: string = "F48120"
): Array<{ name: string; color: string }> => {
  if (!labelsStr) return [];

  const labelNames = parseLabelsString(labelsStr);
  return labelNames.map((name) => ({
    name,
    color
  }));
};

/**
 * Create a preview issue object from tool input
 * Used for showing what the issue will look like before it's created/edited
 */
export const createPreviewIssue = (input: {
  title?: string;
  body?: string;
  labels?: string;
  issueNumber?: number;
  isEdit?: boolean;
}): GitHubIssuePreview => {
  const now = new Date().toISOString();

  return {
    id: -1,
    number: input.issueNumber || -1,
    title:
      input.title ||
      (input.isEdit ? "Issue Title" : "Untitled Issue (Preview)"),
    body:
      input.body !== undefined
        ? input.body
        : input.isEdit
          ? "Issue body will be updated"
          : "",
    state: "open",
    labels: parseLabelsForPreview(input.labels),
    created_at: now,
    updated_at: now,
    html_url: "",
    user: {
      login: "preview",
      avatar_url: ""
    }
  };
};
