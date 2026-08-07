import { useState } from 'react';
import {
  ArrowLeft,
  Trash2,
  Cpu,
  FileText,
  Plus,
  ChevronDown,
  ChevronRight,
  Globe,
  CircleCheck,
  XCircle,
  Loader,
  Lock,
} from 'lucide-react';
import { usePlugins } from '../../lib/agent';
import { WORKER_URL } from '../../lib/constants';

interface BuiltinPlugin {
  id: string;
  name: string;
  url: string;
  description: string;
  icon?: string;
  additionalInfo?: string;
}

const BUILTIN_PLUGINS: BuiltinPlugin[] = [
  {
    id: 'exa',
    name: 'Exa Search',
    url: 'https://mcp.exa.ai/mcp?tools=web_search_exa,web_search_advanced_exa,web_fetch_exa',
    description: 'Search and fetch web content.',
  },
  {
    id: 'mem0',
    name: 'Mem0',
    url: 'https://mcp.mem0.ai/mcp',
    description: 'Persistent memory and recall.',
    icon: 'https://avatars.githubusercontent.com/u/137054526',
  },
  {
    id: 'apify',
    name: 'Apify',
    url: 'https://mcp.apify.com',
    description: 'Web scraping and data extraction.',
  },
  {
    id: 'consensus',
    name: 'Consensus',
    url: 'https://mcp.consensus.app/mcp',
    description: 'Academic research and discovery.',
  },
  {
    id: 'chrome-devtools',
    name: 'Chrome DevTools',
    url: 'http://127.0.0.1:3000/sse',
    description: 'Control and inspect live Chrome for automation, debugging, and performance.',
    additionalInfo: 'Run local bridge: npx supergateway --port 3000 --stdio "npx -y chrome-devtools-mcp@latest"',
    icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/chrome/chrome-original.svg',
  },
];

function getFaviconUrl(serverUrl: string): string {
  try {
    const domain = new URL(serverUrl).hostname;
    return `${WORKER_URL}/api/favicon?hostname=${domain}`;
  } catch {
    return '';
  }
}

function getDomain(serverUrl: string): string {
  try {
    return new URL(serverUrl).hostname;
  } catch {
    return serverUrl;
  }
}

interface McpServer {
  id: string;
  name: string;
  url: string;
  state: string;
  icon?: string;
}

interface JsonSchemaProperty {
  type?: string;
  description?: string;
}

interface ToolInputSchema {
  type?: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
}

interface McpTool {
  serverId: string;
  name: string;
  description?: string;
  inputSchema?: ToolInputSchema;
}

interface McpResource {
  serverId: string;
  name: string;
  uri: string;
  description?: string;
  mimeType?: string;
}

interface McpServerEntry {
  name?: string;
  url?: string;
  server_url?: unknown;
  config?: unknown;
  state?: unknown;
  [key: string]: unknown;
}

interface McpState {
  servers?: Record<string, McpServerEntry>;
  tools?: unknown;
  resources?: unknown;
  descriptors?: unknown;
}

interface McpToolDescriptor {
  tools: McpTool[];
}

interface McpResourceDescriptor {
  resources: McpResource[];
}

interface PluginsScreenProps {
  onClose: () => void;
}

function mcpStateToServers(mcpState: McpState): McpServer[] {
  return Object.entries(mcpState?.servers ?? {}).map(([id, server]) => {
    const config = server.config as { url?: string; name?: string } | undefined;
    const rawUrl = server.url || (server.server_url as string | undefined) || config?.url || '';
    const builtin = BUILTIN_PLUGINS.find(
      (bp) =>
        bp.id === id ||
        (rawUrl && bp.url === rawUrl) ||
        (server.name && bp.name.toLowerCase() === server.name.toLowerCase()) ||
        (config?.name && bp.name.toLowerCase() === config.name.toLowerCase())
    );

    const displayName = server.name || builtin?.name || config?.name || id;

    return {
      id,
      name: displayName,
      url: rawUrl || builtin?.url || '',
      state: (server.state as string | undefined) ?? 'unknown',
      icon: builtin?.icon,
    };
  });
}

function mcpStateToTools(mcpState: McpState): McpTool[] {
  if (Array.isArray(mcpState?.tools)) {
    return mcpState.tools as McpTool[];
  }
  const tools: McpTool[] = [];
  const source = (mcpState as { descriptors?: Record<string, unknown> }).descriptors || (mcpState?.tools as Record<string, unknown> | undefined) || {};
  for (const [serverId, desc] of Object.entries(source)) {
    if (Array.isArray(desc)) {
      tools.push(...(desc as McpTool[]));
    } else if (desc && typeof desc === 'object' && Array.isArray((desc as McpToolDescriptor).tools)) {
      for (const tool of (desc as McpToolDescriptor).tools) {
        tools.push({
          serverId,
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        });
      }
    }
  }
  return tools;
}

function mcpStateToResources(mcpState: McpState): McpResource[] {
  if (Array.isArray(mcpState?.resources)) {
    return mcpState.resources;
  }
  const resources: McpResource[] = [];
  const source = (mcpState as { descriptors?: Record<string, unknown> }).descriptors || (mcpState?.resources as Record<string, unknown> | undefined) || {};
  for (const [serverId, desc] of Object.entries(source)) {
    if (Array.isArray(desc)) {
      resources.push(...(desc as McpResource[]));
    } else if (desc && typeof desc === 'object' && Array.isArray((desc as McpResourceDescriptor).resources)) {
      for (const res of (desc as McpResourceDescriptor).resources) {
        resources.push({
          serverId,
          name: res.name || res.uri,
          uri: res.uri,
          description: res.description,
          mimeType: res.mimeType,
        });
      }
    }
  }
  return resources;
}

const MAX_DESC_LEN = 120;

export const PluginsScreen: React.FC<PluginsScreenProps> = ({ onClose }) => {
  const { mcpState, connectionStatus, addPlugin, removePlugin } = usePlugins();
  const [activeTab, setActiveTab] = useState<'settings' | 'tools' | 'resources'>('settings');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedDescs, setExpandedDescs] = useState<Set<string>>(new Set());
  const [expandedParams, setExpandedParams] = useState<Set<string>>(new Set());
  const [failedFavicons, setFailedFavicons] = useState<Set<string>>(new Set());

  const servers = mcpStateToServers(mcpState);
  const tools = mcpStateToTools(mcpState);
  const resources = mcpStateToResources(mcpState);

  const toggleDesc = (key: string) => {
    setExpandedDescs((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleParams = (key: string) => {
    setExpandedParams((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const onFaviconError = (domain: string) => {
    setFailedFavicons((prev) => new Set(prev).add(domain));
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !url.trim()) return;
    setLoading(true);
    setError('');
    try {
      const data = await addPlugin(name.trim(), url.trim());
      if (data.success) {
        setName('');
        setUrl('');
      } else {
        setError(data.error || 'Failed to connect');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (serverId: string) => {
    try {
      await removePlugin(serverId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const getServerName = (serverId: string) => {
    const found = servers.find((s) => s.id === serverId);
    if (found) return found.name;
    return serverId;
  };

  const FaviconBlock: React.FC<{ serverUrl: string; icon?: string }> = ({ serverUrl, icon }) => {
    if (icon) {
      return <img src={icon} alt="" className="w-4 h-4 rounded shrink-0 object-contain" />;
    }
    const domain = getDomain(serverUrl);
    const faviconUrl = getFaviconUrl(serverUrl);
    return failedFavicons.has(domain) || !faviconUrl ? (
      <Globe size={16} className="w-4 h-4 rounded shrink-0 object-contain text-[#8e8e8e]" />
    ) : (
      <img src={faviconUrl} alt="" className="w-4 h-4 rounded shrink-0 object-contain" onError={() => onFaviconError(domain)} />
    );
  };

  return (
    <div className="flex flex-col flex-1 h-full min-h-0 bg-[#131314] text-[#e3e3e3] overflow-hidden">
      <div className="flex flex-col flex-1 h-full min-h-0 w-full max-w-xl mx-auto">
        <header className="flex items-center gap-3 px-3 py-2.5 border-b border-[#2a2b2d] bg-[#131314] shrink-0">
        <button className="flex items-center gap-1 text-xs text-[#c4c7c5] hover:text-[#e3e3e3] bg-transparent border-0 cursor-pointer shrink-0" onClick={onClose} title="Back to Chat">
          <ArrowLeft size={15} />
          <span>Back</span>
        </button>
        <h2 className="text-xs font-semibold text-[#e3e3e3] m-0">Plugins & Capabilities</h2>
        <div className="flex items-center gap-1.5 text-xs ml-auto shrink-0">
          {connectionStatus === 'connected' ? (
            <CircleCheck size={14} strokeWidth={2.5} style={{ color: '#4ade80' }} />
          ) : connectionStatus === 'connecting' ? (
            <Loader size={14} strokeWidth={2.5} className="animate-spin text-[#60a5fa]" />
          ) : (
            <XCircle size={14} strokeWidth={2.5} style={{ color: '#f87171' }} />
          )}
          <span className="text-[11px] font-medium text-[var(--text-secondary,#c4c7c5)]">
            {connectionStatus === 'connected' ? 'Connected' : connectionStatus === 'connecting' ? 'Connecting...' : 'Disconnected'}
          </span>
        </div>
      </header>

      <div className="flex items-center border-b border-[#2a2b2d] px-3 bg-[#131314] shrink-0">
        <button className={`px-3 py-2 text-xs font-medium bg-transparent border-0 border-b-2 cursor-pointer transition-colors ${activeTab === 'settings' ? 'border-[#ff8a80] text-[#e3e3e3]' : 'border-transparent text-[#8e8e8e] hover:text-[#c4c7c5]'}`} onClick={() => setActiveTab('settings')}>
          Manage
        </button>
        <button className={`px-3 py-2 text-xs font-medium bg-transparent border-0 border-b-2 cursor-pointer transition-colors ${activeTab === 'tools' ? 'border-[#ff8a80] text-[#e3e3e3]' : 'border-transparent text-[#8e8e8e] hover:text-[#c4c7c5]'}`} onClick={() => setActiveTab('tools')}>
          Tools ({tools.length})
        </button>
        <button className={`px-3 py-2 text-xs font-medium bg-transparent border-0 border-b-2 cursor-pointer transition-colors ${activeTab === 'resources' ? 'border-[#ff8a80] text-[#e3e3e3]' : 'border-transparent text-[#8e8e8e] hover:text-[#c4c7c5]'}`} onClick={() => setActiveTab('resources')}>
          Resources ({resources.length})
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-0 py-2">
        {activeTab === 'settings' && (
          <div className="flex flex-col">
            <form onSubmit={handleAdd} className="flex flex-col gap-2 px-3 py-3 border-b border-[#2a2b2d]">
              <div className="text-[11px] font-semibold text-[#8e8e8e] uppercase tracking-wider">Connect MCP Server</div>
              <div className="flex flex-col gap-2">
                <input
                  className="w-full px-3 py-1.5 text-xs bg-[#1e1f20] border border-[#3c4043] rounded-lg text-[#e3e3e3] placeholder-[#8e8e8e] focus:outline-none focus:border-[#ff8a80]"
                  placeholder="Plugin Name (e.g. todo)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={loading}
                  required
                />
                <input
                  className="w-full px-3 py-1.5 text-xs bg-[#1e1f20] border border-[#3c4043] rounded-lg text-[#e3e3e3] placeholder-[#8e8e8e] focus:outline-none focus:border-[#ff8a80]"
                  placeholder="MCP Server Endpoint URL"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>
              <button type="submit" disabled={loading} className="self-start inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 text-xs font-medium bg-[#ff8a80] text-[#131314] rounded-lg hover:bg-[#ffb2ab] transition-colors cursor-pointer border-0 disabled:opacity-50 mt-1">
                <Plus size={15} />
                {loading ? 'Adding...' : 'Add Plugin'}
              </button>
            </form>

            {error && <div className="mx-3 my-2 p-2.5 rounded-lg bg-[#3c1e1e] text-[#e06c75] text-xs">{error}</div>}

            <div className="flex flex-col pt-2">
              <div className="px-3 py-1 text-[11px] font-semibold text-[#8e8e8e] uppercase tracking-wider">Quick Plugins</div>
              <div className="flex flex-col divide-y divide-[#2a2b2d]">
                {BUILTIN_PLUGINS.map((bp) => {
                  const connected = servers.find((s) => s.id === bp.id || (s.url && s.url === bp.url) || s.name === bp.name);
                  const isConnecting = loading && name === bp.name;
                  return (
                    <div key={bp.id} className="flex flex-col gap-0.5 px-3 py-2 hover:bg-[#1e1f20] transition-colors">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <FaviconBlock serverUrl={bp.url} icon={bp.icon} />
                          <span className="text-xs font-semibold text-[#e3e3e3] truncate">{bp.name}</span>
                        </div>
                        {connected ? (
                          <div className="p-1.5 flex items-center justify-center shrink-0" title={`Connected (${connected.state})`}>
                            {connected.state === 'ready' ? (
                              <CircleCheck size={15} style={{ color: '#4ade80' }} />
                            ) : connected.state === 'authenticating' ? (
                              <Lock size={15} style={{ color: '#60a5fa' }} />
                            ) : connected.state === 'failed' ? (
                              <XCircle size={15} style={{ color: '#f87171' }} />
                            ) : (
                              <Loader size={15} className="animate-spin text-[#c4c7c5]" />
                            )}
                          </div>
                        ) : (
                          <button
                            className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-medium border border-[#3c4043] hover:border-[#ff8a80] text-[#c4c7c5] hover:text-[#ff8a80] rounded-lg transition-colors cursor-pointer bg-transparent shrink-0 disabled:opacity-50"
                            disabled={isConnecting}
                            onClick={async () => {
                              setLoading(true);
                              setError('');
                              try {
                                const data = await addPlugin(bp.name, bp.url);
                                if (!data.success) {
                                  setError(data.error || 'Failed to connect');
                                }
                              } catch (e) {
                                setError(e instanceof Error ? e.message : String(e));
                              } finally {
                                setLoading(false);
                              }
                            }}
                          >
                            <Plus size={12} />
                            Connect
                          </button>
                        )}
                      </div>
                      <p className="text-[11px] text-[#8e8e8e] m-0 leading-normal">
                        {bp.description}
                      </p>
                      {bp.additionalInfo && (
                        <div className="text-[10px] text-[#ff8a80] font-mono break-all mt-0.5">
                          {bp.additionalInfo}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col pt-3">
              <div className="px-3 py-1 text-[11px] font-semibold text-[#8e8e8e] uppercase tracking-wider">Connected Plugins</div>
              <div className="flex flex-col divide-y divide-[#2a2b2d]">
                {servers.length === 0 ? (
                  <div className="px-3 py-3 text-xs text-[#8e8e8e]">No connected plugins</div>
                ) : (
                  servers.map((s) => (
                    <div key={s.id} className="flex items-center justify-between px-3 py-2.5 hover:bg-[#1e1f20] transition-colors" title={s.url}>
                      <div className="flex items-center gap-2 min-w-0">
                        {s.state === 'ready' ? (
                          <CircleCheck size={14} style={{ color: '#4ade80', flexShrink: 0 }} />
                        ) : s.state === 'authenticating' ? (
                          <Lock size={14} style={{ color: '#60a5fa', flexShrink: 0 }} />
                        ) : s.state === 'failed' ? (
                          <XCircle size={14} style={{ color: '#f87171', flexShrink: 0 }} />
                        ) : (
                          <Loader size={14} className="animate-spin shrink-0" />
                        )}
                        <FaviconBlock serverUrl={s.url} icon={s.icon} />
                        <span className="text-xs font-medium text-[#e3e3e3] truncate">{s.name}</span>
                      </div>
                      <button className="p-1.5 text-[#8e8e8e] hover:text-[#ea4335] bg-transparent border-0 cursor-pointer rounded transition-colors shrink-0" title="Remove Plugin" onClick={() => handleRemove(s.id)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'tools' && (
          <div className="flex flex-col divide-y divide-[#2a2b2d]">
            {tools.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-[#8e8e8e] text-xs text-center px-4">
                <Cpu size={24} />
                <div>No tools available. Add a plugin to enable tools.</div>
              </div>
            ) : (
              tools.map((t, idx) => (
                <div key={`${t.serverId}-${t.name}-${idx}`} className="px-3 py-2.5 flex flex-col gap-1 hover:bg-[#1e1f20] transition-colors">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[#ff8a80] font-mono">{t.name}</span>
                    <span className="px-1.5 py-0.5 text-[10px] font-medium bg-[#2a2b2d] text-[#c4c7c5] rounded">{getServerName(t.serverId)}</span>
                  </div>
                  {t.description && (
                    <div className="flex items-start gap-1">
                      <p className="text-xs text-[#8e8e8e] leading-relaxed flex-1 m-0">
                        {expandedDescs.has(`${t.serverId}-${t.name}`) || t.description.length <= MAX_DESC_LEN
                          ? t.description
                          : t.description.slice(0, MAX_DESC_LEN) + '...'}
                      </p>
                      {t.description.length > MAX_DESC_LEN && (
                        <button className="bg-transparent border-0 p-0 text-[#8e8e8e] cursor-pointer" onClick={() => toggleDesc(`${t.serverId}-${t.name}`)}>
                          {expandedDescs.has(`${t.serverId}-${t.name}`) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      )}
                    </div>
                  )}

                  {t.inputSchema && t.inputSchema.properties && Object.keys(t.inputSchema.properties).length > 0 && (
                    <div className="text-xs mt-1">
                      <div
                        className="flex items-center justify-between text-xs text-[#ff8a80] font-medium cursor-pointer select-none"
                        onClick={() => toggleParams(`${t.serverId}-${t.name}`)}
                      >
                        <span>Parameters ({Object.keys(t.inputSchema.properties).length})</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleParams(`${t.serverId}-${t.name}`);
                          }}
                          className="bg-transparent border-0 p-0 text-[#ff8a80] cursor-pointer"
                        >
                          {expandedParams.has(`${t.serverId}-${t.name}`) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      </div>
                      {expandedParams.has(`${t.serverId}-${t.name}`) && (
                        <div className="flex flex-col gap-1 mt-2 pl-1 border-l-2 border-[#3c4043]">
                          {Object.entries(t.inputSchema.properties).map(([pName, pSchema]) => {
                            const isRequired = t.inputSchema?.required?.includes(pName);
                            return (
                              <div key={pName} className="flex items-center gap-1.5 py-0.5 text-xs flex-wrap">
                                <span className="font-mono text-[#ff8a80]">{pName}</span>
                                <span className="text-[#8e8e8e]">({pSchema.type || 'any'})</span>
                                {isRequired && <span className="text-[#e06c75] font-medium">*required</span>}
                                {pSchema.description && <span className="text-[#8e8e8e]"> — {pSchema.description}</span>}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'resources' && (
          <div className="flex flex-col divide-y divide-[#2a2b2d]">
            {resources.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-[#8e8e8e] text-xs text-center px-4">
                <FileText size={24} />
                <div>No resources available from connected plugins.</div>
              </div>
            ) : (
              resources.map((r, idx) => (
                <div key={`${r.serverId}-${r.name}-${idx}`} className="px-3 py-3 flex flex-col gap-1.5 hover:bg-[#1e1f20] transition-colors">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[#e3e3e3] font-mono">{r.name}</span>
                    <span className="px-1.5 py-0.5 text-[10px] font-medium bg-[#2a2b2d] text-[#c4c7c5] rounded">{getServerName(r.serverId)}</span>
                  </div>
                  {r.description && <p className="text-xs text-[#8e8e8e] m-0">{r.description}</p>}
                  <div className="text-xs text-[#8e8e8e]">
                    <span className="font-semibold text-[#c4c7c5]">URI:</span> <code className="bg-[#1e1f20] px-1 py-0.5 rounded font-mono text-[#ff8a80] text-[11px]">{r.uri}</code>
                  </div>
                  {r.mimeType && (
                    <div className="text-xs text-[#8e8e8e]">
                      <span className="font-semibold text-[#c4c7c5]">Type:</span> <span>{r.mimeType}</span>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  </div>
);
};
