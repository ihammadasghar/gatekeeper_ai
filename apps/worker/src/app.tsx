/** biome-ignore-all lint/correctness/useUniqueElementIds: it's alright */
import { useEffect, useState, useRef, useCallback } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import type { UIMessage } from "@ai-sdk/react";

// Component imports
import { GitHubIssues } from "@/components/github-issues/GitHubIssues";
import { GitHubIssueDetails } from "@/components/github-issues/GitHubIssueDetails";
import { TopBar } from "@/components/TopBar";
import { GeminiKeyWarning } from "@/components/GeminiKeyWarning";
import { Modal } from "@/components/modal/Modal";
import { ChatInput } from "@/components/chat/ChatInput";
import { MessageList } from "@/components/chat/MessageList";
import { EmptyState } from "@/components/chat/EmptyState";

// Hook imports
import {
  usePendingToolConfirmation,
  toolsRequiringConfirmation
} from "@/hooks/usePendingToolConfirmation";

import type { GitHubIssue } from "./lib/interfaces";

export default function Chat() {
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    const savedTheme = localStorage.getItem("theme");
    return (savedTheme as "dark" | "light") || "dark";
  });
  const [showDebug, setShowDebug] = useState(false);
  const [_textareaHeight, setTextareaHeight] = useState("auto");
  const [selectedIssue, setSelectedIssue] = useState<GitHubIssue | null>(null);

  const [previewEdits, setPreviewEdits] = useState<{
    title?: string;
    body?: string;
    labels?: string;
  }>({});
  const prevPendingToolRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
    } else {
      document.documentElement.classList.remove("dark");
      document.documentElement.classList.add("light");
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  const agent = useAgent({ agent: "chat" });
  const [agentInput, setAgentInput] = useState("");

  const {
    messages: agentMessages,
    addToolResult,
    clearHistory,
    status,
    sendMessage,
    stop
  } = useAgentChat<unknown, UIMessage<{ createdAt: string }>>({
    agent
  });

  useEffect(() => {
    agentMessages.length > 0 && scrollToBottom();
  }, [agentMessages, scrollToBottom]);

  const handleAgentInputChange = (value: string) => {
    setAgentInput(value);
  };

  const handleAgentSubmit = async (
    e: React.FormEvent,
    extraData: Record<string, unknown> = {}
  ) => {
    e.preventDefault();
    if (!agentInput.trim()) return;

    const message = agentInput;
    setAgentInput("");

    await sendMessage(
      {
        role: "user",
        parts: [{ type: "text", text: message }]
      },
      {
        body: extraData
      }
    );
  };

  const { pendingToolCallConfirmation, previewIssue, isEditPreview } =
    usePendingToolConfirmation(agentMessages);

  // Apply any user edits to the preview
  if (previewIssue && previewEdits.title !== undefined) {
    previewIssue.title = previewEdits.title;
  }
  if (previewIssue && previewEdits.body !== undefined) {
    previewIssue.body = previewEdits.body;
  }
  if (previewIssue && previewEdits.labels !== undefined) {
    let editedLabels: Array<{ name: string; color: string }> = [];
    try {
      const labelArray = JSON.parse(previewEdits.labels);
      if (Array.isArray(labelArray)) {
        editedLabels = labelArray.map((label) => ({
          name: label,
          color: "F48120"
        }));
      }
    } catch {
      editedLabels = previewEdits.labels
        .split(",")
        .map((label) => ({
          name: label.trim(),
          color: "F48120"
        }))
        .filter((label) => label.name.length > 0);
    }
    previewIssue.labels = editedLabels;
  }

  // Reset edits when pending tool confirmation state changes
  if (pendingToolCallConfirmation && !prevPendingToolRef.current) {
    setPreviewEdits({});
  }
  prevPendingToolRef.current = pendingToolCallConfirmation;

  return (
    <div className="h-screen w-full flex flex-col bg-fixed overflow-hidden">
      <GeminiKeyWarning />
      <TopBar
        showDebug={showDebug}
        setShowDebug={setShowDebug}
        theme={theme}
        toggleTheme={toggleTheme}
        clearHistory={clearHistory}
      />
      <div className="flex-1 flex flex-col xl:flex-row gap-4 p-4 overflow-y-auto xl:overflow-hidden">
        <div className="flex-1 flex flex-col shadow-xl rounded-md overflow-hidden relative border border-neutral-300 dark:border-neutral-800 w-full min-h-[75vh] xl:min-h-0 flex-shrink-0">
          <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-24 max-h-[calc(100vh-10rem)]">
            {agentMessages.length === 0 && <EmptyState />}

            {agentMessages.length > 0 && (
              <MessageList
                messages={agentMessages}
                showDebug={showDebug}
                onToolResult={({ tool, toolCallId, output }) => {
                  addToolResult({
                    tool,
                    toolCallId,
                    output
                  });
                }}
                toolsRequiringConfirmation={toolsRequiringConfirmation}
              />
            )}
            <div ref={messagesEndRef} />
          </div>

          <ChatInput
            disabled={pendingToolCallConfirmation}
            placeholder={
              pendingToolCallConfirmation
                ? "Please respond to the tool confirmation above..."
                : "Send a message..."
            }
            value={agentInput}
            onInputChange={handleAgentInputChange}
            onSubmit={(e) => {
              handleAgentSubmit(e, {
                annotations: { hello: "world" }
              });
              setTextareaHeight("auto");
            }}
            onTextareaHeightChange={setTextareaHeight}
            status={status}
            onStop={stop}
          />
        </div>
        <div className="w-full xl:w-80 h-[500px] xl:h-auto flex flex-col shadow-xl rounded-md overflow-hidden relative border border-neutral-300 dark:border-neutral-800 flex-shrink-0">
          <GitHubIssues onIssueSelect={setSelectedIssue} />
        </div>
      </div>

      <Modal
        isOpen={selectedIssue !== null || previewIssue !== null}
        onClose={() => setSelectedIssue(null)}
        className="w-full max-w-2xl max-h-[80vh] p-0"
      >
        <GitHubIssueDetails
          issue={previewIssue || selectedIssue}
          onClose={() => setSelectedIssue(null)}
          isPreview={previewIssue !== null}
          isEditPreview={isEditPreview}
        />
      </Modal>
    </div>
  );
}
