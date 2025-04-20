import { z } from "zod";

interface Tool {
  handler: (args: any) => Promise<{
    content: Array<{ type: "text"; text: string }>;
  }>;
  description: string;
}

interface ToolSet {
  tools: {
    [key: string]: Tool;
  };
}

// Browser Tools Toolset
export const browserTools: ToolSet = {
  tools: {
    "take-screenshot": {
      handler: async ({ url }) => ({
        content: [{ type: "text", text: `Screenshot taken of ${url}` }],
      }),
      description: "Take a screenshot of a webpage",
    },
    "extract-text": {
      handler: async ({ url, selector }) => ({
        content: [
          { type: "text", text: `Extracted text from ${selector} on ${url}` },
        ],
      }),
      description: "Extract text from a specific element on a webpage",
    },
    "click-element": {
      handler: async ({ url, selector }) => ({
        content: [
          { type: "text", text: `Clicked element ${selector} on ${url}` },
        ],
      }),
      description: "Click a specific element on a webpage",
    },
    "fill-form": {
      handler: async ({ url, formData }) => ({
        content: [{ type: "text", text: `Filled form on ${url} with data` }],
      }),
      description: "Fill out a form on a webpage",
    },
    "scroll-page": {
      handler: async ({ url, direction, amount }) => ({
        content: [
          {
            type: "text",
            text: `Scrolled ${direction} by ${amount}px on ${url}`,
          },
        ],
      }),
      description: "Scroll a webpage in a specific direction",
    },
  },
};

// AI Tools Toolset
export const aiTools: ToolSet = {
  tools: {
    "generate-text": {
      handler: async ({ prompt }) => ({
        content: [
          { type: "text", text: `Generated text based on prompt: ${prompt}` },
        ],
      }),
      description: "Generate text based on a prompt",
    },
    "summarize-text": {
      handler: async ({ text }) => ({
        content: [
          { type: "text", text: `Summarized text: ${text.slice(0, 100)}...` },
        ],
      }),
      description: "Summarize a piece of text",
    },
    "translate-text": {
      handler: async ({ text, targetLanguage }) => ({
        content: [
          { type: "text", text: `Translated text to ${targetLanguage}` },
        ],
      }),
      description: "Translate text to a target language",
    },
    "classify-text": {
      handler: async ({ text }) => ({
        content: [{ type: "text", text: `Classified text into category` }],
      }),
      description: "Classify text into categories",
    },
  },
};

// Data Tools Toolset
export const dataTools: ToolSet = {
  tools: {
    "fetch-data": {
      handler: async ({ endpoint }) => ({
        content: [{ type: "text", text: `Fetched data from ${endpoint}` }],
      }),
      description: "Fetch data from an API endpoint",
    },
    "transform-data": {
      handler: async ({ data, transformation }) => ({
        content: [
          { type: "text", text: `Transformed data using ${transformation}` },
        ],
      }),
      description: "Transform data using specified rules",
    },
    "analyze-data": {
      handler: async ({ data, metrics }) => ({
        content: [
          {
            type: "text",
            text: `Analyzed data for metrics: ${metrics.join(", ")}`,
          },
        ],
      }),
      description: "Analyze data based on specified metrics",
    },
    "export-data": {
      handler: async ({ data, format }) => ({
        content: [{ type: "text", text: `Exported data in ${format} format` }],
      }),
      description: "Export data in specified format",
    },
  },
};

// File System Tools Toolset
export const fileSystemTools: ToolSet = {
  tools: {
    "read-file": {
      handler: async ({ path }) => ({
        content: [{ type: "text", text: `Read file from ${path}` }],
      }),
      description: "Read contents of a file",
    },
    "write-file": {
      handler: async ({ path, content }) => ({
        content: [{ type: "text", text: `Wrote content to ${path}` }],
      }),
      description: "Write content to a file",
    },
    "list-directory": {
      handler: async ({ path }) => ({
        content: [{ type: "text", text: `Listed contents of ${path}` }],
      }),
      description: "List contents of a directory",
    },
    "delete-file": {
      handler: async ({ path }) => ({
        content: [{ type: "text", text: `Deleted file at ${path}` }],
      }),
      description: "Delete a file",
    },
  },
};

// Network Tools Toolset
export const networkTools: ToolSet = {
  tools: {
    "ping-host": {
      handler: async ({ host }) => ({
        content: [{ type: "text", text: `Pinged host ${host}` }],
      }),
      description: "Ping a network host",
    },
    "check-port": {
      handler: async ({ host, port }) => ({
        content: [{ type: "text", text: `Checked port ${port} on ${host}` }],
      }),
      description: "Check if a port is open on a host",
    },
    "trace-route": {
      handler: async ({ host }) => ({
        content: [{ type: "text", text: `Traced route to ${host}` }],
      }),
      description: "Trace network route to a host",
    },
    "resolve-dns": {
      handler: async ({ domain }) => ({
        content: [{ type: "text", text: `Resolved DNS for ${domain}` }],
      }),
      description: "Resolve DNS for a domain",
    },
  },
};

// Combine all tool sets into a single object
export const allToolSets: Record<string, ToolSet> = {
  browser: browserTools,
  ai: aiTools,
  data: dataTools,
  filesystem: fileSystemTools,
  network: networkTools,
};
