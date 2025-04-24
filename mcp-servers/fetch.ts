#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fetch from "node-fetch";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface Image {
  src: string;
  alt: string;
}

interface ExtractedContent {
  markdown: string;
  images: Image[];
}

const DEFAULT_USER_AGENT_AUTONOMOUS =
  "ModelContextProtocol/1.0 (Autonomous; +https://github.com/modelcontextprotocol/servers)";
const DEFAULT_USER_AGENT_MANUAL =
  "ModelContextProtocol/1.0 (User-Specified; +https://github.com/modelcontextprotocol/servers)";

const FetchArgsSchema = z.object({
  url: z.string().url(),
  maxLength: z.number().positive().max(1000000).default(20000),
  startIndex: z.number().min(0).default(0),
  raw: z.boolean().default(false),
});

function extractContentFromHtml(
  html: string,
  url: string
): ExtractedContent | string {
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  if (!article || !article.content) {
    return "<e>Page failed to be simplified from HTML</e>";
  }

  // Extract images from the article content only
  const articleDom = new JSDOM(article.content);
  const imgElements = Array.from(
    articleDom.window.document.querySelectorAll("img")
  );

  // Fix the type issue with img elements using type assertion
  const images: Image[] = imgElements.map((img) => {
    const imgElement = img as unknown as HTMLImageElement;
    const src = imgElement.src;
    const alt = imgElement.alt || "";
    return { src, alt };
  });

  const turndownService = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
  });
  const markdown = turndownService.turndown(article.content);

  return { markdown, images };
}

async function commandExists(cmd: string): Promise<boolean> {
  try {
    await execAsync(`which ${cmd}`);
    return true;
  } catch {
    return false;
  }
}

interface FetchResult {
  content: string;
  prefix: string;
  imageUrls?: string[];
}

async function fetchUrl(
  url: string,
  userAgent: string,
  forceRaw = false
): Promise<FetchResult> {
  const response = await fetch(url, {
    headers: { "User-Agent": userAgent },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url} - status code ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  const isHtml =
    text.toLowerCase().includes("<html") || contentType.includes("text/html");

  if (isHtml && !forceRaw) {
    const result = extractContentFromHtml(text, url);
    if (typeof result === "string") {
      return {
        content: result,
        prefix: "",
      };
    }

    const { markdown, images } = result;
    const imageUrls = images.map((img) => img.src);

    return {
      content: markdown,
      prefix: "",
      imageUrls,
    };
  }

  return {
    content: text,
    prefix: `Content type ${contentType} cannot be simplified to markdown, but here is the raw content:\n`,
  };
}

// Register Fetch tools with the MCP Server
export function registerFetchTools(server: McpServer) {
  server.tool(
    "fetch",
    "A tool to fetch and extract content from any URL, converting HTML pages to readable markdown",
    {
      url: z.string().url().describe("The URL to fetch content from"),
      maxLength: z
        .number()
        .positive()
        .max(1000000)
        .default(20000)
        .describe("Maximum length of content to return"),
      startIndex: z
        .number()
        .min(0)
        .default(0)
        .describe("Starting index for content if truncated"),
      raw: z
        .boolean()
        .default(false)
        .describe(
          "Whether to return raw content instead of processed markdown"
        ),
    },
    async ({ url, maxLength, startIndex, raw }) => {
      try {
        const { content, prefix, imageUrls } = await fetchUrl(
          url,
          DEFAULT_USER_AGENT_AUTONOMOUS,
          raw
        );

        let finalContent = content;
        if (finalContent.length > maxLength) {
          finalContent = finalContent.slice(startIndex, startIndex + maxLength);
          finalContent += `\n\n<e>Content truncated. Call the fetch tool with a start_index of ${
            startIndex + maxLength
          } to get more content.</e>`;
        }

        let imagesSection = "";
        if (imageUrls && imageUrls.length > 0) {
          imagesSection =
            "\n\nImages found in article:\n" +
            imageUrls.map((url) => `- ${url}`).join("\n");
        }

        return {
          content: [
            {
              type: "text",
              text: `${prefix}Contents of ${url}:\n${finalContent}${imagesSection}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${
                error instanceof Error ? error.message : String(error)
              }`,
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
      name: "mcp-fetch",
      version: "1.0.0",
    });

    registerFetchTools(server);

    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.error("Fetch server running...");
  }

  runStandaloneServer().catch((error) => {
    process.stderr.write(`Fatal error running server: ${error}\n`);
    process.exit(1);
  });
}
