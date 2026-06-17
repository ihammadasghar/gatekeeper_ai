import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/card/Card";
import { Loader } from "@/components/loader/Loader";
import { Button } from "@/components/button/Button"; // Assuming you have this
import { ExclamationMarkIcon, ArrowsClockwise } from "@phosphor-icons/react";
import type { GitHubIssue, SearchIssuesResponse } from "@/lib/interfaces";

interface GitHubIssuesProps {
  repoUrl?: string;
  maxIssues?: number;
  onIssueSelect?: (issue: GitHubIssue) => void;
}

export const GitHubIssues = ({
  repoUrl,
  maxIssues = 10,
  onIssueSelect
}: GitHubIssuesProps) => {
  const [issues, setIssues] = useState<GitHubIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchIssues = useCallback(
    async (isManualRefresh = false) => {
      try {
        if (isManualRefresh) setRefreshing(true);
        else setLoading(true);

        setError(null);

        const response = await fetch("/api/github-issues", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repoUrl, maxIssues })
        });

        if (!response.ok) throw new Error("Failed to sync with GitHub");

        const data = ((await response.json()) as SearchIssuesResponse)
          .issues as GitHubIssue[];
        setIssues(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch issues");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [repoUrl, maxIssues]
  );

  useEffect(() => {
    fetchIssues();
  }, [fetchIssues]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-neutral-300 dark:border-neutral-800 sticky top-0 z-10 bg-neutral-50 dark:bg-neutral-900 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-base">Open Issues</h2>
          <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
            {issues.length} issue{issues.length !== 1 ? "s" : ""}
          </p>
        </div>

        <Button
          variant="ghost"
          size="sm"
          shape="square"
          onClick={() => fetchIssues(true)}
          disabled={refreshing}
          className="rounded-full"
          aria-label="Refresh issues"
          type="button"
        >
          <ArrowsClockwise
            size={18}
            className={`${refreshing ? "animate-spin text-[#F48120]" : ""}`}
          />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {error ? (
          <div className="p-4">
            <Card className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3">
              <div className="flex gap-2 text-sm text-red-800 dark:text-red-300">
                <ExclamationMarkIcon size={18} className="shrink-0" />
                <p>{error}</p>
              </div>
            </Card>
          </div>
        ) : issues.length === 0 ? (
          <div className="flex items-center justify-center h-full p-4">
            <Card className="text-center bg-neutral-100 dark:bg-neutral-900 p-4">
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                No open issues found
              </p>
            </Card>
          </div>
        ) : (
          <div className="space-y-2 p-4">
            {issues.map((issue) => (
              <button
                key={issue.id}
                onClick={() => onIssueSelect?.(issue)}
                className="w-full block text-left group"
                type="button"
              >
                <Card className="p-3 bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 hover:border-neutral-400 dark:hover:border-neutral-600 transition-colors cursor-pointer">
                  <div className="flex gap-2 items-start">
                    <img
                      src={issue.user.avatar_url}
                      alt={issue.user.login}
                      className="w-6 h-6 rounded-full shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-sm text-neutral-900 dark:text-neutral-100 group-hover:text-[#F48120] transition-colors line-clamp-2">
                        #{issue.number}: {issue.title}
                      </h3>
                    </div>
                  </div>
                </Card>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
