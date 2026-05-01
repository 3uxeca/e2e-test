import type { McpServerConfig } from '@anthropic-ai/claude-agent-sdk';

export const PLAYWRIGHT_MCP_SERVER_NAME = 'playwright';

export function playwrightMcpServers(): Record<string, McpServerConfig> {
  return {
    [PLAYWRIGHT_MCP_SERVER_NAME]: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@playwright/mcp@latest', '--browser=chromium'],
    },
  };
}
