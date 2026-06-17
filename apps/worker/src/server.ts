import { routeAgentRequest } from "agents";
import { AIChatAgent } from "@cloudflare/ai-chat";
import {
  streamText,
  type StreamTextOnFinishCallback,
  stepCountIs,
  createUIMessageStream,
  convertToModelMessages,
  createUIMessageStreamResponse,
  type ToolSet
} from "ai";
import { processToolCalls, cleanupMessages } from "./utils";
import { tools, executions } from "./tools";
import { getRepoFromEnv } from "./lib/github-utils";
import { getIssues } from "./lib/github-issues";
import { google } from "@ai-sdk/google";
import { SYSTEM_PROMPT } from "./lib/prompts";
// import { createWorkersAI } from "workers-ai-provider";
// const workersai = createWorkersAI({ binding: env.AI });
// const model = workersai.model("@cf/meta/llama-3-8b-instruct-v0.1");

const model = google("gemini-2.5-flash");

export class Chat extends AIChatAgent<Env> {
  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    options?: { abortSignal?: AbortSignal }
  ) {
    const allTools = tools;

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        const cleanedMessages = cleanupMessages(this.messages);

        // Process any pending tool calls from previous messages
        // This handles human-in-the-loop confirmations for tools
        const processedMessages = await processToolCalls({
          messages: cleanedMessages,
          dataStream: writer,
          tools: allTools,
          executions
        });
        const result = streamText({
          system: SYSTEM_PROMPT,
          messages: await convertToModelMessages(processedMessages),
          model,
          tools: allTools,
          onFinish: onFinish as unknown as StreamTextOnFinishCallback<
            typeof allTools
          >,
          stopWhen: stepCountIs(10),
          abortSignal: options?.abortSignal
        });

        writer.merge(result.toUIMessageStream());
      }
    });

    return createUIMessageStreamResponse({ stream });
  }
}

/**
 * Worker entry point that routes incoming requests to the appropriate handler
 */
export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext) {
    void _ctx;

    const url = new URL(request.url);
    const [owner, repo] = getRepoFromEnv(env.GITHUB_REPO_URL);
    if (url.pathname === "/api/github-issues") {
      const issues = await getIssues({
        token: env.GITHUB_TOKEN,
        owner,
        repo,
        query: "state:open"
      });
      return Response.json(issues);
    }

    if (url.pathname === "/check-gemini-key") {
      const hasOpenAIKey = !!process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      return Response.json({
        success: hasOpenAIKey
      });
    }

    if (url.pathname === "/api/repository-info") {
      try {
        const headers: HeadersInit = {
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "Cloudflare-Worker-Gatekeeper"
        };

        // Fetch repository details from GitHub API
        const repoResponse = await fetch(
          `https://api.github.com/repos/${owner}/${repo}`,
          { headers }
        );

        if (!repoResponse.ok) {
          throw new Error(
            `GitHub API error: ${repoResponse.status} ${repoResponse.statusText}`
          );
        }

        const repoData = (await repoResponse.json()) as Record<string, unknown>;
        return Response.json({
          owner,
          repo,
          url: env.GITHUB_REPO_URL,
          description: repoData.description as string | undefined,
          isPrivate: repoData.private as boolean,
          stars: repoData.stargazers_count as number,
          language: repoData.language as string | undefined
        });
      } catch (error) {
        console.error("Repository info fetch error:", error);
        return Response.json(
          {
            error: error instanceof Error ? error.message : "Unknown error"
          },
          { status: 500 }
        );
      }
    }
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      console.error(
        "GOOGLE_GENERATIVE_AI_API_KEY is not set, don't forget to set it locally in .dev.vars, and use `wrangler secret bulk .dev.vars` to upload it to production"
      );
    }
    return (
      // Route the request to our agent or return 404 if not found
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
