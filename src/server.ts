import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  TextContent,
  ImageContent,
} from "@modelcontextprotocol/sdk/types.js";
import {
  startHTTPStreamableServer,
  startSSEMcpServer,
  startStdioMcpServer,
} from "./services";
import { schema, tool } from "./tools";
import { renderMermaid } from "./utils";

/**
 * Creates and configures an MCP server for mermaid generation.
 */
export function createServer(): Server {
  const server = new Server(
    {
      name: "mcp-mermaid",
      version: "0.1.3",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  setupToolHandlers(server);

  server.onerror = (error) => console.error("[MCP Error]", error);
  process.on("SIGINT", async () => {
    await server.close();
    process.exit(0);
  });

  return server;
}

/**
 * Sets up tool handlers for the MCP server.
 */
function setupToolHandlers(server: Server): void {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [tool],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === tool.name) {
      try {
        const args = request.params.arguments || {};
        console.log("[MCP Tool Call] Input parameters:", JSON.stringify(args, null, 2));
        
        // Use safeParse instead of parse and try-catch.
        const result = schema.safeParse(args);
        if (!result.success) {
          console.error("[MCP Tool Call] Validation error:", result.error.message);
          throw new McpError(
            ErrorCode.InvalidParams,
            `Invalid parameters: ${result.error.message}`,
          );
        }

        const { mermaid, theme, backgroundColor, outputType = "png" } = args;
        const { id, svg, screenshot } = await renderMermaid(
          mermaid as string,
          theme as string,
          backgroundColor as string,
        );

        let response: { content: (TextContent | ImageContent)[] };
        if (outputType === "mermaid") {
          response = {
            content: [
              {
                type: "text",
                text: mermaid,
              },
            ],
          };
        } else if (outputType === "svg") {
          response = {
            content: [
              {
                type: "text",
                text: svg,
              },
            ],
          };
        } else {
          response = {
            content: [
              {
                type: "image",
                data: screenshot?.toString("base64"),
                mimeType: "image/png",
              },
            ],
          };
        }
        
        console.log("[MCP Tool Call] Output response:", JSON.stringify({
          outputType,
          contentType: response.content[0].type,
          contentLength: response.content[0].type === "text" 
            ? (response.content[0] as TextContent).text.length 
            : (response.content[0] as ImageContent).data?.length
        }, null, 2));
        
        return response;
      } catch (error: any) {
        if (error instanceof McpError) throw error;
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to generate mermaid: ${error?.message || "Unknown error."}`,
        );
      }
    } else {
      throw new McpError(
        ErrorCode.MethodNotFound,
        `Unknown tool: ${request.params.name}.`,
      );
    }
  });
}

/**
 * Runs the server with stdio transport.
 */
export async function runStdioServer(): Promise<void> {
  const server = createServer();
  await startStdioMcpServer(server);
}

/**
 * Runs the server with SSE transport.
 */
export async function runSSEServer(
  endpoint = "/sse",
  port = 3033,
): Promise<void> {
  const server = createServer();
  await startSSEMcpServer(server, endpoint, port);
}

/**
 * Runs the server with HTTP streamable transport.
 */
export async function runHTTPStreamableServer(
  endpoint = "/mcp",
  port = 3033,
): Promise<void> {
  await startHTTPStreamableServer(createServer, endpoint, port);
}
