import { createServerResponseAdapter } from "@/lib/server-response-adapter";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { IncomingMessage } from "http";
import { Socket } from "net";
import { Readable } from "stream";
import { z } from "zod";
import {
  CallToolResult,
  GetPromptResult,
  ReadResourceResult,
} from "@modelcontextprotocol/sdk/types.js";
import { createClient } from "redis";

// Interface for session storage
interface SessionStore {
  getSession(sessionId: string): Promise<any>;
  storeSession(sessionId: string, data: any): Promise<void>;
  listSessions(): Promise<string[]>;
  createNewSession(): Promise<string>;
}

// Redis-based session store implementation
class RedisSessionStore implements SessionStore {
  constructor(private prefix: string = "mcp:session:") {}

  async getSession(sessionId: string): Promise<any> {
    const redis = await getRedisClient();
    if (!redis) return null;

    const data = await redis.get(`${this.prefix}${sessionId}`);
    if (!data) return null;

    try {
      return JSON.parse(data);
    } catch (e) {
      // If not JSON, return as-is
      return data;
    }
  }

  async storeSession(sessionId: string, data: any): Promise<void> {
    const redis = await getRedisClient();
    if (!redis) return;

    const serializedData =
      typeof data === "string" ? data : JSON.stringify(data);
    await redis.set(`${this.prefix}${sessionId}`, serializedData);
    await redis.expire(`${this.prefix}${sessionId}`, 3600); // 1 hour TTL
  }

  async listSessions(): Promise<string[]> {
    const redis = await getRedisClient();
    if (!redis) return [];

    const keys = await redis.keys(`${this.prefix}*`);
    return keys.map((key) => key.substring(this.prefix.length));
  }

  async createNewSession(): Promise<string> {
    const newSessionId = crypto.randomUUID();
    await this.storeSession(newSessionId, {
      created: new Date().toISOString(),
      status: "active",
    });
    return newSessionId;
  }
}

export const maxDuration = 30;

// Redis connection setup
let redisClient: ReturnType<typeof createClient> | null = null;
let redisClientPromise: Promise<void> | null = null;

async function getRedisClient() {
  if (redisClient?.isOpen) {
    return redisClient;
  }

  if (!redisClientPromise) {
    redisClientPromise = (async () => {
      const redisUrl = process.env.REDIS_URL || process.env.KV_URL;
      if (!redisUrl) {
        console.error("REDIS_URL or KV_URL environment variable not set");
        throw new Error("Redis connection URL not configured");
      }

      try {
        console.log(
          `[${new Date().toISOString()}] Connecting to Redis at ${redisUrl}`
        );
        redisClient = createClient({ url: redisUrl });

        redisClient.on("error", (err) => {
          console.error(`[${new Date().toISOString()}] Redis error:`, err);
        });

        await redisClient.connect();
        console.log(
          `[${new Date().toISOString()}] Connected to Redis successfully`
        );
      } catch (error) {
        console.error(
          `[${new Date().toISOString()}] Redis connection error:`,
          error
        );
        redisClient = null;
        redisClientPromise = null;
        throw error;
      }
    })();
  }

  await redisClientPromise;
  return redisClient;
}

// ServerManager to handle server lifecycle
class ServerManager {
  private static instance: ServerManager | null = null;
  private server: McpServer | null = null;
  private transport: StreamableHTTPServerTransport | null = null;
  private isConnected: boolean = false;
  private serverInitPromise: Promise<void> | null = null;
  private serverInitialized = false;

  private constructor() {}

  public static getInstance(): ServerManager {
    if (!ServerManager.instance) {
      ServerManager.instance = new ServerManager();
    }
    return ServerManager.instance;
  }

  public async getServerAndTransport(sessionId?: string): Promise<{
    server: McpServer;
    transport: StreamableHTTPServerTransport;
    isNewSession: boolean;
    newSessionId?: string;
  }> {
    // Update activity timestamp
    let isNewSession = false;
    let newSessionId: string | undefined = undefined;

    // First check if we need to update transport session ID for resumability
    if (sessionId && this.transport && this.server && this.isConnected) {
      // Check if this session exists in Redis
      const sessionStore = new RedisSessionStore();
      const sessionData = await sessionStore.getSession(sessionId);

      if (sessionData) {
        console.log(
          `[${new Date().toISOString()}] Recognized existing session: ${sessionId}`
        );
        // We found existing session data - update the session
        await sessionStore.storeSession(sessionId, {
          ...(typeof sessionData === "object" ? sessionData : {}),
          lastAccessed: new Date().toISOString(),
          status: "active",
        });

        // Force transport to recognize the incoming session ID
        // @ts-ignore - Internal property access for session restoration
        if (this.transport._sessionId !== sessionId) {
          console.log(
            `[${new Date().toISOString()}] Forcing transport session ID to: ${sessionId}`
          );
          // @ts-ignore - Internal property access for session restoration
          this.transport._sessionId = sessionId;

          // Attempt a "reconnect" to refresh the connection with this session ID
          try {
            this.isConnected = false;
            await this.server.connect(this.transport);
            this.isConnected = true;
            console.log(
              `[${new Date().toISOString()}] Reconnected server with session ID: ${sessionId}`
            );
          } catch (reconnectError) {
            console.error(
              `[${new Date().toISOString()}] Error reconnecting server:`,
              reconnectError
            );
            // Even if reconnection fails, still try to use the existing server/transport
          }
        }

        // Return existing server and transport
        return {
          server: this.server,
          transport: this.transport,
          isNewSession,
        };
      } else {
        // Session not found, create a new one
        console.log(
          `[${new Date().toISOString()}] Session ${sessionId} not found, creating new session`
        );
        isNewSession = true;
        const sessionStore = new RedisSessionStore();
        newSessionId = await sessionStore.createNewSession();

        // Update the transport with the new session ID
        // @ts-ignore - Internal property access for session restoration
        this.transport._sessionId = newSessionId;

        try {
          // Reconnect with the new session ID
          this.isConnected = false;
          await this.server.connect(this.transport);
          this.isConnected = true;
          console.log(
            `[${new Date().toISOString()}] Created and connected new session: ${newSessionId}`
          );
        } catch (reconnectError) {
          console.error(
            `[${new Date().toISOString()}] Error connecting with new session:`,
            reconnectError
          );
        }

        return {
          server: this.server,
          transport: this.transport,
          isNewSession,
          newSessionId,
        };
      }
    }

    // Initialize if not already done
    if (!this.serverInitPromise) {
      console.log(
        `[${new Date().toISOString()}] Creating new server initialization promise`
      );
      this.serverInitPromise = this.initializeServer();
    }

    // Wait for server initialization
    try {
      await this.serverInitPromise;
    } catch (error) {
      // Reset the promise so we can try again
      this.serverInitPromise = null;
      console.error(
        `[${new Date().toISOString()}] Server initialization failed, will retry:`,
        error
      );
      // Try one more time
      this.serverInitPromise = this.initializeServer();
      await this.serverInitPromise;
    }

    if (!this.server || !this.transport || !this.isConnected) {
      throw new Error("Server initialization failed");
    }

    // If server was just initialized and a sessionId was provided, try to restore that session
    if (this.serverInitialized && sessionId) {
      console.log(
        `[${new Date().toISOString()}] Setting transport session ID after init: ${sessionId}`
      );
      // @ts-ignore - Internal property access for session restoration
      this.transport._sessionId = sessionId;

      // Attempt a "reconnect" to refresh the connection with this session ID
      try {
        this.isConnected = false;
        await this.server.connect(this.transport);
        this.isConnected = true;
        console.log(
          `[${new Date().toISOString()}] Reconnected server with session ID: ${sessionId}`
        );
      } catch (reconnectError) {
        console.error(
          `[${new Date().toISOString()}] Error reconnecting server:`,
          reconnectError
        );
        // Even if reconnection fails, still try to use the existing server/transport
      }

      // Mark that we no longer need to do this initialization step
      this.serverInitialized = false;
    }

    // If we reach here, we're using a newly initialized server
    return {
      server: this.server,
      transport: this.transport,
      isNewSession,
    };
  }

  public async checkServerStatus(): Promise<string> {
    try {
      // Check Redis connection
      const redis = await getRedisClient();
      if (!redis || !redis.isOpen) {
        return "Redis disconnected";
      }

      // Check server initialization
      if (!this.server) {
        return "Server not initialized";
      }

      // Check transport connection
      if (!this.transport) {
        return "Transport not initialized";
      }

      // Check if connected
      if (!this.isConnected) {
        return "Server not connected to transport";
      }

      return "OK";
    } catch (error) {
      return `Error: ${(error as Error).message}`;
    }
  }

  private async initializeServer(): Promise<void> {
    try {
      console.log(
        `[${new Date().toISOString()}] Initializing server and transport`
      );

      // Create session store
      const sessionStore = new RedisSessionStore();

      // Create the server
      this.server = new McpServer(
        {
          name: "stateless-streamable-http-server",
          version: "1.0.0",
        },
        { capabilities: { logging: {} } }
      );

      // Register a simple prompt
      this.server.prompt(
        "greeting-template",
        "A simple greeting prompt template",
        {
          name: z.string().describe("Name to include in greeting"),
        },
        async ({ name }): Promise<GetPromptResult> => {
          return {
            messages: [
              {
                role: "user",
                content: {
                  type: "text",
                  text: `Please greet ${name} in a friendly manner.`,
                },
              },
            ],
          };
        }
      );

      // Register a tool specifically for testing resumability
      this.server.tool(
        "start-notification-stream",
        "Starts sending periodic notifications for testing resumability",
        {
          interval: z
            .number()
            .describe("Interval in milliseconds between notifications")
            .default(100),
          count: z
            .number()
            .describe("Number of notifications to send (0 for 100)")
            .default(10),
        },
        async (
          { interval, count },
          { sendNotification }
        ): Promise<CallToolResult> => {
          // In a stateless environment, we should not start long-running processes
          // Just return immediately with a message instead of actually running notifications
          return {
            content: [
              {
                type: "text",
                text: `In stateless mode, notifications are simulated. Would send ${
                  count || "unlimited"
                } notifications every ${interval}ms if this were stateful.`,
              },
            ],
          };
        }
      );

      this.server.tool(
        "random-uuid",
        "Returns a random UUID",
        {},
        async (): Promise<CallToolResult> => {
          return {
            content: [
              {
                type: "text",
                text: crypto.randomUUID(),
              },
            ],
          };
        }
      );

      // Create a simple resource at a fixed URI
      this.server.resource(
        "greeting-resource",
        "https://example.com/greetings/default",
        { mimeType: "text/plain" },
        async (): Promise<ReadResourceResult> => {
          return {
            contents: [
              {
                uri: "https://example.com/greetings/default",
                text: "Hello, world!",
              },
            ],
          };
        }
      );

      // Create the transport with session handling
      this.transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
      });

      // Connect to Redis first to ensure it's available
      await getRedisClient();

      // Connect the server to the transport
      console.log(
        `[${new Date().toISOString()}] Connecting server to transport`
      );
      await this.server.connect(this.transport);
      this.isConnected = true;
      this.serverInitialized = true;
      console.log(
        `[${new Date().toISOString()}] Server connected to transport successfully`
      );

      // Store the initial transport session ID
      if (this.transport.sessionId) {
        const sessionStore = new RedisSessionStore();
        await sessionStore.storeSession(this.transport.sessionId, {
          created: new Date().toISOString(),
          status: "active",
        });
        console.log(
          `[${new Date().toISOString()}] Initialized transport with session ID: ${
            this.transport.sessionId
          }`
        );
      }

      // Store server status in Redis
      const redis = await getRedisClient();
      if (redis) {
        await redis.set("mcp:server:status", "connected");
        await redis.set("mcp:server:lastInit", new Date().toISOString());
      }
    } catch (error) {
      console.error(
        `[${new Date().toISOString()}] Server initialization failed:`,
        error
      );

      // Clean up on failure
      if (this.transport) {
        try {
          await this.transport.close();
        } catch (closeError) {
          console.error(
            `[${new Date().toISOString()}] Error closing transport:`,
            closeError
          );
        }
      }

      if (this.server) {
        try {
          await this.server.close();
        } catch (closeError) {
          console.error(
            `[${new Date().toISOString()}] Error closing server:`,
            closeError
          );
        }
      }

      this.server = null;
      this.transport = null;
      this.isConnected = false;

      throw error;
    }
  }

  // Creates a fake IncomingMessage from a Request object
  public createFakeIncomingMessage(
    req: Request,
    body: string,
    sessionId?: string
  ): IncomingMessage {
    const url = new URL(req.url);
    const headers = Object.fromEntries(req.headers.entries());

    // Debug all incoming headers
    console.log(
      `[${new Date().toISOString()}] Incoming headers for fake request:`
    );
    for (const [key, value] of Object.entries(headers)) {
      console.log(`[${new Date().toISOString()}]   ${key}: ${value}`);
    }

    // If a session ID is provided, ensure it's in the headers
    if (sessionId) {
      headers["x-mcp-session-id"] = sessionId;
      console.log(
        `[${new Date().toISOString()}] Added session ID to headers: ${sessionId}`
      );
    } else {
      // Extract sessionId from headers if present
      const headerSessionId = headers["x-mcp-session-id"] as string;
      if (headerSessionId) {
        console.log(
          `[${new Date().toISOString()}] Request contains session ID in headers: ${headerSessionId}`
        );
      }
    }

    const readable = new Readable();
    readable._read = (): void => {};

    if (body) {
      readable.push(body);
      readable.push(null);
    }

    const socket = new Socket();
    const incomingMessage = new IncomingMessage(socket);

    incomingMessage.method = req.method;
    incomingMessage.url = url.pathname + url.search;
    incomingMessage.headers = headers;

    incomingMessage.push = readable.push.bind(readable);
    incomingMessage.read = readable.read.bind(readable);
    // @ts-expect-error
    incomingMessage.on = readable.on.bind(readable);
    incomingMessage.pipe = readable.pipe.bind(readable);

    return incomingMessage;
  }
}

// Utility function to extract session ID from request
function getRequestSessionId(req: Request): string | undefined {
  // First check x-mcp-session-id header
  const sessionIdHeader = req.headers.get("x-mcp-session-id");
  if (sessionIdHeader) {
    return sessionIdHeader;
  }

  // Then check URL parameters
  try {
    const url = new URL(req.url);
    const sessionParam = url.searchParams.get("sessionId");
    if (sessionParam) {
      return sessionParam;
    }
  } catch (e) {
    console.error(
      `[${new Date().toISOString()}] Error parsing URL for session ID: ${e}`
    );
  }

  return undefined;
}

export async function POST(req: Request) {
  console.log(`[${new Date().toISOString()}] Starting POST request`);

  // Extract session ID using utility
  const clientProvidedSessionId = getRequestSessionId(req);

  // Log all headers for debugging
  console.log(`[${new Date().toISOString()}] Request headers:`);
  req.headers.forEach((value, key) => {
    console.log(`[${new Date().toISOString()}]   ${key}: ${value}`);
  });

  // PRE-INITIALIZE SERVER - Don't wait for the request handling logic
  // This ensures the server is initialized before we try to process the request
  try {
    const manager = ServerManager.getInstance();
    const { server, transport, isNewSession, newSessionId } =
      await manager.getServerAndTransport(clientProvidedSessionId);
    console.log(
      `[${new Date().toISOString()}] Server pre-initialized successfully`
    );
  } catch (error) {
    console.error(
      `[${new Date().toISOString()}] Server pre-initialization failed:`,
      error
    );
    // Continue anyway - we'll try again in the main handler
  }

  if (clientProvidedSessionId) {
    console.log(
      `[${new Date().toISOString()}] Request for existing session: ${clientProvidedSessionId}`
    );

    // Check if session exists using SessionStore
    try {
      const sessionStore = new RedisSessionStore();
      const sessionData = await sessionStore.getSession(
        clientProvidedSessionId
      );
      if (!sessionData) {
        console.log(
          `[${new Date().toISOString()}] Warning: Client requested unknown session: ${clientProvidedSessionId}`
        );
      } else {
        console.log(
          `[${new Date().toISOString()}] Found existing session in Redis: ${clientProvidedSessionId}`
        );
      }
    } catch (error) {
      console.error(
        `[${new Date().toISOString()}] Error checking session: ${error}`
      );
    }
  }

  try {
    // Check Redis first before proceeding
    const redis = await getRedisClient();
    if (!redis) {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32003,
            message: "Server error",
            data: "Redis connection not available",
          },
          id: null,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Store request timestamp in Redis for monitoring
    const requestId = crypto.randomUUID();
    await redis.set(`mcp:request:${requestId}`, new Date().toISOString());
    await redis.expire(`mcp:request:${requestId}`, 3600); // Expire after 1 hour
  } catch (redisError) {
    console.error(`[${new Date().toISOString()}] Redis error:`, redisError);
    // Continue even if Redis fails since the server might still work
  }

  return createServerResponseAdapter(req.signal, async (res) => {
    try {
      // Read the request body
      const bodyText = await req.text();

      // Parse JSON body
      let parsedBody;
      try {
        parsedBody = JSON.parse(bodyText);
        console.log(
          `[${new Date().toISOString()}] Request body method: ${
            parsedBody?.method
          }, id: ${parsedBody?.id}`
        );
      } catch (error) {
        res.writeHead(400);
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: {
              code: -32700,
              message: "Parse error",
              data: "Invalid JSON",
            },
            id: null,
          })
        );
        return;
      }

      // Get server and transport from manager
      try {
        const manager = ServerManager.getInstance();

        // Pass sessionId when getting server and transport
        const { server, transport, isNewSession, newSessionId } =
          await manager.getServerAndTransport(clientProvidedSessionId);

        // Verify we have a valid server
        if (!server || !transport) {
          console.error(
            `[${new Date().toISOString()}] Server or transport not available`
          );
          res.writeHead(500);
          res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              error: {
                code: -32000,
                message: "Server error: Transport or server not available",
              },
              id: parsedBody?.id || null,
            })
          );
          return;
        }

        // If this is a new session, send a special response to notify the client
        if (isNewSession && newSessionId && clientProvidedSessionId) {
          console.log(
            `[${new Date().toISOString()}] Notifying client to update session ID from ${clientProvidedSessionId} to ${newSessionId}`
          );

          // For tools/list request, we'll send a special response
          if (parsedBody?.method === "tools/list") {
            // Create a fake req/res to get the tools list
            const toolsReq = manager.createFakeIncomingMessage(
              req,
              JSON.stringify({
                jsonrpc: "2.0",
                method: "tools/list",
                params: {},
                id: "internal-tools-request",
              }),
              newSessionId
            );

            // Create a response collector
            let toolsResult: any = { tools: [] };
            const toolsRes = {
              headersSent: false,
              writeHead: (statusCode: number) => {},
              end: (body: string) => {
                try {
                  const parsed = JSON.parse(body);
                  if (parsed?.result?.tools) {
                    toolsResult = parsed.result;
                  }
                } catch (e) {
                  console.error(
                    `[${new Date().toISOString()}] Error parsing tools response:`,
                    e
                  );
                }
              },
            } as any;

            // Get the tools list
            try {
              await transport.handleRequest(toolsReq, toolsRes, {
                jsonrpc: "2.0",
                method: "tools/list",
                params: {},
                id: "internal-tools-request",
              });
            } catch (toolsError) {
              console.error(
                `[${new Date().toISOString()}] Error getting tools list:`,
                toolsError
              );
            }

            // Send response with both tools and session update info
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                jsonrpc: "2.0",
                result: {
                  ...toolsResult,
                  // Add special field to notify client to update session
                  __session_update: {
                    oldSessionId: clientProvidedSessionId,
                    newSessionId: newSessionId,
                  },
                },
                id: parsedBody.id,
              })
            );
            return;
          }
        }

        // Create a fake IncomingMessage from the Request - use the new session ID if applicable
        const fakeReq = manager.createFakeIncomingMessage(
          req,
          bodyText,
          newSessionId || clientProvidedSessionId
        );

        // Handle the request
        console.log(
          `[${new Date().toISOString()}] Handling MCP request with transport sessionId: ${
            transport.sessionId
          }`
        );
        await transport.handleRequest(fakeReq, res, parsedBody);

        // After successful response, store the sessionId in Redis for future requests
        if (transport.sessionId) {
          try {
            const sessionStore = new RedisSessionStore();
            const existingData =
              (await sessionStore.getSession(transport.sessionId)) || {};

            await sessionStore.storeSession(transport.sessionId, {
              ...(typeof existingData === "object" ? existingData : {}),
              lastUsed: new Date().toISOString(),
              status: "active",
              method: parsedBody?.method || "unknown",
            });

            console.log(
              `[${new Date().toISOString()}] Request handled successfully for session: ${
                transport.sessionId
              }`
            );
          } catch (error) {
            console.error(
              `[${new Date().toISOString()}] Error storing session: ${error}`
            );
          }
        } else {
          console.log(
            `[${new Date().toISOString()}] Request handled successfully, but no session ID available`
          );
        }
      } catch (serverError) {
        console.error(
          `[${new Date().toISOString()}] Server error:`,
          serverError
        );
        if (!res.headersSent) {
          res.writeHead(500);
          res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              error: {
                code: -32000,
                message: "Server error",
                data: (serverError as Error).message,
              },
              id: parsedBody?.id || null,
            })
          );
        }
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Unexpected error:`, error);
      if (!res.headersSent) {
        res.writeHead(500);
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: {
              code: -32603,
              message: "Internal server error",
              data: (error as Error).message,
            },
            id: null,
          })
        );
      }
    }
  });
}

export async function GET(req: Request) {
  // If this is a status check, return server status
  const url = new URL(req.url);
  if (url.searchParams.get("status") === "check") {
    try {
      const manager = ServerManager.getInstance();
      const status = await manager.checkServerStatus();

      return new Response(
        JSON.stringify({
          status,
          timestamp: new Date().toISOString(),
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    } catch (error) {
      return new Response(
        JSON.stringify({
          status: "Error",
          error: (error as Error).message,
          timestamp: new Date().toISOString(),
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }

  return createServerResponseAdapter(req.signal, async (res) => {
    console.log(`[${new Date().toISOString()}] Received GET request`);
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Method not allowed.",
        },
        id: null,
      })
    );
  });
}

export async function DELETE(req: Request) {
  return createServerResponseAdapter(req.signal, async (res) => {
    console.log(`[${new Date().toISOString()}] Received DELETE request`);
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Method not allowed.",
        },
        id: null,
      })
    );
  });
}
