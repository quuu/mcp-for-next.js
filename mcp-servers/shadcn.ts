#!/usr/bin/env node

/**
 * MCP server for shadcn/ui component references
 * This server provides tools to:
 * - List all available shadcn/ui components
 * - Get detailed information about specific components
 * - Get usage examples for components
 * - Search for components by keyword
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import * as cheerio from "cheerio";
import { z } from "zod";

/**
 * Interface for component information
 */
interface ComponentInfo {
  name: string;
  description: string;
  url: string;
  sourceUrl?: string;
  apiReference?: string;
  installation?: string;
  usage?: string;
  props?: Record<string, ComponentProp>;
  examples?: ComponentExample[];
}

/**
 * Interface for component property information
 */
interface ComponentProp {
  type: string;
  description: string;
  required: boolean;
  default?: string;
  example?: string;
}

/**
 * Interface for component example
 */
interface ComponentExample {
  title: string;
  code: string;
  description?: string;
}

// Cache for components data
const componentCache: Map<string, ComponentInfo> = new Map();
let componentsListCache: ComponentInfo[] | null = null;

// Constants
const SHADCN_DOCS_URL = "https://ui.shadcn.com";
const SHADCN_GITHUB_URL = "https://github.com/shadcn-ui/ui";
const SHADCN_RAW_GITHUB_URL =
  "https://raw.githubusercontent.com/shadcn-ui/ui/main";

// Create axios instance
const axiosInstance = axios.create({
  timeout: 10000,
  headers: {
    "User-Agent": "Mozilla/5.0 (compatible; ShadcnUiMcpServer/0.1.0)",
  },
});

/**
 * Creates a standardized success response
 * @param data Data to include in the response
 * @returns Formatted response object
 */
function createSuccessResponse(data: any) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

/**
 * Handles Axios errors consistently
 * @param error The caught error
 * @param context Context information for the error message
 * @throws McpError with appropriate error code and message
 */
function handleAxiosError(error: unknown, context: string): never {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 404) {
      throw new McpError(ErrorCode.InvalidParams, `${context} not found`);
    } else {
      throw new McpError(
        ErrorCode.InternalError,
        `${context}: ${error.message}`
      );
    }
  }
  throw error;
}

/**
 * Extracts component description from the page
 * @param $ Cheerio instance
 * @returns Extracted description
 */
function extractDescription($: cheerio.CheerioAPI): string {
  let description = "";
  const descriptionElement = $("h1").first().next("p");
  if (descriptionElement.length > 0) {
    // Get only text content, removing any JavaScript code
    const clonedElement = descriptionElement.clone();
    clonedElement.find("script").remove();
    description = clonedElement.text().trim();
  }
  return description;
}

/**
 * Extracts installation instructions from the page
 * @param $ Cheerio instance
 * @returns Installation instructions
 */
function extractInstallation($: cheerio.CheerioAPI): string {
  let installation = "";
  const installSection = $("h2").filter(
    (_, el) => $(el).text().trim() === "Installation"
  );
  if (installSection.length > 0) {
    // Find installation command
    const codeBlock = installSection.nextAll("pre").first();
    if (codeBlock.length > 0) {
      installation = codeBlock.text().trim();
    }
  }
  return installation;
}

/**
 * Extracts usage examples from the page
 * @param $ Cheerio instance
 * @returns Usage examples
 */
function extractUsage($: cheerio.CheerioAPI): string {
  let usage = "";
  const usageSection = $("h2").filter(
    (_, el) => $(el).text().trim() === "Usage"
  );
  if (usageSection.length > 0) {
    const codeBlocks = usageSection.nextAll("pre");
    if (codeBlocks.length > 0) {
      codeBlocks.each((_, el) => {
        usage += $(el).text().trim() + "\n\n";
      });
    }
  }
  return usage;
}

/**
 * Extracts variant information from the page
 * @param $ Cheerio instance
 * @param componentName Name of the component
 * @returns Object containing variant properties
 */
function extractVariants(
  $: cheerio.CheerioAPI,
  componentName: string
): Record<string, ComponentProp> {
  const props: Record<string, ComponentProp> = {};

  // Extract variants from Examples section
  const examplesSection = $("h2").filter(
    (_, el) => $(el).text().trim() === "Examples"
  );
  if (examplesSection.length > 0) {
    // Find each variant
    const variantHeadings = examplesSection.nextAll("h3");

    variantHeadings.each((_, heading) => {
      const variantName = $(heading).text().trim();

      // Get variant code example
      let codeExample = "";

      // Find Code tab
      const codeTab = $(heading).nextAll(".tabs-content").first();
      if (codeTab.length > 0) {
        const codeBlock = codeTab.find("pre");
        if (codeBlock.length > 0) {
          codeExample = codeBlock.text().trim();
        }
      }

      props[variantName] = {
        type: "variant",
        description: `${variantName} variant of the ${componentName} component`,
        required: false,
        example: codeExample,
      };
    });
  }

  return props;
}

/**
 * Fetches component details from the shadcn/ui documentation
 * @param componentName Name of the component to fetch
 * @returns Component information
 */
async function fetchComponentDetails(
  componentName: string
): Promise<ComponentInfo> {
  const response = await axiosInstance.get(
    `${SHADCN_DOCS_URL}/docs/components/${componentName}`
  );
  const $ = cheerio.load(response.data);

  // Extract component information
  const title = $("h1").first().text().trim();

  // Extract description properly
  const description = extractDescription($);

  // Extract GitHub source code link
  const sourceUrl = `${SHADCN_GITHUB_URL}/tree/main/apps/www/registry/default/ui/${componentName}`;

  // Extract installation instructions
  const installation = extractInstallation($);

  // Extract usage examples
  const usage = extractUsage($);

  // Extract variant information
  const props = extractVariants($, componentName);

  return {
    name: componentName,
    description,
    url: `${SHADCN_DOCS_URL}/docs/components/${componentName}`,
    sourceUrl,
    installation: installation.trim(),
    usage: usage.trim(),
    props: Object.keys(props).length > 0 ? props : undefined,
  };
}

/**
 * Collects general code examples from the page
 * @param $ Cheerio instance
 * @param examples Array to add examples to
 */
function collectGeneralCodeExamples(
  $: cheerio.CheerioAPI,
  examples: ComponentExample[]
): void {
  const codeBlocks = $("pre");
  codeBlocks.each((i, el) => {
    const code = $(el).text().trim();
    if (code) {
      // Find heading before code block
      let title = "Code Example " + (i + 1);
      let description = "Code example";

      // Look for headings
      let prevElement = $(el).prev();
      while (
        prevElement.length &&
        !prevElement.is("h1") &&
        !prevElement.is("h2") &&
        !prevElement.is("h3")
      ) {
        prevElement = prevElement.prev();
      }

      if (prevElement.is("h2") || prevElement.is("h3")) {
        title = prevElement.text().trim();
        description = `${title} example`;
      }

      examples.push({
        title,
        code,
        description,
      });
    }
  });
}

/**
 * Collects examples from a specific section
 * @param $ Cheerio instance
 * @param sectionName Name of the section to collect from
 * @param descriptionPrefix Prefix for the description
 * @param examples Array to add examples to
 */
function collectSectionExamples(
  $: cheerio.CheerioAPI,
  sectionName: string,
  descriptionPrefix: string,
  examples: ComponentExample[]
): void {
  const section = $("h2").filter(
    (_, el) => $(el).text().trim() === sectionName
  );
  if (section.length > 0) {
    const codeBlocks = section.nextAll("pre");
    codeBlocks.each((i, el) => {
      const code = $(el).text().trim();
      if (code) {
        examples.push({
          title: `${sectionName} Example ${i + 1}`,
          code: code,
          description: descriptionPrefix,
        });
      }
    });
  }
}

/**
 * Collects examples from GitHub repository
 * @param componentName Name of the component
 * @param examples Array to add examples to
 */
async function collectGitHubExamples(
  componentName: string,
  examples: ComponentExample[]
): Promise<void> {
  try {
    const githubResponse = await axiosInstance.get(
      `${SHADCN_RAW_GITHUB_URL}/apps/www/registry/default/example/${componentName}-demo.tsx`
    );

    if (githubResponse.status === 200) {
      examples.push({
        title: "GitHub Demo Example",
        code: githubResponse.data,
      });
    }
  } catch (error) {
    // Continue even if GitHub fetch fails
    console.error(
      `Failed to fetch GitHub example for ${componentName}:`,
      error
    );
  }
}

/**
 * Fetches component examples from documentation and GitHub
 * @param componentName Name of the component
 * @returns Array of component examples
 */
async function fetchComponentExamples(
  componentName: string
): Promise<ComponentExample[]> {
  const response = await axiosInstance.get(
    `${SHADCN_DOCS_URL}/docs/components/${componentName}`
  );
  const $ = cheerio.load(response.data);

  const examples: ComponentExample[] = [];

  // Collect examples from different sources
  collectGeneralCodeExamples($, examples);
  collectSectionExamples($, "Usage", "Basic usage example", examples);
  collectSectionExamples($, "Link", "Link usage example", examples);
  await collectGitHubExamples(componentName, examples);

  return examples;
}

/**
 * Ensures the components list is loaded in cache
 * @throws McpError if components list cannot be loaded
 */
async function ensureComponentsListLoaded(): Promise<void> {
  if (!componentsListCache) {
    // Fetch the list of components
    try {
      const response = await axiosInstance.get(
        `${SHADCN_DOCS_URL}/docs/components`
      );
      const $ = cheerio.load(response.data);

      const components: ComponentInfo[] = [];

      // Extract component links
      $("a").each((_, element) => {
        const link = $(element);
        const url = link.attr("href");

        if (url && url.startsWith("/docs/components/")) {
          const name = url.split("/").pop() || "";

          components.push({
            name,
            description: "", // Will be populated when fetching details
            url: `${SHADCN_DOCS_URL}${url}`,
          });
        }
      });

      componentsListCache = components;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to fetch shadcn/ui components: ${error.message}`
        );
      }
      throw error;
    }
  }

  if (!componentsListCache) {
    throw new McpError(
      ErrorCode.InternalError,
      "Failed to load components list"
    );
  }
}

/**
 * Searches components by query string
 * @param query Search query
 * @returns Filtered components
 */
function searchComponentsByQuery(query: string): ComponentInfo[] {
  if (!componentsListCache) {
    return [];
  }

  return componentsListCache.filter((component) => {
    return (
      component.name.includes(query) ||
      component.description.toLowerCase().includes(query)
    );
  });
}

/**
 * Register ShadcnUI tools with an McpServer
 */
export function registerShadcnTools(server: McpServer) {
  // List components tool
  server.tool("list_shadcn_components", {}, async (args, extra) => {
    try {
      await ensureComponentsListLoaded();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(componentsListCache, null, 2),
          },
        ],
      };
    } catch (error) {
      handleAxiosError(error, "Failed to list components");
      return {
        content: [
          {
            type: "text" as const,
            text: "Failed to list components",
          },
        ],
        isError: true,
      };
    }
  });

  // Get component details tool
  server.tool(
    "get_component_details",
    {
      componentName: z
        .string()
        .describe(
          'Name of the shadcn/ui component (e.g., "accordion", "button")'
        ),
    },
    async (args, extra) => {
      try {
        const componentName = args.componentName.toLowerCase();

        // Check cache first
        if (componentCache.has(componentName)) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  componentCache.get(componentName),
                  null,
                  2
                ),
              },
            ],
          };
        }

        // Fetch component details
        const componentInfo = await fetchComponentDetails(componentName);

        // Save to cache
        componentCache.set(componentName, componentInfo);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(componentInfo, null, 2),
            },
          ],
        };
      } catch (error) {
        handleAxiosError(error, `Component "${args.componentName}"`);
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to get details for component: ${args.componentName}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Get component examples tool
  server.tool(
    "get_component_examples",
    {
      componentName: z
        .string()
        .describe(
          'Name of the shadcn/ui component (e.g., "accordion", "button")'
        ),
    },
    async (args, extra) => {
      try {
        const componentName = args.componentName.toLowerCase();

        // Fetch component examples
        const examples = await fetchComponentExamples(componentName);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(examples, null, 2),
            },
          ],
        };
      } catch (error) {
        handleAxiosError(
          error,
          `Component examples for "${args.componentName}"`
        );
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to get examples for component: ${args.componentName}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Search components tool
  server.tool(
    "search_components",
    {
      query: z.string().describe("Search query to find relevant components"),
    },
    async (args, extra) => {
      try {
        const query = args.query.toLowerCase();

        // Ensure components list is loaded
        await ensureComponentsListLoaded();

        // Filter components matching the search query
        const results = searchComponentsByQuery(query);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      } catch (error) {
        if (error instanceof Error) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Search failed: ${error.message}`,
              },
            ],
            isError: true,
          };
        }
        return {
          content: [
            {
              type: "text" as const,
              text: `Search failed: ${String(error)}`,
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
      name: "shadcn-ui-server",
      version: "0.1.0",
    });

    registerShadcnTools(server);

    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.error("shadcn/ui MCP server running on stdio");

    process.on("SIGINT", async () => {
      await server.close();
      process.exit(0);
    });
  }

  runStandaloneServer().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
  });
}
