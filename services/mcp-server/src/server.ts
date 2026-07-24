import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools } from './tools.js';

export async function startMcpServer(apiKey: string): Promise<void> {
  const server = new McpServer({
    name: 'questoros-memory',
    version: '0.3.0',
  });

  registerTools(server, apiKey);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
export { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
