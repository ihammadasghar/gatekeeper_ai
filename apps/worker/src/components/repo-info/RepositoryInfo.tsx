import type { RepositoryData } from "@/lib/interfaces";
import { useEffect, useState } from "react";

export function RepositoryInfo() {
  const [repoInfo, setRepoInfo] = useState<RepositoryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/repository-info")
      .then((res) => res.json())
      .then((data: unknown) => {
        if (typeof data === "object" && data !== null && "error" in data) {
          console.error(
            "Failed to fetch repo info:",
            (data as { error: string }).error
          );
        } else if (typeof data === "object" && data !== null) {
          setRepoInfo(data as RepositoryData);
        }
      })
      .catch((err) => console.error("Error fetching repo info:", err))
      .finally(() => setLoading(false));
  }, []);

  if (loading || !repoInfo) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="text-xs">Loading repository...</span>
      </div>
    );
  }

  return (
    <div className="w-full max-w-full">
      <div className="flex flex-col gap-2 px-2 py-2 rounded-md md:bg-neutral-100 md:dark:bg-neutral-800 md:px-3">
        <div className="flex items-center gap-2 text-sm">
          <svg
            className="w-4 h-4 text-[#F48120] flex-shrink-0"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <title>Github Logo</title>
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.001 12.001 0 0024 12c0-6.63-5.37-12-12-12z" />
          </svg>
          <span className="font-semibold truncate">
            {repoInfo.owner}/{repoInfo.repo}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          {repoInfo.isPrivate && (
            <span className="px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700">
              Private
            </span>
          )}
          {repoInfo.language && (
            <span className="px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700">
              {repoInfo.language}
            </span>
          )}
          <span className="px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700">
            ⭐ {repoInfo.stars}
          </span>
        </div>

        {repoInfo.description && (
          <div className="hidden md:block text-xs text-muted-foreground truncate">
            {repoInfo.description}
          </div>
        )}
      </div>
    </div>
  );
}
