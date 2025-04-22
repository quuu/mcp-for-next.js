import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createInterface } from "node:readline";
import {
  ListToolsRequest,
  ListToolsResultSchema,
  CallToolRequest,
  CallToolResultSchema,
  ListPromptsRequest,
  ListPromptsResultSchema,
  GetPromptRequest,
  GetPromptResultSchema,
  ListResourcesRequest,
  ListResourcesResultSchema,
  LoggingMessageNotificationSchema,
  ResourceListChangedNotificationSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Create readline interface for user input
const readline = createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Track received notifications for debugging resumability
let notificationCount = 0;

// Global client and transport for interactive commands
let client: Client | null = null;
let transport: StreamableHTTPClientTransport | null = null;
// let serverUrl = "http://localhost:3000/mcp-stateless";
let serverUrl = "https://mcp-for-next-js-beta.vercel.app/mcp-stateless";
let notificationsToolLastEventId: string | undefined = undefined;
let sessionId: string | undefined = undefined;

// Add a debug flag for session tracking
let debugSession = false;

function logSession(message: string): void {
  if (debugSession) {
    console.log(`[SESSION DEBUG] ${message}`);
  }
}

async function main(): Promise<void> {
  console.log("MCP Interactive Client");
  console.log("=====================");

  // Connect to server immediately with default settings
  await connect();

  // Print help and start the command loop
  printHelp();
  commandLoop();
}

function printHelp(): void {
  console.log("\nAvailable commands:");
  console.log(
    "  connect [url]              - Connect to MCP server (default: http://localhost:3000/mcp)"
  );
  console.log("  disconnect                 - Disconnect from server");
  console.log("  terminate-session          - Terminate the current session");
  console.log("  reconnect                  - Reconnect to the server");
  console.log(
    "  reset-session              - Reset session and reconnect (use when having session issues)"
  );
  console.log(
    "  force-new-session          - Force a completely new session by clearing all cached state"
  );
  console.log(
    "  random-session             - Create a completely random new session ID and connect with it"
  );
  console.log("  debug-session [on|off]     - Toggle session debugging output");
  console.log("  list-tools                 - List available tools");
  console.log(
    "  call-tool <name> [args]    - Call a tool with optional JSON arguments"
  );
  console.log("  greet [name]               - Call the greet tool");
  console.log(
    "  multi-greet [name]         - Call the multi-greet tool with notifications"
  );
  console.log(
    "  start-notifications [interval] [count] - Start periodic notifications"
  );
  console.log("  list-prompts               - List available prompts");
  console.log(
    "  get-prompt [name] [args]   - Get a prompt with optional JSON arguments"
  );
  console.log("  list-resources             - List available resources");
  console.log("  help                       - Show this help");
  console.log("  quit                       - Exit the program");
}

function commandLoop(): void {
  readline.question("\n> ", async (input) => {
    const args = input.trim().split(/\s+/);
    const command = args[0]?.toLowerCase();

    console.log("Current sessionId", sessionId);
    try {
      switch (command) {
        case "connect":
          await connect(args[1]);
          break;

        case "disconnect":
          await disconnect();
          break;

        case "terminate-session":
          await terminateSession();
          break;

        case "reconnect":
          await reconnect();
          break;

        case "reset-session":
          await resetSession();
          break;

        case "force-new-session":
          await forceCompletelyNewSession();
          break;

        case "random-session":
          await connectWithRandomSession();
          break;

        case "debug-session":
          if (args[1] === "on") {
            debugSession = true;
            console.log("Session debugging enabled");
          } else if (args[1] === "off") {
            debugSession = false;
            console.log("Session debugging disabled");
          } else {
            debugSession = !debugSession;
            console.log(
              `Session debugging ${debugSession ? "enabled" : "disabled"}`
            );
          }
          break;

        case "list-tools":
          await listTools();
          break;

        case "call-tool":
          if (args.length < 2) {
            console.log("Usage: call-tool <name> [args]");
          } else {
            const toolName = args[1];
            let toolArgs = {};
            if (args.length > 2) {
              try {
                toolArgs = JSON.parse(args.slice(2).join(" "));
              } catch {
                console.log("Invalid JSON arguments. Using empty args.");
              }
            }
            await callTool(toolName, toolArgs);
          }
          break;

        case "greet":
          await callGreetTool(args[1] || "MCP User");
          break;

        case "multi-greet":
          await callMultiGreetTool(args[1] || "MCP User");
          break;

        case "start-notifications": {
          const interval = args[1] ? parseInt(args[1], 10) : 2000;
          const count = args[2] ? parseInt(args[2], 10) : 10;
          await startNotifications(interval, count);
          break;
        }

        case "list-prompts":
          await listPrompts();
          break;

        case "get-prompt":
          if (args.length < 2) {
            console.log("Usage: get-prompt <name> [args]");
          } else {
            const promptName = args[1];
            let promptArgs = {};
            if (args.length > 2) {
              try {
                promptArgs = JSON.parse(args.slice(2).join(" "));
              } catch {
                console.log("Invalid JSON arguments. Using empty args.");
              }
            }
            await getPrompt(promptName, promptArgs);
          }
          break;

        case "list-resources":
          await listResources();
          break;

        case "help":
          printHelp();
          break;

        case "quit":
        case "exit":
          await cleanup();
          return;

        default:
          if (command) {
            console.log(`Unknown command: ${command}`);
          }
          break;
      }
    } catch (error) {
      console.error(`Error executing command: ${error}`);
    }

    // Continue the command loop
    commandLoop();
  });
}

async function connect(
  url?: string,
  forceNewSession: boolean = false
): Promise<void> {
  if (client) {
    console.log("Already connected. Disconnect first.");
    return;
  }

  if (url) {
    serverUrl = url;
  }

  // If forceNewSession is true, clear any existing sessionId
  if (forceNewSession) {
    console.log("Forcing new session");
    sessionId = undefined;
    logSession("SessionId cleared due to forceNewSession");
  }

  logSession(`Connecting with sessionId: ${sessionId || "undefined"}`);
  console.log(
    `Connecting to ${serverUrl}${
      sessionId ? " with existing sessionId" : ""
    }...`
  );

  try {
    // Create a new client
    client = new Client({
      name: "example-client",
      version: "1.0.0",
    });
    client.onerror = (error) => {
      console.error("\x1b[31mClient error:", error, "\x1b[0m");
    };

    transport = new StreamableHTTPClientTransport(new URL(serverUrl), {
      sessionId: sessionId,
    });
    logSession(`Created transport with sessionId: ${sessionId || "undefined"}`);
    // Set up notification handlers
    client.setNotificationHandler(
      LoggingMessageNotificationSchema,
      (notification) => {
        notificationCount++;
        console.log(
          `\nNotification #${notificationCount}: ${notification.params.level} - ${notification.params.data}`
        );
        // Re-display the prompt
        process.stdout.write("> ");
      }
    );

    client.setNotificationHandler(
      ResourceListChangedNotificationSchema,
      async (_) => {
        console.log(`\nResource list changed notification received!`);
        try {
          if (!client) {
            console.log("Client disconnected, cannot fetch resources");
            return;
          }
          const resourcesResult = await client.request(
            {
              method: "resources/list",
              params: {},
            },
            ListResourcesResultSchema
          );
          console.log(
            "Available resources count:",
            resourcesResult.resources.length
          );
        } catch {
          console.log("Failed to list resources after change notification");
        }
        // Re-display the prompt
        process.stdout.write("> ");
      }
    );

    // Connect the client
    try {
      await client.connect(transport);
      sessionId = transport.sessionId;
      console.log("Transport created with session ID:", sessionId);
      console.log("Connected to MCP server");
    } catch (connectError) {
      if (
        connectError instanceof Error &&
        connectError.message.includes("Server already initialized")
      ) {
        console.log(
          "Server reports it's already initialized. Using the current session..."
        );

        // If connection failed but transport has a session ID, we can still use it
        if (transport.sessionId) {
          sessionId = transport.sessionId;
          console.log("Using transport session ID:", sessionId);
          return; // Connection functionally succeeded
        } else {
          // If no session ID, try waiting briefly and retrying once
          console.log(
            "No session ID available. Retrying connection after a short delay..."
          );
          await new Promise((resolve) => setTimeout(resolve, 1000));
          try {
            await client.connect(transport);
            sessionId = transport.sessionId;
            console.log(
              "Transport created with session ID on retry:",
              sessionId
            );
            console.log("Connected to MCP server");
          } catch (retryError) {
            throw retryError; // If retry also fails, propagate the error
          }
        }
      } else {
        throw connectError; // Rethrow if it's not the specific error we're handling
      }
    }
  } catch (error) {
    console.error("Failed to connect:", error);
    client = null;
    transport = null;
  }
}

async function disconnect(): Promise<void> {
  if (!client || !transport) {
    console.log("Not connected.");
    return;
  }

  try {
    await transport.close();
    console.log("Disconnected from MCP server");
    client = null;
    transport = null;
  } catch (error) {
    console.error("Error disconnecting:", error);
  }
}

async function terminateSession(): Promise<void> {
  if (!client || !transport) {
    console.log("Not connected.");
    return;
  }

  try {
    console.log("Terminating session with ID:", transport.sessionId);
    await transport.terminateSession();
    console.log("Session terminated successfully");

    // Check if sessionId was cleared after termination
    if (!transport.sessionId) {
      console.log("Session ID has been cleared");
      sessionId = undefined;

      // Also close the transport and clear client objects
      await transport.close();
      console.log("Transport closed after session termination");
      client = null;
      transport = null;
    } else {
      console.log(
        "Server responded with 405 Method Not Allowed (session termination not supported)"
      );
      console.log("Session ID is still active:", transport.sessionId);
    }
  } catch (error) {
    console.error("Error terminating session:", error);
  }
}

async function reconnect(): Promise<void> {
  if (client) {
    await disconnect();
  }
  // Always force a new session on reconnect
  await connect(undefined, true);
}

async function resetSession(): Promise<void> {
  console.log("Resetting session completely...");

  // Disconnect if connected
  if (client) {
    await disconnect();
  }

  // Clear session ID
  sessionId = undefined;

  // Reconnect with a fresh session
  await connect();

  console.log("Session has been reset. New session ID:", sessionId);
}

// Enhance all request methods to check for session updates
async function makeRequestWithSessionCheck<T, U>(
  requestFn: () => Promise<T>,
  handleResult: (result: T) => U
): Promise<U> {
  try {
    const result = await requestFn();

    // Check for session update in result
    if (result && typeof result === "object" && "__session_update" in result) {
      const update = (result as any).__session_update;
      if (update && update.oldSessionId && update.newSessionId) {
        console.log(
          `\n[!] Server requested session ID update: ${update.oldSessionId} → ${update.newSessionId}`
        );

        // Update session ID and reconnect
        await reconnectWithNewSession(update.newSessionId);

        // Retry the request with new session
        const newResult = await requestFn();
        return handleResult(newResult);
      }
    }

    return handleResult(result);
  } catch (error) {
    // Check for reset_session flag in error response
    if (error instanceof Error) {
      const errorText = error.message;
      try {
        // Try to parse the error message to extract JSON
        const match = errorText.match(
          /Error POSTing to endpoint \(HTTP \d+\): (.*)/
        );
        if (match && match[1]) {
          const errorJson = JSON.parse(match[1]);

          // Check if the error contains the reset_session flag
          if (errorJson && errorJson.error && errorJson.error.__reset_session) {
            console.log("\n[!] Server requested session reset due to error");
            console.log("Creating a new random session and reconnecting...");

            // Force a completely new session
            await forceCompletelyNewSession();

            // Retry the request with the new session
            console.log("Retrying request with new session ID:", sessionId);
            try {
              const newResult = await requestFn();
              return handleResult(newResult);
            } catch (retryError) {
              console.error("Retry failed after session reset:", retryError);
              throw retryError;
            }
          }
        }
      } catch (parseError) {
        // Ignore JSON parsing errors in the error message
      }

      // Check if error indicates session expiration or not found
      if (
        error.message.includes("Server not initialized") ||
        error.message.includes("Session not found") ||
        error.message.includes("Server already initialized")
      ) {
        // Customize the message based on the error
        if (error.message.includes("Server already initialized")) {
          console.log(
            "Server reports it's already initialized. Continuing with current session..."
          );
          try {
            // Try the request again as-is
            console.log("Retrying request with current session...");
            const newResult = await requestFn();
            return handleResult(newResult);
          } catch (retryError) {
            // If retry fails, try with a completely new random session
            console.log(
              "Retry failed. Creating a completely new random session..."
            );
            await forceCompletelyNewSession();
            console.log("Retrying request with new session ID:", sessionId);
            const newResult = await requestFn();
            return handleResult(newResult);
          }
        } else {
          console.log(
            "Session expired or not found. Attempting to reconnect with a new session..."
          );
          sessionId = undefined; // Clear session ID to get a fresh one
          await reconnect();
        }

        // Retry the request
        try {
          console.log("Retrying request with new session ID:", sessionId);
          const newResult = await requestFn();
          return handleResult(newResult);
        } catch (retryError) {
          console.error("Retry failed with error:", retryError);
          throw retryError; // If retry fails, propagate the error
        }
      }
    }

    throw error;
  }
}

async function callTool(
  name: string,
  args: Record<string, unknown>
): Promise<void> {
  if (!client) {
    console.log("Not connected to server.");
    return;
  }

  try {
    await makeRequestWithSessionCheck(
      async () => {
        const request: CallToolRequest = {
          method: "tools/call",
          params: {
            name,
            arguments: args,
          },
        };

        console.log(`Calling tool '${name}' with args:`, args);
        const onLastEventIdUpdate = (event: string) => {
          notificationsToolLastEventId = event;
        };
        return await client!.request(request, CallToolResultSchema, {
          resumptionToken: notificationsToolLastEventId,
          onresumptiontoken: onLastEventIdUpdate,
        });
      },
      (result) => {
        console.log("Tool result:");
        result.content.forEach((item) => {
          if (item.type === "text") {
            console.log(`  ${item.text}`);
          } else {
            console.log(`  ${item.type} content:`, item);
          }
        });
      }
    );
  } catch (error) {
    console.log(`Error calling tool ${name}: ${error}`);
  }
}

async function callGreetTool(name: string): Promise<void> {
  await callTool("greet", { name });
}

async function callMultiGreetTool(name: string): Promise<void> {
  console.log("Calling multi-greet tool with notifications...");
  await callTool("multi-greet", { name });
}

async function startNotifications(
  interval: number,
  count: number
): Promise<void> {
  console.log(
    `Starting notification stream: interval=${interval}ms, count=${
      count || "unlimited"
    }`
  );
  await callTool("start-notification-stream", { interval, count });
}

async function listPrompts(): Promise<void> {
  if (!client) {
    console.log("Not connected to server.");
    return;
  }

  try {
    await makeRequestWithSessionCheck(
      async () => {
        const promptsRequest: ListPromptsRequest = {
          method: "prompts/list",
          params: {},
        };
        return await client!.request(promptsRequest, ListPromptsResultSchema);
      },
      (promptsResult) => {
        console.log("Available prompts:");
        if (promptsResult.prompts.length === 0) {
          console.log("  No prompts available");
        } else {
          for (const prompt of promptsResult.prompts) {
            console.log(`  - ${prompt.name}: ${prompt.description}`);
          }
        }
      }
    );
  } catch (error) {
    console.log(`Prompts not supported by this server (${error})`);
  }
}

async function getPrompt(
  name: string,
  args: Record<string, unknown>
): Promise<void> {
  if (!client) {
    console.log("Not connected to server.");
    return;
  }

  try {
    await makeRequestWithSessionCheck(
      async () => {
        const promptRequest: GetPromptRequest = {
          method: "prompts/get",
          params: {
            name,
            arguments: args as Record<string, string>,
          },
        };

        return await client!.request(promptRequest, GetPromptResultSchema);
      },
      (promptResult) => {
        console.log("Prompt template:");
        promptResult.messages.forEach((msg, index) => {
          console.log(`  [${index + 1}] ${msg.role}: ${msg.content.text}`);
        });
      }
    );
  } catch (error) {
    console.log(`Error getting prompt ${name}: ${error}`);
  }
}

async function listResources(): Promise<void> {
  if (!client) {
    console.log("Not connected to server.");
    return;
  }

  try {
    await makeRequestWithSessionCheck(
      async () => {
        const resourcesRequest: ListResourcesRequest = {
          method: "resources/list",
          params: {},
        };
        return await client!.request(
          resourcesRequest,
          ListResourcesResultSchema
        );
      },
      (resourcesResult) => {
        console.log("Available resources:");
        if (resourcesResult.resources.length === 0) {
          console.log("  No resources available");
        } else {
          for (const resource of resourcesResult.resources) {
            console.log(`  - ${resource.name}: ${resource.uri}`);
          }
        }
      }
    );
  } catch (error) {
    console.log(`Resources not supported by this server (${error})`);
  }
}

async function cleanup(): Promise<void> {
  if (client && transport) {
    try {
      // First try to terminate the session gracefully
      if (transport.sessionId) {
        try {
          console.log("Terminating session before exit...");
          await transport.terminateSession();
          console.log("Session terminated successfully");
        } catch (error) {
          console.error("Error terminating session:", error);
        }
      }

      // Then close the transport
      await transport.close();
    } catch (error) {
      console.error("Error closing transport:", error);
    }
  }

  process.stdin.setRawMode(false);
  readline.close();
  console.log("\nGoodbye!");
  process.exit(0);
}

// Set up raw mode for keyboard input to capture Escape key
process.stdin.setRawMode(true);
process.stdin.on("data", async (data) => {
  // Check for Escape key (27)
  if (data.length === 1 && data[0] === 27) {
    console.log("\nESC key pressed. Disconnecting from server...");

    // Abort current operation and disconnect from server
    if (client && transport) {
      await disconnect();
      console.log("Disconnected. Press Enter to continue.");
    } else {
      console.log("Not connected to server.");
    }

    // Re-display the prompt
    process.stdout.write("> ");
  }
});

// Handle Ctrl+C
process.on("SIGINT", async () => {
  console.log("\nReceived SIGINT. Cleaning up...");
  await cleanup();
});

/**
 * Reconnect with a specific session ID
 */
async function reconnectWithNewSession(newSessionId: string): Promise<void> {
  if (client) {
    await disconnect();
  }

  // Save the new session ID before reconnecting
  sessionId = newSessionId;
  await connect();
}

async function listTools(): Promise<void> {
  if (!client) {
    console.log("Not connected to server.");
    return;
  }

  try {
    const toolsRequest: ListToolsRequest = {
      method: "tools/list",
      params: {},
    };
    const toolsResult = await client.request(
      toolsRequest,
      ListToolsResultSchema
    );

    // Check for session update information
    if (
      toolsResult &&
      typeof toolsResult === "object" &&
      "__session_update" in toolsResult
    ) {
      const update = (toolsResult as any).__session_update;
      if (update && update.oldSessionId && update.newSessionId) {
        console.log(
          `\n[!] Server requested session ID update: ${update.oldSessionId} → ${update.newSessionId}`
        );
        sessionId = update.newSessionId;

        // Reconnect with the new session ID
        await reconnectWithNewSession(update.newSessionId);

        console.log(
          `Session updated successfully. New session ID: ${sessionId}`
        );
        return; // We'll need to retry the operation with the new session
      }
    }

    console.log("Available tools:");
    if (toolsResult.tools.length === 0) {
      console.log("  No tools available");
    } else {
      for (const tool of toolsResult.tools) {
        console.log(`  - ${tool.name}: ${tool.description}`);
      }
    }
  } catch (error) {
    console.log(`Tools not supported by this server (${error})`);

    // Check if error response contains session update information
    if (
      error instanceof Error &&
      (error.message.includes("Server not initialized") ||
        error.message.includes("Session not found"))
    ) {
      console.log(
        "Session expired or not found. Attempting to reconnect with a new session..."
      );
      sessionId = undefined; // Clear session ID to get a fresh one
      await reconnect();
      console.log("Reconnected with a new session. Please try again.");
    }
  }
}

// Add a more aggressive session reset function
async function forceCompletelyNewSession(): Promise<void> {
  console.log("Forcing completely new session with aggressive cleanup...");

  // Disconnect if connected
  if (client || transport) {
    try {
      if (transport) {
        await transport.close();
        transport = null;
      }
      client = null;
    } catch (error) {
      console.error("Error during disconnect:", error);
    }
  }

  // Clear session ID state
  sessionId = undefined;
  logSession("SessionId cleared");

  // Wait a moment to let any pending operations complete
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Reconnect with explicit transport creation
  console.log("Creating fresh connection with no session state...");

  try {
    // Create a new client with fresh state
    client = new Client({
      name: "example-client",
      version: "1.0.0",
    });

    client.onerror = (error) => {
      console.error("\x1b[31mClient error:", error, "\x1b[0m");
    };

    // Create a completely random session ID to bypass any SDK caching
    const randomSessionId = generateRandomUuid();
    console.log(`Using random session ID for transport: ${randomSessionId}`);

    // Create transport with the random session ID
    transport = new StreamableHTTPClientTransport(new URL(serverUrl), {
      sessionId: randomSessionId,
    });

    // Set up notification handlers
    client.setNotificationHandler(
      LoggingMessageNotificationSchema,
      (notification) => {
        notificationCount++;
        console.log(
          `\nNotification #${notificationCount}: ${notification.params.level} - ${notification.params.data}`
        );
        // Re-display the prompt
        process.stdout.write("> ");
      }
    );

    client.setNotificationHandler(
      ResourceListChangedNotificationSchema,
      async (_) => {
        console.log(`\nResource list changed notification received!`);
        try {
          if (!client) {
            console.log("Client disconnected, cannot fetch resources");
            return;
          }
          const resourcesResult = await client.request(
            {
              method: "resources/list",
              params: {},
            },
            ListResourcesResultSchema
          );
          console.log(
            "Available resources count:",
            resourcesResult.resources.length
          );
        } catch {
          console.log("Failed to list resources after change notification");
        }
        // Re-display the prompt
        process.stdout.write("> ");
      }
    );

    // Connect the client
    await client.connect(transport);

    // Get the new session ID
    sessionId = transport.sessionId;
    console.log("Successfully created brand new session with ID:", sessionId);
  } catch (error) {
    console.error("Failed to create new session:", error);
    client = null;
    transport = null;
  }
}

// Add a utility to generate random UUIDs
function generateRandomUuid(): string {
  // Simple UUID v4 implementation
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Add function to connect with a completely random session ID
async function connectWithRandomSession(): Promise<void> {
  if (client) {
    await disconnect();
  }

  // Generate a completely random session ID
  const randomSessionId = generateRandomUuid();
  console.log(`Created random session ID: ${randomSessionId}`);

  // Store the random session ID globally
  sessionId = randomSessionId;
  logSession(`Set sessionId to random value: ${sessionId}`);

  // Connect with this specific session ID
  await connect();

  console.log(`Connected with random session ID: ${sessionId}`);
}

// Start the interactive client
main().catch((error: unknown) => {
  console.error("Error running MCP client:", error);
  process.exit(1);
});
