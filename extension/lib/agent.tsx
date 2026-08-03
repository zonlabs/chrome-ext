import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useAgent } from 'agents/react';
import { sendMessage } from './messages';
import { WORKER_URL } from './constants';

export interface McpServer {
  id: string;
  name: string;
  url: string;
  [key: string]: unknown;
}

export interface McpTool {
  serverId: string;
  name: string;
  description?: string;
  inputSchema?: unknown;
  [key: string]: unknown;
}

export interface McpResource {
  serverId: string;
  name: string;
  uri: string;
  description?: string;
  mimeType?: string;
  [key: string]: unknown;
}

export interface McpState {
  servers: Record<string, McpServer>;
  tools: McpTool[];
  resources: McpResource[];
}

export interface PluginCallResult {
  success: boolean;
  requiresAuth?: boolean;
  authUrl?: string;
  error?: string;
}

export interface AgentContextValue {
  mcpState: McpState;
  connectionStatus: 'connecting' | 'connected' | 'disconnected';
  addPlugin: (name: string, url: string) => Promise<PluginCallResult>;
  removePlugin: (serverId: string) => Promise<void>;
}

export const AgentContext = createContext<AgentContextValue | undefined>(undefined);

interface McpServerUpdate {
  name: string;
  server_url?: string;
  state?: unknown;
  error?: unknown;
  instructions?: unknown;
  auth_url?: unknown;
  [key: string]: unknown;
}

interface McpStateUpdate {
  servers?: Record<string, McpServerUpdate>;
  tools?: McpTool[];
  resources?: McpResource[];
}

interface AgentRef {
  call: (method: string, args: unknown[]) => Promise<unknown>;
}

const EMPTY_STATE: McpState = { servers: {}, tools: [], resources: [] };

export function AgentProvider({ agentId, children }: { agentId: string; children: ReactNode }) {
  const [mcpState, setMcpState] = useState<McpState>(EMPTY_STATE);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const agentRef = useRef<AgentRef | null>(null);

  const handleMcpUpdate = useCallback((next: McpStateUpdate) => {
    const servers: Record<string, McpServer> = {};
    if (next?.servers) {
      for (const [id, server] of Object.entries(next.servers)) {
        servers[id] = {
          id,
          name: server.name,
          url: server.server_url ?? '',
          server_url: server.server_url,
          state: server.state,
          error: server.error,
          instructions: server.instructions,
          auth_url: server.auth_url,
        };
      }
    }
    setMcpState({ servers, tools: next?.tools ?? [], resources: next?.resources ?? [] });
  }, []);

  const setAgent = useCallback((agent: AgentRef | null) => {
    agentRef.current = agent;
  }, []);

  const addPlugin = useCallback(async (name: string, url: string) => {
    const agent = agentRef.current;
    if (!agent) return { success: false, error: 'Not connected' };
    try {
      const data = (await agent.call('addPlugin', [name.trim(), url.trim()])) as PluginCallResult;
      if (data?.requiresAuth && data?.authUrl) window.open(data.authUrl, 'noopener,noreferrer');
      return data;
    } catch {
      return { success: false, error: 'Plugin connection failed' };
    }
  }, []);

  const removePlugin = useCallback(async (serverId: string) => {
    const agent = agentRef.current;
    if (!agent) return;
    await agent.call('removePlugin', [serverId]);
  }, []);

  const value = useMemo<AgentContextValue>(
    () => ({ mcpState, connectionStatus, addPlugin, removePlugin }),
    [mcpState, connectionStatus, addPlugin, removePlugin],
  );

  return (
    <AgentContext.Provider value={value}>
      {agentId ? (
        <AgentConnection
          agentId={agentId}
          onAgent={setAgent}
          onMcpUpdate={handleMcpUpdate}
          onOpen={() => setConnectionStatus('connected')}
          onClose={() => setConnectionStatus('disconnected')}
        />
      ) : null}
      {children}
    </AgentContext.Provider>
  );
}

interface AgentConnectionProps {
  agentId: string;
  onAgent: (agent: AgentRef | null) => void;
  onMcpUpdate: (state: McpStateUpdate) => void;
  onOpen: () => void;
  onClose: () => void;
}

function AgentConnection({ agentId, onAgent, onMcpUpdate, onOpen, onClose }: AgentConnectionProps) {
  const asyncQuery = useCallback(async () => {
    const snapshot = await sendMessage({ type: 'auth:snapshot' });
    const token = snapshot.type === 'authSnapshot' ? (snapshot.jwt ?? '') : '';
    return { token };
  }, []);

  const agent = useAgent({
    agent: 'UserAgent',
    name: agentId,
    host: WORKER_URL,
    query: asyncQuery,
    onIdentityChange: () => {},
    onOpen,
    onClose,
    onMcpUpdate,
  });

  useEffect(() => {
    onAgent(agent);
    return () => onAgent(null);
  }, [agent, onAgent]);

  return null;
}

export function usePlugins(): AgentContextValue {
  const ctx = useContext(AgentContext);
  if (!ctx) throw new Error('usePlugins must be used within AgentProvider');
  return ctx;
}
