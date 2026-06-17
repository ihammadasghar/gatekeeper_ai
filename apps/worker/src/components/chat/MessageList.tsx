import { Card } from "@/components/card/Card";
import { Avatar } from "@/components/avatar/Avatar";
import { MemoizedMarkdown } from "@/components/memoized-markdown";
import { ToolInvocationCard } from "@/components/tool-invocation-card/ToolInvocationCard";
import { isStaticToolUIPart } from "ai";
import type { UIMessage } from "@ai-sdk/react";
import type { tools } from "@/tools";

interface MessageListProps {
  messages: UIMessage[];
  showDebug: boolean;
  onToolResult: (params: {
    tool: string;
    toolCallId: string;
    output: unknown;
  }) => void;
  toolsRequiringConfirmation: (keyof typeof tools)[];
}

export function MessageList({
  messages,
  showDebug,
  onToolResult,
  toolsRequiringConfirmation
}: MessageListProps) {
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <>
      {messages.map((m, index) => {
        const isUser = m.role === "user";
        const showAvatar = index === 0 || messages[index - 1]?.role !== m.role;

        return (
          <div key={m.id}>
            {showDebug && (
              <pre className="text-xs text-muted-foreground overflow-scroll">
                {JSON.stringify(m, null, 2)}
              </pre>
            )}
            <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
              <div
                className={`flex gap-2 max-w-[85%] ${
                  isUser ? "flex-row-reverse" : "flex-row"
                }`}
              >
                {showAvatar && !isUser ? (
                  <Avatar username={"AI"} className="shrink-0" />
                ) : (
                  !isUser && <div className="w-8" />
                )}

                <div>
                  <div>
                    {m.parts?.map((part, i) => {
                      if (part.type === "text") {
                        return (
                          <div key={`${m.id}-text-${i}`}>
                            <Card
                              className={`p-3 rounded-md bg-neutral-100 dark:bg-neutral-900 ${
                                isUser
                                  ? "rounded-br-none"
                                  : "rounded-bl-none border-assistant-border"
                              } ${
                                part.text.startsWith("scheduled message")
                                  ? "border-accent/50"
                                  : ""
                              } relative`}
                            >
                              {part.text.startsWith("scheduled message") && (
                                <span className="absolute -top-3 -left-2 text-base">
                                  🕒
                                </span>
                              )}
                              <MemoizedMarkdown
                                id={`${m.id}-${i}`}
                                content={part.text.replace(
                                  /^scheduled message: /,
                                  ""
                                )}
                              />
                            </Card>
                            <p
                              className={`text-xs text-muted-foreground mt-1 ${
                                isUser ? "text-right" : "text-left"
                              }`}
                            >
                              {formatTime(
                                (m.metadata as Record<string, unknown>)
                                  ?.createdAt
                                  ? new Date(
                                      (m.metadata as Record<string, unknown>)
                                        .createdAt as string | number
                                    )
                                  : new Date()
                              )}
                            </p>
                          </div>
                        );
                      }

                      if (isStaticToolUIPart(part) && m.role === "assistant") {
                        const toolCallId = part.toolCallId;
                        const toolName = part.type.replace("tool-", "");
                        const needsConfirmation =
                          toolsRequiringConfirmation.includes(
                            toolName as keyof typeof tools
                          );

                        return (
                          <ToolInvocationCard
                            key={toolCallId}
                            toolUIPart={part}
                            toolCallId={toolCallId}
                            needsConfirmation={needsConfirmation}
                            onSubmit={({ toolCallId, result }) => {
                              onToolResult({
                                tool: toolName,
                                toolCallId,
                                output: result
                              });
                            }}
                            addToolResult={(toolCallId, result) => {
                              onToolResult({
                                tool: toolName,
                                toolCallId,
                                output: result
                              });
                            }}
                          />
                        );
                      }
                      return null;
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}
