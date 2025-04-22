'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

import { StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js'

export default function ClientPage() {
  const [id, setId] = useState('');
  const [connected, setConnected] = useState(false);
  const [statelessConnected, setStatelessConnected] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);
  const mcpClientRef = useRef<Client | null>(null);
  const statelessClientRef = useRef<Client | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Check for ID in URL if page is refreshed
  useEffect(() => {
    const idParam = searchParams.get('id');
    if (idParam) {
      setId(idParam);
      connectToSSE(idParam);
    }
  }, [searchParams]);

  const connectToSSE = async (clientId: string) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    
    if (mcpClientRef.current) {
      mcpClientRef.current.close();
    }

    // Update URL with the ID parameter
    router.push(`/client?id=${clientId}`);
    
    try {
      // Create a new MCP client
      const client = new Client(
        {
          name: `client-${clientId}`,
          version: "1.0.0",
        },
        {
          capabilities: {
            prompts: {},
            resources: {},
            tools: {},
          },
        }
      );
      
      mcpClientRef.current = client;
      
      // Connect to the server
      const transport = new SSEClientTransport(new URL(`/sse?id=${clientId}`, window.location.origin));
      setMessages(prev => [...prev, 'Connecting to MCP server (SSE)...']);
      
      await client.connect(transport);
      setConnected(true);
      setMessages(prev => [...prev, 'Connected to MCP server (SSE)']);
      
      // Automatically invoke listTools
      setMessages(prev => [...prev, 'Fetching available tools from SSE server...']);
      try {
        const tools = await client.listTools();
        setMessages(prev => [...prev, `Available tools from SSE server: ${JSON.stringify(tools, null, 2)}`]);
      } catch (error) {
        setMessages(prev => [...prev, `Error fetching tools from SSE server: ${error instanceof Error ? error.message : String(error)}`]);
      }
    } catch (error) {
      setMessages(prev => [...prev, `SSE connection error: ${error instanceof Error ? error.message : String(error)}`]);
      setConnected(false);
    }
  };

  const connectToStateless = async () => {
    if (statelessClientRef.current) {
      statelessClientRef.current.close();
    }
    
    try {
      setMessages(prev => [...prev, 'Connecting to stateless MCP server...']);
      
      // For direct JSON-RPC calls to our stateless endpoint
      const baseUrl = new URL('/mcp-stateless', window.location.origin).toString();
      
      // Instead of using the StreamableHTTPClientTransport, we'll make direct fetch calls
      // First, let's list the available tools
      const listToolsResponse = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/list',
          params: {},
          id: 1
        })
      });
      
      if (!listToolsResponse.ok) {
        throw new Error(`Server returned ${listToolsResponse.status}: ${await listToolsResponse.text()}`);
      }
      
      const toolsResult = await listToolsResponse.json();
      
      if (toolsResult.error) {
        throw new Error(`JSON-RPC error: ${toolsResult.error.message}`);
      }
      
      setStatelessConnected(true);
      setMessages(prev => [...prev, 'Connected to stateless MCP server via direct JSON-RPC']);
      setMessages(prev => [...prev, 'Confirmed: Using stateless mode with direct JSON-RPC']);
      setMessages(prev => [...prev, `Available tools from stateless server: ${JSON.stringify(toolsResult.result.tools, null, 2)}`]);
      
      // Store a reference to the "client" which is just our statelessConnected state
      statelessClientRef.current = { close: () => setStatelessConnected(false) } as any;
    } catch (error) {
      setMessages(prev => [...prev, `Stateless connection error: ${error instanceof Error ? error.message : String(error)}`]);
      setStatelessConnected(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (id.trim()) {
      connectToSSE(id);
    }
  };

  const disconnectSSE = () => {
    if (mcpClientRef.current) {
      mcpClientRef.current.close();
      mcpClientRef.current = null;
      setConnected(false);
      setMessages(prev => [...prev, 'Disconnected from MCP server (SSE)']);
    }
  };

  const disconnectStateless = () => {
    if (statelessClientRef.current) {
      statelessClientRef.current.close();
      statelessClientRef.current = null;
      setStatelessConnected(false);
      setMessages(prev => [...prev, 'Disconnected from stateless MCP server']);
    }
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">MCP Client</h1>
      
      {/* SSE Server Connection */}
      <div className="mb-8 p-4 border rounded">
        <h2 className="text-xl font-semibold mb-4">SSE Server Connection (Stateful)</h2>
        <form onSubmit={handleSubmit} className="mb-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="Enter client ID"
              className="border p-2 rounded flex-grow"
              required
            />
            <button 
              type="submit" 
              className="bg-blue-500 text-white p-2 rounded"
              disabled={connected}
            >
              Connect
            </button>
            {connected && (
              <button 
                type="button" 
                onClick={disconnectSSE}
                className="bg-red-500 text-white p-2 rounded"
              >
                Disconnect
              </button>
            )}
          </div>
        </form>

        <div className="mt-2">
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-3 h-3 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span>{connected ? 'Connected (SSE)' : 'Disconnected (SSE)'}</span>
          </div>
        </div>
      </div>

      {/* Stateless Server Connection */}
      <div className="mb-8 p-4 border rounded">
        <h2 className="text-xl font-semibold mb-4">Stateless Server Connection</h2>
        <div className="flex gap-2">
          <button 
            type="button" 
            onClick={connectToStateless}
            className="bg-blue-500 text-white p-2 rounded"
            disabled={statelessConnected}
          >
            Connect to Stateless Server
          </button>
          {statelessConnected && (
            <button 
              type="button" 
              onClick={disconnectStateless}
              className="bg-red-500 text-white p-2 rounded"
            >
              Disconnect
            </button>
          )}
        </div>

        <div className="mt-2">
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-3 h-3 rounded-full ${statelessConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span>{statelessConnected ? 'Connected (Stateless)' : 'Disconnected (Stateless)'}</span>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <h2 className="text-xl font-semibold mb-2">Messages</h2>
        <div className="border rounded p-4 h-80 overflow-y-auto bg-gray-50">
          {messages.length === 0 ? (
            <p className="text-gray-500">No messages yet</p>
          ) : (
            <ul className="space-y-2">
              {messages.map((msg, index) => (
                <li key={index} className="border-b pb-1">
                  {msg}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
