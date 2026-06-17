import { Card } from "@/components/card/Card";
import { Button } from "@/components/button/Button";
import { MemoizedMarkdown } from "@/components/memoized-markdown";
import { XIcon } from "@phosphor-icons/react";

interface GitHubIssue {
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

interface GitHubIssueDetailsProps {
  issue: GitHubIssue | null;
  onClose: () => void;
  isPreview?: boolean;
  isEditPreview?: boolean;
}

export const GitHubIssueDetails = ({
  issue,
  onClose,
  isPreview = false,
  isEditPreview = false
}: GitHubIssueDetailsProps) => {
  if (!issue) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <Card className="text-center bg-neutral-100 dark:bg-neutral-900">
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Select an issue to view details
          </p>
        </Card>
      </div>
    );
  }

  const createdDate = new Date(issue.created_at).toLocaleDateString([], {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
  const updatedDate = new Date(issue.updated_at).toLocaleDateString([], {
    year: "numeric",
    month: "short",
    day: "numeric"
  });

  return (
    <div className="h-full flex flex-col max-h-[80vh]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-neutral-300 dark:border-neutral-800 sticky top-0 z-10 bg-neutral-50 dark:bg-neutral-900">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            {isPreview && (
              <div className="mb-2">
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                  {isEditPreview ? "Edit Preview" : "Preview"}
                </span>
              </div>
            )}
            <h2 className="font-semibold text-base break-words line-clamp-2">
              {isPreview
                ? isEditPreview
                  ? `#${issue.number}: ${issue.title}`
                  : issue.title
                : `#${issue.number}: ${issue.title}`}
            </h2>
            <div className="flex items-center gap-2 mt-2">
              <span
                className={`text-xs px-2 py-1 rounded-full font-medium ${
                  issue.state === "open"
                    ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                    : "bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300"
                }`}
              >
                {isPreview
                  ? isEditPreview
                    ? "Updating"
                    : "Draft"
                  : issue.state.charAt(0).toUpperCase() + issue.state.slice(1)}
              </span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="md"
            shape="square"
            className="rounded-full h-8 w-8 shrink-0"
            onClick={onClose}
            type="button"
          >
            <XIcon size={16} />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-white dark:bg-neutral-950">
        <div className="p-4 space-y-4">
          {/* Author Info / Preview Info */}
          {isPreview ? (
            <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
              <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">
                {isEditPreview
                  ? `Editing issue #${issue.number}`
                  : "Creating new issue"}
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                {isEditPreview
                  ? "Review the changes below and confirm to update the issue"
                  : "Review the content below and confirm to create the issue"}
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <img
                src={issue.user.avatar_url}
                alt={issue.user.login}
                className="w-8 h-8 rounded-full"
              />
              <div className="text-sm">
                <p className="font-medium text-neutral-900 dark:text-neutral-100">
                  {issue.user.login}
                </p>
                <p className="text-xs text-neutral-600 dark:text-neutral-400">
                  Created {createdDate}
                </p>
              </div>
            </div>
          )}

          {/* Labels */}
          {issue.labels.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-2">
                LABELS
              </p>
              <div className="flex flex-wrap gap-1">
                {issue.labels.map((label) => (
                  <span
                    key={label.name}
                    className="inline-block px-2 py-1 text-xs rounded-full text-white"
                    style={{
                      backgroundColor: `#${label.color}`,
                      opacity: 0.85
                    }}
                  >
                    {label.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Description */}
          {issue.body ? (
            <Card className="bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-3">
              <MemoizedMarkdown
                id={`issue-body-${issue.id}`}
                content={issue.body}
              />
            </Card>
          ) : (
            <Card className="bg-neutral-100 dark:bg-neutral-900 text-center p-3">
              <p className="text-sm text-neutral-600 dark:text-neutral-400 italic">
                No description provided
              </p>
            </Card>
          )}

          {/* Metadata */}
          {!isPreview && (
            <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800 space-y-1">
              <p className="text-xs text-neutral-600 dark:text-neutral-400">
                <span className="font-semibold">Updated:</span> {updatedDate}
              </p>
              <a
                href={issue.html_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex text-xs text-[#F48120] hover:underline"
              >
                View on GitHub →
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
