import { isStaticToolUIPart } from "ai";
import type { UIMessage } from "@ai-sdk/react";
import type { tools } from "@/tools";
import { createPreviewIssue } from "@/lib/tool-preview";
import type { GitHubIssue } from "@/lib/interfaces";

const toolsRequiringConfirmation: (keyof typeof tools)[] = [
  "createTicketForGithubRepo",
  "editTicketForGithubRepo",
  "closeTicketForGithubRepo",
  "addCommentToGithubIssue"
];

interface UsePendingToolConfirmationResult {
  pendingToolCallConfirmation: boolean;
  previewIssue: GitHubIssue | null;
  isEditPreview: boolean;
  toolsRequiringConfirmation: (keyof typeof tools)[];
}

export function usePendingToolConfirmation(
  agentMessages: UIMessage[]
): UsePendingToolConfirmationResult {
  const pendingToolCallConfirmation = agentMessages.some((m: UIMessage) =>
    m.parts?.some(
      (part) =>
        isStaticToolUIPart(part) &&
        part.state === "input-available" &&
        toolsRequiringConfirmation.includes(
          part.type.replace("tool-", "") as keyof typeof tools
        )
    )
  );

  let previewIssue: GitHubIssue | null = null;
  let isEditPreview = false;

  if (pendingToolCallConfirmation) {
    const pendingMessage = agentMessages.find((m: UIMessage) =>
      m.parts?.some(
        (part) =>
          isStaticToolUIPart(part) &&
          part.state === "input-available" &&
          toolsRequiringConfirmation.includes(
            part.type.replace("tool-", "") as keyof typeof tools
          )
      )
    );

    if (pendingMessage) {
      const toolPart = pendingMessage.parts?.find(
        (part) =>
          isStaticToolUIPart(part) &&
          part.state === "input-available" &&
          toolsRequiringConfirmation.includes(
            part.type.replace("tool-", "") as keyof typeof tools
          )
      );

      if (
        (toolPart?.type === "tool-createTicketForGithubRepo" ||
          toolPart?.type === "tool-editTicketForGithubRepo") &&
        toolPart?.input
      ) {
        const input = toolPart.input as {
          issueNumber?: number;
          title?: string;
          body?: string;
          labels?: string;
        };

        const isEdit = toolPart?.type === "tool-editTicketForGithubRepo";
        previewIssue = createPreviewIssue({
          issueNumber: input.issueNumber,
          title: input.title,
          body: input.body,
          labels: input.labels,
          isEdit
        });
        isEditPreview = isEdit;
      }
    }
  }

  return {
    pendingToolCallConfirmation,
    previewIssue,
    isEditPreview,
    toolsRequiringConfirmation
  };
}

export { toolsRequiringConfirmation };
