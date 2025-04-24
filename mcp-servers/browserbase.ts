#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  TextContent,
  ImageContent,
  McpError,
  ErrorCode,
} from "@modelcontextprotocol/sdk/types.js";
import puppeteer, { Browser, Page } from "puppeteer-core";
import { Browserbase } from "@browserbasehq/sdk";
import { z } from "zod";

// Environment variables configuration
const requiredEnvVars = {
  BROWSERBASE_API_KEY: process.env.BROWSERBASE_API_KEY,
  BROWSERBASE_PROJECT_ID: process.env.BROWSERBASE_PROJECT_ID,
};

// Validate required environment variables
Object.entries(requiredEnvVars).forEach(([name, value]) => {
  if (!value) throw new Error(`${name} environment variable is required`);
});

// Global State
const browsers = new Map<string, { browser: Browser; page: Page }>();
const screenshots = new Map<string, string>();

// Global state variable for the default browser session
let defaultBrowserSession: { browser: Browser; page: Page } | null = null;
const sessionId = "default"; // Using a consistent session ID for the default session

// Ensure browser session is initialized and valid
async function ensureBrowserSession(): Promise<{
  browser: Browser;
  page: Page;
}> {
  try {
    // If no session exists, create one
    if (!defaultBrowserSession) {
      defaultBrowserSession = await createNewBrowserSession(sessionId);
      return defaultBrowserSession;
    }

    // Try to perform a simple operation to check if the session is still valid
    try {
      await defaultBrowserSession.page.evaluate(() => document.title);
      return defaultBrowserSession;
    } catch (error) {
      // If we get an error indicating the session is invalid, reinitialize
      if (
        error instanceof Error &&
        (error.message.includes(
          "Target page, context or browser has been closed"
        ) ||
          error.message.includes("Session expired") ||
          error.message.includes("context destroyed") ||
          error.message.includes("Protocol error") ||
          error.message.includes("detached") ||
          error.message.includes("Attempted to use detached Frame"))
      ) {
        // Force cleanup of all sessions
        try {
          // Try to close the session if it's still accessible
          if (defaultBrowserSession) {
            try {
              await defaultBrowserSession.browser.close();
            } catch (e) {
              // Ignore errors when closing an already closed browser
            }
          }
          // Clean up all existing browser sessions
          for (const [id, sessionObj] of browsers.entries()) {
            try {
              await sessionObj.browser.close();
            } catch {
              // Ignore errors when closing
            }
            browsers.delete(id);
          }
        } catch {
          // Continue with reset even if cleanup fails
        }

        // Reset state
        browsers.clear();
        defaultBrowserSession = null;

        // Create a completely new session with delay to allow system to clean up
        await new Promise((resolve) => setTimeout(resolve, 1000));
        defaultBrowserSession = await createNewBrowserSession(sessionId);
        return defaultBrowserSession;
      }
      throw error; // Re-throw if it's a different type of error
    }
  } catch (error) {
    // If we still have a detached frame error after the first attempt, try a more aggressive approach
    if (
      error instanceof Error &&
      (error.message.includes("detached") ||
        error.message.includes("Attempted to use detached Frame"))
    ) {
      try {
        // Force cleanup
        browsers.clear();
        defaultBrowserSession = null;

        // Wait a bit longer to ensure resources are released
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Create a completely fresh connection
        defaultBrowserSession = await createNewBrowserSession(
          `fresh_${Date.now()}`
        );
        return defaultBrowserSession;
      } catch (retryError) {
        throw retryError;
      }
    }
    throw error;
  }
}

// Helper Functions
async function createNewBrowserSession(sessionId: string) {
  const bb = new Browserbase({
    apiKey: process.env.BROWSERBASE_API_KEY!,
  });
  const session = await bb.sessions.create({
    projectId: process.env.BROWSERBASE_PROJECT_ID!,
  });
  const browser = await puppeteer.connect({
    browserWSEndpoint: session.connectUrl,
  });

  const page = (await browser.pages())[0];
  browsers.set(sessionId, { browser, page });

  return { browser, page };
}

// Export the function to register Browserbase tools with an McpServer
export function registerBrowserbaseTools(server: McpServer) {
  // Resources can be accessed via server's built-in methods
  const resources = Array.from(screenshots.keys()).map((name) => ({
    uri: `screenshot://${name}`,
    mimeType: "image/png",
    name: `Screenshot: ${name}`,
  }));

  // Register tools
  server.tool(
    "browserbase_create_session",
    "A tool to create a new browser session for automated web interactions",
    {
      sessionId: z.string().optional().describe("Optional session ID to use"),
    },
    async (args, extra) => {
      try {
        // Check if session already exists
        const sessionIdArg = args.sessionId || "default";
        if (browsers.has(sessionIdArg)) {
          return {
            content: [
              {
                type: "text",
                text: "Session already exists",
              },
            ],
            isError: false,
          };
        }
        await createNewBrowserSession(sessionIdArg);
        return {
          content: [
            {
              type: "text",
              text: "Created new browser session",
            },
          ],
          isError: false,
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to create browser session: ${
                (error as Error).message
              }`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "browserbase_navigate",
    "A tool to navigate to a specific URL in a browser session",
    {
      url: z.string().url().describe("URL to navigate to"),
      sessionId: z.string().optional().describe("Optional session ID to use"),
    },
    async (args, extra) => {
      try {
        let session: { browser: Browser; page: Page };

        // Check if a specific session ID is requested
        if (args.sessionId && args.sessionId !== sessionId) {
          // Check if the requested session exists
          if (!browsers.has(args.sessionId)) {
            throw new Error(
              `Session with ID '${args.sessionId}' does not exist. Please create a session first.`
            );
          }
          // Use the specified session
          session = browsers.get(args.sessionId)!;
        } else {
          // Use or create the default session
          session = await ensureBrowserSession();
        }

        await session.page.goto(args.url);
        return {
          content: [
            {
              type: "text",
              text: `Navigated to ${args.url}`,
            },
          ],
          isError: false,
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Navigation failed: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "browserbase_screenshot",
    "A tool to take a screenshot of the current browser page",
    {
      sessionId: z.string().optional().describe("Optional session ID to use"),
      name: z.string().optional().describe("Name for the screenshot"),
    },
    async (args, extra) => {
      try {
        let session: { browser: Browser; page: Page };

        // Check if a specific session ID is requested
        if (args.sessionId && args.sessionId !== sessionId) {
          // Check if the requested session exists
          if (!browsers.has(args.sessionId)) {
            throw new Error(
              `Session with ID '${args.sessionId}' does not exist. Please create a session first.`
            );
          }
          // Use the specified session
          session = browsers.get(args.sessionId)!;
        } else {
          // Use or create the default session
          session = await ensureBrowserSession();
        }

        const screenshot = await session.page.screenshot({
          encoding: "base64",
          fullPage: false,
        });

        if (!screenshot) {
          throw new Error("Screenshot failed");
        }

        const screenshotName = args.name || `screenshot_${Date.now()}`;
        screenshots.set(screenshotName, screenshot as string);

        // Notification about resource change is not required in the new API

        return {
          content: [
            {
              type: "text",
              text: `Screenshot taken`,
            } as TextContent,
            {
              type: "image",
              data: screenshot as string,
              mimeType: "image/png",
            } as ImageContent,
          ],
          isError: false,
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Screenshot failed: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "browserbase_click",
    "A tool to click on a specific element in the browser page",
    {
      selector: z.string().describe("CSS selector for element to click"),
      sessionId: z.string().optional().describe("Optional session ID to use"),
    },
    async (args, extra) => {
      try {
        let session: { browser: Browser; page: Page };

        // Check if a specific session ID is requested
        if (args.sessionId && args.sessionId !== sessionId) {
          // Check if the requested session exists
          if (!browsers.has(args.sessionId)) {
            throw new Error(
              `Session with ID '${args.sessionId}' does not exist. Please create a session first.`
            );
          }
          // Use the specified session
          session = browsers.get(args.sessionId)!;
        } else {
          // Use or create the default session
          session = await ensureBrowserSession();
        }

        await session.page.click(args.selector);
        return {
          content: [
            {
              type: "text",
              text: `Clicked: ${args.selector}`,
            },
          ],
          isError: false,
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to click ${args.selector}: ${
                (error as Error).message
              }`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "browserbase_fill",
    "A tool to fill a form field with text in the browser page",
    {
      selector: z.string().describe("CSS selector for input field"),
      value: z.string().describe("Value to fill"),
      sessionId: z.string().optional().describe("Optional session ID to use"),
    },
    async (args, extra) => {
      try {
        let session: { browser: Browser; page: Page };

        // Check if a specific session ID is requested
        if (args.sessionId && args.sessionId !== sessionId) {
          // Check if the requested session exists
          if (!browsers.has(args.sessionId)) {
            throw new Error(
              `Session with ID '${args.sessionId}' does not exist. Please create a session first.`
            );
          }
          // Use the specified session
          session = browsers.get(args.sessionId)!;
        } else {
          // Use or create the default session
          session = await ensureBrowserSession();
        }

        await session.page.waitForSelector(args.selector);
        await session.page.type(args.selector, args.value);
        return {
          content: [
            {
              type: "text",
              text: `Filled ${args.selector} with: ${args.value}`,
            },
          ],
          isError: false,
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to fill ${args.selector}: ${
                (error as Error).message
              }`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "browserbase_get_text",
    "A tool to extract all readable text content from the current browser page",
    {
      sessionId: z.string().optional().describe("Optional session ID to use"),
    },
    async (args, extra) => {
      try {
        let session: { browser: Browser; page: Page };

        // Check if a specific session ID is requested
        if (args.sessionId && args.sessionId !== sessionId) {
          // Check if the requested session exists
          if (!browsers.has(args.sessionId)) {
            throw new Error(
              `Session with ID '${args.sessionId}' does not exist. Please create a session first.`
            );
          }
          // Use the specified session
          session = browsers.get(args.sessionId)!;
        } else {
          // Use or create the default session
          session = await ensureBrowserSession();
        }

        const bodyText = await session.page.evaluate(
          () => document.body.innerText
        );
        const content = bodyText
          .split("\n")
          .map((line: string) => line.trim())
          .filter((line: string) => {
            if (!line) return false;

            if (
              (line.includes("{") && line.includes("}")) ||
              line.includes("@keyframes") || // Remove CSS animations
              line.match(/^\.[a-zA-Z0-9_-]+\s*{/) || // Remove CSS lines starting with .className {
              line.match(/^[a-zA-Z-]+:[a-zA-Z0-9%\s\(\)\.,-]+;$/) // Remove lines like "color: blue;" or "margin: 10px;"
            ) {
              return false;
            }
            return true;
          })
          .map((line: string) => {
            return line.replace(
              /\\u([0-9a-fA-F]{4})/g,
              (_: string, hex: string) => String.fromCharCode(parseInt(hex, 16))
            );
          });

        return {
          content: [
            {
              type: "text",
              text: `Extracted content:\n${content.join("\n")}`,
            },
          ],
          isError: false,
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to extract content: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "browserbase_get_json",
    "A tool to extract JSON data from the current browser page",
    {
      selector: z
        .string()
        .optional()
        .describe(
          "Optional CSS selector to extract JSON from specific elements"
        ),
      sessionId: z.string().optional().describe("Optional session ID to use"),
    },
    async (args, extra) => {
      try {
        let session: { browser: Browser; page: Page };

        // Check if a specific session ID is requested
        if (args.sessionId && args.sessionId !== sessionId) {
          // Check if the requested session exists
          if (!browsers.has(args.sessionId)) {
            throw new Error(
              `Session with ID '${args.sessionId}' does not exist. Please create a session first.`
            );
          }
          // Use the specified session
          session = browsers.get(args.sessionId)!;
        } else {
          // Use or create the default session
          session = await ensureBrowserSession();
        }

        const result = await session.page.evaluate(
          (selector: string | undefined) => {
            // Helper function to find JSON in text
            function extractJSON(text: string) {
              const jsonObjects: any[] = [];
              let braceCount = 0;
              let start = -1;

              for (let i = 0; i < text.length; i++) {
                if (text[i] === "{") {
                  if (braceCount === 0) start = i;
                  braceCount++;
                } else if (text[i] === "}") {
                  braceCount--;
                  if (braceCount === 0 && start !== -1) {
                    try {
                      const jsonStr = text.slice(start, i + 1);
                      const parsed = JSON.parse(jsonStr);
                      jsonObjects.push(parsed);
                    } catch (e) {
                      // Invalid JSON, continue searching
                    }
                  }
                }
              }
              return jsonObjects;
            }

            // Get all text content based on selector or full page
            const elements = selector
              ? Array.from(document.querySelectorAll(selector))
              : [document.body];

            const results = {
              // Look for JSON in text content
              textContent: elements.flatMap((el) =>
                extractJSON(el.textContent || "")
              ),

              // Look for JSON in script tags
              scriptTags: Array.from(
                document.getElementsByTagName("script")
              ).flatMap((script) => {
                try {
                  if (script.type === "application/json") {
                    return [JSON.parse(script.textContent || "")];
                  }
                  return extractJSON(script.textContent || "");
                } catch (e) {
                  return [];
                }
              }),

              // Look for JSON in meta tags
              metaTags: Array.from(
                document.getElementsByTagName("meta")
              ).flatMap((meta) => {
                try {
                  const content = meta.getAttribute("content") || "";
                  return extractJSON(content);
                } catch (e) {
                  return [];
                }
              }),

              // Look for JSON-LD
              jsonLd: Array.from(
                document.querySelectorAll('script[type="application/ld+json"]')
              ).flatMap((script) => {
                try {
                  return [JSON.parse(script.textContent || "")];
                } catch (e) {
                  return [];
                }
              }),
            };

            return results;
          },
          args.selector
        );

        return {
          content: [
            {
              type: "text",
              text: `Found JSON content:\n${JSON.stringify(result, null, 2)}`,
            },
          ],
          isError: false,
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to extract JSON: ${(error as Error).message}`,
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
      name: "browserbase-server",
      version: "0.1.0",
    });

    registerBrowserbaseTools(server);

    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.error("Browserbase MCP Server running on stdio");

    process.on("SIGINT", async () => {
      // Clean up all browser sessions
      for (const [_, session] of browsers.entries()) {
        try {
          await session.browser.close();
        } catch (error) {
          console.error("Error closing browser:", error);
        }
      }
      await server.close();
      process.exit(0);
    });
  }

  runStandaloneServer().catch(console.error);
}
