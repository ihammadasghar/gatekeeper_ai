export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body?: string;
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

export interface RepositoryData {
  owner: string;
  repo: string;
  url: string;
  description?: string;
  isPrivate: boolean;
  stars: number;
  language?: string;
}

export interface GitHubLabel {
  id: number;
  name: string;
  color: string;
  description?: string;
}

export interface GitHubComment {
  id: number;
  html_url: string;
  body: string;
}

export interface GitHubAPIResponse {
  message: string;
  success: boolean;
  error?: string;
}

export interface CreateIssueResponse extends GitHubAPIResponse {
  issue?: GitHubIssue;
}

export interface SearchIssuesResponse extends GitHubAPIResponse {
  issues?: GitHubIssue[];
}

export interface RepositoryLabelsResponse extends GitHubAPIResponse {
  labels?: GitHubLabel[];
}

export interface IssueDetailsResponse extends GitHubAPIResponse {
  issue?: GitHubIssue;
}

export interface EditIssueResponse extends GitHubAPIResponse {
  issue?: GitHubIssue;
}

export interface CloseIssueResponse extends GitHubAPIResponse {
  issue?: GitHubIssue;
}

export interface AddCommentResponse extends GitHubAPIResponse {
  comment?: GitHubComment;
}
