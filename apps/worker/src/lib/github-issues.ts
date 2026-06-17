import {
  getGitHubHeaders,
  getRepoFromEnv,
  parseLabelsString
} from "./github-utils";
import type {
  AddCommentResponse,
  CloseIssueResponse,
  CreateIssueResponse,
  EditIssueResponse,
  GitHubComment,
  GitHubIssue,
  GitHubLabel,
  IssueDetailsResponse,
  RepositoryLabelsResponse,
  SearchIssuesResponse
} from "./interfaces";
import { logger } from "./logger";

/**
 * Search for issues across a repo using a query string
 */
export const getIssues = async (params: {
  token: string;
  owner: string;
  repo: string;
  query: string; // e.g., "state:open label:bug"
}): Promise<SearchIssuesResponse> => {
  const { owner, repo, query } = params;
  // Construct a scoped search query
  const fullQuery = `repo:${owner}/${repo} ${query} is:issue`;
  logger.info("Starting: Search GitHub Issues", {
    owner,
    repo,
    query: fullQuery
  });

  try {
    const response = await fetch(
      `https://api.github.com/search/issues?q=${encodeURIComponent(fullQuery)}`,
      { headers: getGitHubHeaders(params.token) }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Search failed: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as {
      total_count: number;
      items: GitHubIssue[];
    };
    return {
      success: true,
      message: `Found ${data.total_count} matching issues.`,
      issues: data.items as GitHubIssue[]
    };
  } catch (error) {
    logger.error("Failed to search issues", {
      owner,
      repo,
      error: String(error)
    });
    return { success: false, message: "Search failed", error: String(error) };
  }
};

/**
 * Internal helper to fetch a single issue.
 * Used for verification when the API returns a 500.
 */
export const getGitHubIssue = async (params: {
  token: string;
  owner: string;
  repo: string;
  issueNumber: number;
}): Promise<IssueDetailsResponse> => {
  const { token, owner, repo, issueNumber } = params;
  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`,
      { headers: getGitHubHeaders(token) }
    );
    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        message: `Failed to fetch issue #${issueNumber}: ${response.status}`,
        error: errorText
      };
    }
    const issue = (await response.json()) as GitHubIssue;
    return { success: true, message: "Issue fetched successfully", issue };
  } catch (error: unknown) {
    return {
      success: false,
      message: `Exception fetching issue #${issueNumber}`,
      error: String(error)
    };
  }
};

export const createGitHubIssue = async (params: {
  token: string;
  owner: string;
  repo: string;
  title: string;
  body: string;
  labels?: string;
}): Promise<CreateIssueResponse> => {
  const { owner, repo, title, body, labels: labelsStr } = params;
  logger.info("Starting: Create GitHub Issue", { owner, repo, title });

  try {
    const labels = parseLabelsString(labelsStr || "");
    const headers = getGitHubHeaders(params.token);

    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          title,
          body,
          labels: labels.length > 0 ? labels : undefined
        })
      }
    );

    if (!response.ok) {
      const errorData = await response.text();
      logger.error("GitHub API Error: Create Issue", {
        status: response.status,
        error: errorData
      });
      return {
        success: false,
        message: `Error: ${response.status}`,
        error: errorData
      };
    }

    const issue = (await response.json()) as GitHubIssue;
    logger.info("Success: GitHub Issue Created", { issueNumber: issue.number });

    return {
      success: true,
      message: `✅ Issue created: ${issue.html_url}`,
      issue
    };
  } catch (error) {
    return {
      success: false,
      message: "Exception occurred",
      error: String(error)
    };
  }
};

export const editGitHubIssue = async (params: {
  token: string;
  owner: string;
  repo: string;
  issueNumber: number;
  title?: string;
  body?: string;
  labels?: string;
}): Promise<EditIssueResponse> => {
  const {
    token,
    owner,
    repo,
    issueNumber,
    title,
    body,
    labels: labelsStr
  } = params;
  logger.info("Starting: Edit GitHub Issue", { owner, repo, issueNumber });

  try {
    const labels = labelsStr ? parseLabelsString(labelsStr) : undefined;
    const headers = getGitHubHeaders(token);

    const updatePayload: Record<string, unknown> = {};
    if (title !== undefined) updatePayload.title = title;
    if (body !== undefined) updatePayload.body = body;
    if (labels !== undefined) updatePayload.labels = labels;

    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify(updatePayload)
      }
    );

    // Verification Logic for 500
    if (response.status === 500) {
      logger.info("Received 500 on Edit, verifying update...", { issueNumber });
      const verifiedIssue = (
        await getGitHubIssue({
          token,
          owner,
          repo,
          issueNumber
        })
      ).issue;

      // If we can fetch it and the title matches, the update likely succeeded
      if (verifiedIssue && (title ? verifiedIssue.title === title : true)) {
        return {
          success: true,
          message: `✅ Issue #${issueNumber} updated (Verified after 500).`,
          issue: verifiedIssue
        };
      }
    }

    if (!response.ok) {
      const errorData = await response.text();
      return { success: false, message: "Failed to update", error: errorData };
    }

    const issue = (await response.json()) as GitHubIssue;
    return {
      success: true,
      message: `✅ Issue #${issueNumber} updated!`,
      issue
    };
  } catch (error) {
    return {
      success: false,
      message: "Exception occurred",
      error: String(error)
    };
  }
};

export const closeGitHubIssue = async (params: {
  token: string;
  owner: string;
  repo: string;
  issueNumber: number;
  reason?: string;
}): Promise<CloseIssueResponse> => {
  const { token, owner, repo, issueNumber } = params;
  logger.info("Starting: Close GitHub Issue", { owner, repo, issueNumber });

  try {
    const headers = getGitHubHeaders(token);
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          state: "closed",
          state_reason: params.reason ? params.reason : "completed"
        })
      }
    );

    if (response.status === 500) {
      logger.info("Received 500 on Close, verifying status...", {
        issueNumber
      });
      const verifiedIssue = (
        await getGitHubIssue({
          token,
          owner,
          repo,
          issueNumber
        })
      ).issue;
      if (verifiedIssue?.state === "closed") {
        return {
          success: true,
          message: `✅ Issue #${issueNumber} closed (Verified after 500).`,
          issue: verifiedIssue
        };
      }
    }

    if (!response.ok) {
      const errorData = await response.text();
      return {
        success: false,
        message: "Error closing issue",
        error: errorData
      };
    }

    const issue = (await response.json()) as GitHubIssue;
    return {
      success: true,
      message: `✅ Issue #${issueNumber} closed!`,
      issue
    };
  } catch (error) {
    return {
      success: false,
      message: "Exception occurred",
      error: String(error)
    };
  }
};

/**
 * Fetches issue template content from the GitHub repository
 * @returns Issue template content as a string
 * @throws Error if fetching fails or template is not found
 */
export const getIssueTemplate = async (
  token: string,
  url: string,
  templateName: string
): Promise<string> => {
  const headers = getGitHubHeaders(token);

  const [owner, repo] = getRepoFromEnv(url);

  const filesFetchUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main`;
  const template = await fetch(
    `${filesFetchUrl}/.github/ISSUE_TEMPLATE/${templateName}.md`,
    {
      headers
    }
  ).then((res) => res.text());
  return template;
};

/**
 * Fetch all available labels for a repository
 * @returns An array of label names or an error message
 * @throws Error if fetching fails
 */
export const getRepositoryLabels = async (params: {
  token: string;
  owner: string;
  repo: string;
}): Promise<RepositoryLabelsResponse> => {
  const { owner, repo } = params;
  logger.info("Starting: Get Repository Labels", { owner, repo });

  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/labels`,
      { headers: getGitHubHeaders(params.token) }
    );

    if (!response.ok) {
      throw new Error(`GitHub API Error: ${response.status}`);
    }

    const labels = (await response.json()) as GitHubLabel[];
    return {
      success: true,
      message: `Found ${labels.length} labels.`,
      labels
    };
  } catch (error) {
    logger.error("Failed to fetch labels", {
      owner,
      repo,
      error: String(error)
    });
    return {
      success: false,
      message: "Could not fetch labels",
      error: String(error)
    };
  }
};

/**
 * Add a comment to an existing issue
 */
export const addCommentToIssue = async (params: {
  token: string;
  owner: string;
  repo: string;
  issueNumber: number;
  body: string;
}): Promise<AddCommentResponse> => {
  const { token, owner, repo, issueNumber, body } = params;
  const url = `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`;
  logger.info("Starting: Add Comment", { owner, repo, issueNumber });

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: getGitHubHeaders(token),
      body: JSON.stringify({ body })
    });

    // Verification for 500
    if (response.status === 500) {
      logger.info("Received 500 on Comment, verifying...", { issueNumber });
      // Fetch latest 5 comments to see if ours made it
      const verifyRes = await fetch(
        `${url}?per_page=5&sort=created&direction=desc`,
        {
          headers: getGitHubHeaders(token)
        }
      );
      const comments = (await verifyRes.json()) as GitHubComment[];
      const found = comments.find((c) => c.body === body);

      if (found) {
        return {
          success: true,
          message: "✅ Comment added (Verified after 500).",
          comment: found
        };
      }
    }

    if (!response.ok) {
      const errorData = await response.text();
      return {
        success: false,
        message: "Failed to add comment",
        error: errorData
      };
    }

    const comment = (await response.json()) as GitHubComment;
    return {
      success: true,
      message: "✅ Comment added successfully!",
      comment
    };
  } catch (error) {
    return {
      success: false,
      message: "Exception during comment",
      error: String(error)
    };
  }
};
