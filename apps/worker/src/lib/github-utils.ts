/**
 * Shared GitHub utilities for API interactions
 * Centralizes common GitHub API operations and parsing logic
 */

/**
 * Parse GitHub repository URL to extract owner and repo name
 * @param url - GitHub repository URL (e.g., https://github.com/owner/repo)
 * @returns [owner, repo] tuple
 * @throws Error if URL is invalid
 */
export const parseGitHubRepoUrl = (url: string): [string, string] => {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)$/);
  if (!match) {
    throw new Error(`Invalid GitHub repository URL: ${url}`);
  }
  const [, owner, repo] = match;
  return [owner, repo];
};

/**
 * Get standard GitHub API headers
 * @returns Headers object for GitHub API requests
 */
export const getGitHubHeaders = (token: string): Record<string, string> => {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "Cloudflare-Worker-Gatekeeper",
    "Content-Type": "application/json"
  };
};

/**
 * Parse labels from string format (JSON array or comma-separated)
 * @param labelsStr - Labels as JSON array or comma-separated string
 * @returns Array of label strings
 */
export const parseLabelsString = (labelsStr: string): string[] => {
  if (!labelsStr) return [];

  try {
    // Try parsing as JSON array first
    const parsed = JSON.parse(labelsStr);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // If JSON parsing fails, split by comma
  }

  // Fallback: split by comma and trim
  return labelsStr
    .split(",")
    .map((label) => label.trim())
    .filter(Boolean);
};

/**
 * Extracts owner and repo from environment variable
 * @returns [owner, repo] tuple
 * @throws Error if GITHUB_REPO_URL is invalid
 */
export const getRepoFromEnv = (url: string): [string, string] => {
  return parseGitHubRepoUrl(url);
};
