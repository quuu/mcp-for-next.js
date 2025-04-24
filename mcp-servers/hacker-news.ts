#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import * as cheerio from "cheerio";
import { z } from "zod";

interface Story {
  title: string;
  url?: string;
  points: number;
  author: string;
  time: string;
  commentCount: number;
  rank: number;
}

const isValidStoryType = (type: string): boolean => {
  return ["top", "new", "ask", "show", "jobs"].includes(type);
};

const baseUrl = "https://news.ycombinator.com";

async function fetchStories(type: string = "top"): Promise<Story[]> {
  try {
    const url = type === "top" ? baseUrl : `${baseUrl}/${type}`;
    const response = await fetch(url);
    const html = await response.text();
    const $ = cheerio.load(html);
    const stories: Story[] = [];

    $(".athing").each((i: number, elem: any) => {
      const titleRow = $(elem);
      const metadataRow = titleRow.next();

      const rank = parseInt(titleRow.find(".rank").text(), 10);
      const titleElement = titleRow.find(".titleline > a").first();
      const title = titleElement.text();
      const url = titleElement.attr("href");
      const sitebit = titleRow.find(".sitebit");

      const points = parseInt(metadataRow.find(".score").text(), 10) || 0;
      const author = metadataRow.find(".hnuser").text();
      const time = metadataRow.find(".age").attr("title") || "";
      const commentText = metadataRow.find("a").last().text();
      const commentCount = parseInt(commentText.split("&nbsp;")[0]) || 0;

      stories.push({
        title,
        url: url?.startsWith("item?id=") ? `${baseUrl}/${url}` : url,
        points,
        author,
        time,
        commentCount,
        rank,
      });
    });

    return stories;
  } catch (error) {
    if (error instanceof Error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to fetch stories: ${error.message}`
      );
    }
    throw error;
  }
}

export function registerHackerNewsTools(server: McpServer) {
  server.tool(
    "get_stories",
    {
      type: z
        .enum(["top", "new", "ask", "show", "jobs"])
        .default("top")
        .describe("Type of stories to fetch (top, new, ask, show, jobs)"),
      limit: z
        .number()
        .min(1)
        .max(30)
        .default(10)
        .describe("Number of stories to return (max 30)"),
    },
    async ({ type, limit }) => {
      try {
        const stories = await fetchStories(type);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(stories.slice(0, limit), null, 2),
            },
          ],
        };
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }
        return {
          content: [
            {
              type: "text",
              text: `Failed to fetch stories: ${error}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}

// If this file is executed directly, start a standalone server
if (require.main === module) {
  async function runStandaloneServer() {
    const server = new McpServer({
      name: "hacker-news-server",
      version: "0.1.0",
    });

    registerHackerNewsTools(server);

    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.error("Hacker News MCP server running on stdio");

    process.on("SIGINT", async () => {
      await server.close();
      process.exit(0);
    });
  }

  runStandaloneServer().catch(console.error);
}
