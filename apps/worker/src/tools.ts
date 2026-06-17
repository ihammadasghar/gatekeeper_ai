/**
 * Tool definitions for the AI chat agent
 * Tools can either require human confirmation or execute automatically
 */
import { tool, type ToolSet } from "ai";
import { z } from "zod/v3";

import { env } from "cloudflare:workers";
import { getRepoFromEnv } from "@/lib/github-utils";
import {
  createGitHubIssue,
  editGitHubIssue,
  closeGitHubIssue,
  getIssueTemplate,
  getIssues,
  getGitHubIssue,
  addCommentToIssue,
  getRepositoryLabels
} from "@/lib/github-issues";
import { TOOL_DESCRIPTIONS, ISSUE_BODY_GUIDELINES } from "@/lib/prompts";

/**
 * GitHub issue creation tool that drafts and creates issues
 * This tool uses the GitHub API to create issues based on user input
 * It leverages an AI model to format the issue according to a template
 * and then posts the issue directly to the repository
 */

const createTicketForGithubRepo = tool({
  description: TOOL_DESCRIPTIONS.createIssue.description,
  inputSchema: z.object({
    body: z.string().describe(`${ISSUE_BODY_GUIDELINES}`),
    title: z.string().describe(TOOL_DESCRIPTIONS.createIssue.titleDescription),
    labels: z.string().describe(TOOL_DESCRIPTIONS.createIssue.labelsDescription)
  })
});

const editTicketForGithubRepo = tool({
  description: TOOL_DESCRIPTIONS.editIssue.description,
  inputSchema: z.object({
    issueNumber: z
      .number()
      .describe(TOOL_DESCRIPTIONS.closeIssue.numberDescription),
    body: z.string().describe(`${ISSUE_BODY_GUIDELINES}`).optional(),
    title: z
      .string()
      .describe(TOOL_DESCRIPTIONS.editIssue.titleDescription)
      .optional(),
    labels: z
      .string()
      .describe(TOOL_DESCRIPTIONS.editIssue.labelsDescription)
      .optional()
  })
});

const closeTicketForGithubRepo = tool({
  description: TOOL_DESCRIPTIONS.closeIssue.description,
  inputSchema: z.object({
    issueNumber: z
      .number()
      .describe(TOOL_DESCRIPTIONS.closeIssue.numberDescription),
    reason: z
      .string()
      .describe(TOOL_DESCRIPTIONS.closeIssue.reasonDescription)
      .optional()
  })
});

/**
 * Search tool to prevent duplicate issues
 */
const searchIssuesForGithubRepo = tool({
  description: TOOL_DESCRIPTIONS.searchIssues.description,
  inputSchema: z.object({
    query: z.string().describe(TOOL_DESCRIPTIONS.searchIssues.queryDescription)
  }),
  execute: async ({ query }: { query: string }) => {
    const [owner, repo] = getRepoFromEnv(env.GITHUB_REPO_URL);
    const result = await getIssues({
      token: env.GITHUB_TOKEN,
      owner,
      repo,
      query
    });
    if (!result.issues) {
      return `Error searching issues: ${result.message}`;
    }
    return (
      result.issues
        .map((issue) => `#${issue.number}: ${issue.title}`)
        .join("\n") || "No matching issues found."
    );
  }
});

/**
 * Tool to read a specific issue's full content and comments
 */
const getIssueDetails = tool({
  description: TOOL_DESCRIPTIONS.getIssueDetails.description,
  inputSchema: z.object({
    issueNumber: z
      .number()
      .describe(TOOL_DESCRIPTIONS.getIssueDetails.numberDescription)
  }),
  execute: async ({ issueNumber }: { issueNumber: number }) => {
    const [owner, repo] = getRepoFromEnv(env.GITHUB_REPO_URL);
    const result = await getGitHubIssue({
      token: env.GITHUB_TOKEN,
      owner,
      repo,
      issueNumber
    });
    if (!result.issue) {
      return `Error fetching issue details: ${result.message}`;
    }
    const { title, body, labels } = result.issue;
    return `#${issueNumber}: ${title}\nLabels: ${labels.map((l) => l.name).join(", ")}\n\n${body}`;
  }
});

/**
 * Tool to participate in the conversation
 */
const addCommentToGithubIssue = tool({
  description: TOOL_DESCRIPTIONS.addComment.description,
  inputSchema: z.object({
    issueNumber: z
      .number()
      .describe(TOOL_DESCRIPTIONS.addComment.numberDescription),
    body: z
      .string()
      .describe(TOOL_DESCRIPTIONS.addComment.commentBodyDescription)
  })
});

/**
 * Taxonomy tool
 */
const listRepositoryLabels = tool({
  description: "Returns all valid labels available in this repository.",
  inputSchema: z.object({}),
  execute: async () => {
    const [owner, repo] = getRepoFromEnv(env.GITHUB_REPO_URL);
    const response = await getRepositoryLabels({
      token: env.GITHUB_TOKEN,
      owner,
      repo
    });
    if (!response.labels) {
      return `Error fetching labels: ${response.message}`;
    }
    return response.labels.map((l) => l.name).join(", ") || "No labels found.";
  }
});

const getGithubIssueTemplate = tool({
  description: TOOL_DESCRIPTIONS.getIssueTemplate.description,
  inputSchema: z.object({
    templateName: z
      .string()
      .describe(TOOL_DESCRIPTIONS.getIssueTemplate.templateNameDescription)
  }),
  execute: async ({ templateName }: { templateName: string }) => {
    const template = await getIssueTemplate(
      env.GITHUB_TOKEN,
      env.GITHUB_REPO_URL,
      templateName
    );
    if (!template) {
      return `Error fetching issue template.`;
    }
    return template;
  }
});

export const tools = {
  createTicketForGithubRepo,
  editTicketForGithubRepo,
  closeTicketForGithubRepo,
  searchIssuesForGithubRepo,
  getIssueDetails,
  addCommentToGithubIssue,
  listRepositoryLabels,
  getGithubIssueTemplate
} satisfies ToolSet;

/**
 * Implementation of confirmation-required tools
 * Delegates to reusable GitHub issue operations
 */
export const executions = {
  createTicketForGithubRepo: async ({
    body,
    title,
    labels
  }: {
    body: string;
    title: string;
    labels: string;
  }) => {
    const [owner, repo] = getRepoFromEnv(env.GITHUB_REPO_URL);
    const result = await createGitHubIssue({
      token: env.GITHUB_TOKEN,
      owner,
      repo,
      title,
      body,
      labels
    });
    return result.message;
  },

  editTicketForGithubRepo: async ({
    issueNumber,
    body,
    title,
    labels
  }: {
    issueNumber: number;
    body?: string;
    title?: string;
    labels?: string;
  }) => {
    const [owner, repo] = getRepoFromEnv(env.GITHUB_REPO_URL);
    const result = await editGitHubIssue({
      token: env.GITHUB_TOKEN,
      owner,
      repo,
      issueNumber,
      title,
      body,
      labels
    });
    return result.message;
  },

  closeTicketForGithubRepo: async ({
    issueNumber,
    reason
  }: {
    issueNumber: number;
    reason?: string;
  }) => {
    const [owner, repo] = getRepoFromEnv(env.GITHUB_REPO_URL);
    const result = await closeGitHubIssue({
      token: env.GITHUB_TOKEN,
      owner,
      repo,
      issueNumber,
      reason
    });
    return result.message;
  },

  addCommentToGithubIssue: async ({
    issueNumber,
    body
  }: {
    issueNumber: number;
    body: string;
  }) => {
    const [owner, repo] = getRepoFromEnv(env.GITHUB_REPO_URL);
    const result = await getGitHubIssue({
      token: env.GITHUB_TOKEN,
      owner,
      repo,
      issueNumber
    });
    if (!result.issue) {
      return `Error finding issue to comment on: ${result.message}`;
    }
    const commentResult = await addCommentToIssue({
      token: env.GITHUB_TOKEN,
      owner,
      repo,
      issueNumber,
      body
    });
    if (!commentResult.success) {
      return `Error adding comment: ${commentResult.message}`;
    }
    return commentResult.message;
  }
};
