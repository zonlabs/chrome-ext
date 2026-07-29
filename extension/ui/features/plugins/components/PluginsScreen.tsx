import React, { useState, useCallback } from 'react';
import { ArrowLeft, Trash2, Cpu, FileText, Plus, ChevronDown, ChevronRight, Globe, CircleCheck, XCircle, Loader, Lock } from 'lucide-react';
import { useAgent } from 'agents/react';

import { WORKER_URL } from '../../../../shared/constants';

/** Pre-configured quick-plugins that can be connected with a single click. */
const BUILTIN_PLUGINS = [
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

/** Build the favicon proxy URL for a given MCP server URL. */
function getFaviconUrl(serverUrl: string): string {
  try {
    const domain = new URL(serverUrl).hostname;
    return `${WORKER_URL}/api/favicon?hostname=${domain}`;
  } catch {
    return '';
  }
}

/** Extract the hostname from a server URL, falling back to the raw string on parse failure. */
function getDomain(serverUrl: string): string {
  try {
    return new URL(serverUrl).hostname;
  } catch {
    return serverUrl;
  }
}

/** An MCP server connected through the agent. */
interface McpServer {
  /** Server identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Server endpoint URL */
  url: string;
  /** Connection state (ready, authenticating, failed, etc.) */
  state: string;
}

/** A tool exposed by an MCP server. */
interface McpTool {
  /** ID of the server that provides this tool */
  serverId: string;
  /** Tool name (used by the agent to invoke it) */
  name: string;
  /** Human-readable description */
  description?: string;
  /** JSON Schema for the tool's input parameters */
  inputSchema?: any;
}

/** A resource exposed by an MCP server. */
interface McpResource {
  /** ID of the server that provides this resource */
  serverId: string;
  /** Resource name */
  name: string;
  /** Resource URI */
  uri: string;
  /** Human-readable description */
  description?: string;
  /** MIME type of the resource content */
  mimeType?: string;
}

/** Props for the PluginsScreen — agent ID for MCP state, user for auth guard, and close callback. */
interface PluginsScreenProps {
  /** Agent ID used to connect for MCP state updates */
  agentId: string;
  /** Authenticated user ID, or null (shows sign-in gate) */
  userId: string | null;
  /** Navigate back to the chat view */
  onClose: () => void;
}

/** Convert raw MCP state from the agent into a flat array of McpServer objects. */
function mcpStateToServers(mcpState: any): McpServer[] {
  return Object.entries(mcpState?.servers ?? {}).map(([id, server]: [string, any]) => ({
    id,
    name: server.name,
    url: server.server_url ?? '',
    state: server.state,
  }));
}

/** Full-screen MCP plugin manager — add, remove, and inspect MCP servers, their tools, and their resources. */
export const PluginsScreen: React.FC<PluginsScreenProps> = ({ agentId, userId, onClose }) => {
  /** Connected MCP servers. */
  const [servers, setServers] = useState<McpServer[]>([]);
  /** Tools exposed by connected servers. */
  const [tools, setTools] = useState<McpTool[]>([]);
  /** Resources exposed by connected servers. */
  const [resources, setResources] = useState<McpResource[]>([]);
  /** Active tab: Manage (settings), Tools, or Resources. */
  const [activeTab, setActiveTab] = useState<'settings' | 'tools' | 'resources'>('settings');

  /** Name input for the manual-add form. */
  const [name, setName] = useState('');
  /** URL input for the manual-add form. */
  const [url, setUrl] = useState('');
  /** Whether an add-plugin request is in flight. */
  const [loading, setLoading] = useState(false);
  /** Error message from a failed add/remove operation. */
  const [error, setError] = useState('');
  /** Plugin awaiting OAuth authorization (shows banner). */
  const [authPending, setAuthPending] = useState<{ name: string; url: string } | null>(null);
  /** Connection state of the agent (via useAgent callbacks). */
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  /** Set of tool/resource description keys that have been expanded by the user. */
  const [expandedDescs, setExpandedDescs] = useState<Set<string>>(new Set());
  /** Set of tool keys whose parameters list is expanded by the user (collapsed by default). */
  const [expandedParams, setExpandedParams] = useState<Set<string>>(new Set());
  /** Domains whose favicons failed to load (show fallback icon). */
  const [failedFavicons, setFailedFavicons] = useState<Set<string>>(new Set());

  /** Mark a favicon as failed so the fallback icon is shown instead. */
  const onFaviconError = (domain: string) => {
    setFailedFavicons(prev => { const next = new Set(prev); next.add(domain); return next; });
  };

  /** Toggle the expanded/collapsed state of a tool description. */
  const toggleDesc = (key: string) => {
    setExpandedDescs(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  /** Toggle the expanded/collapsed state of a tool's parameters. */
  const toggleParams = (key: string) => {
    setExpandedParams(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const MAX_DESC_LEN = 80;

  const handleMcpUpdate = useCallback((mcpState: any) => {
    console.log('[PluginsPage] MCP state updated:', mcpState);
    if (mcpState) {
      setServers(mcpStateToServers(mcpState));
      setTools(mcpState.tools ?? []);
      setResources(mcpState.resources ?? []);
    }
  }, []);

  /** Agent connection for MCP state streaming — receives server, tool, and resource updates. */
  const agent = useAgent({
    agent: 'McpAgent',
    name: agentId,
    host: WORKER_URL,
    onClose: useCallback(() => setConnectionStatus('disconnected'), []),
    onOpen: useCallback(() => setConnectionStatus('connected'), []),
    onMcpUpdate: handleMcpUpdate,
  });

  /** Add a new MCP server via the agent's addPlugin RPC. */
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !url.trim()) return;
    setLoading(true);
    setError('');
    try {
      const data = await agent.call("addPlugin", [name.trim(), url.trim()]) as any;
      if (data.success) {
        if (data.requiresAuth && data.authUrl) {
          setAuthPending({ name: name.trim(), url: url.trim() });
          window.open(data.authUrl, '_blank', 'noopener,noreferrer');
        }
        setName('');
        setUrl('');
      } else {
        setError(data.error || 'Failed to add MCP server');
      }
    } catch (e) {
      console.error('[PluginsPage] addPlugin failed', { agentId, error: e });
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  /** Remove a connected MCP server via the agent's removePlugin RPC. */
  const handleRemove = async (serverId: string) => {
    try {
      await agent.call("removePlugin", [serverId]);
    } catch (e) {
      console.error('[PluginsPage] removePlugin failed:', e);
    }
  };

  /** Look up the human-readable name for a server ID. */
  const getServerName = (serverId: string) => {
    const found = servers.find(s => s.id === serverId);
    if (found) return found.name;
    return serverId;
  };

  /** Render a sign-in gate when the user is not authenticated. */
  if (!userId) {
    return (
      <div className="plugins-page-container">
        <header className="plugins-page-header">
          <button className="back-btn" onClick={onClose} title="Back to Chat">
            <ArrowLeft size={16} />
            <span>Back</span>
          </button>
          <h2 className="plugins-page-title">Plugins & Capabilities</h2>
        </header>
        <div className="plugins-page-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', textAlign: 'center', gap: '12px' }}>
          <div style={{ fontSize: 32 }}>🔒</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Sign in required</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 280, lineHeight: 1.5 }}>
            Sign in with Google to connect MCP plugins and extend your assistant's capabilities.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="plugins-page-container">
      {/* ── Header ── */}
      <header className="plugins-page-header">
        <button className="back-btn" onClick={onClose} title="Back to Chat">
          <ArrowLeft size={16} />
          <span>Back</span>
        </button>
        <h2 className="plugins-page-title">Plugins & Capabilities</h2>
        <div className="connection-status" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
          {connectionStatus === 'connected' ? (
            <CircleCheck size={14} style={{ color: '#4ade80' }} />
          ) : connectionStatus === 'connecting' ? (
            <Loader size={14} className="spin" />
          ) : (
            <XCircle size={14} style={{ color: '#f87171' }} />
          )}
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            {connectionStatus === 'connected' ? 'Connected' :
              connectionStatus === 'connecting' ? 'Connecting...' : 'Disconnected'}
          </span>
        </div>
      </header>

      {/* ── Tabs Navigation ── */}
      <div className="plugins-tabs">
        <button
          className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          Manage
        </button>
        <button
          className={`tab-btn ${activeTab === 'tools' ? 'active' : ''}`}
          onClick={() => setActiveTab('tools')}
        >
          Tools ({tools.length})
        </button>
        <button
          className={`tab-btn ${activeTab === 'resources' ? 'active' : ''}`}
          onClick={() => setActiveTab('resources')}
        >
          Resources ({resources.length})
        </button>
      </div>

      {/* ── Main Content Area ── */}
      <div className="plugins-page-content">

        {/* ── Tab: Manage/Settings ── */}
        {activeTab === 'settings' && (
          <div className="settings-tab-content">
            <form onSubmit={handleAdd} className="plugins-form">
              <div className="form-title">Connect MCP Server</div>
              <div className="input-group">
                <input
                  placeholder="Plugin Name (e.g. todo)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={loading}
                  required
                />
                <input
                  placeholder="MCP Server Endpoint URL"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>
              <button type="submit" disabled={loading} className="add-btn">
                <Plus size={16} style={{ marginRight: '6px' }} />
                {loading ? 'Adding...' : 'Add Plugin'}
              </button>
            </form>

            {error && <div className="plugins-error">{error}</div>}

            {authPending && (
              <div className="plugins-auth-banner">
                <span><strong>{authPending.name}</strong> requires authorization.</span>
                <span>Complete sign-in in the opened tab — status updates automatically.</span>
                <button className="auth-dismiss-btn" onClick={() => setAuthPending(null)}>Dismiss</button>
              </div>
            )}

            <div className="plugins-list-section">
              <div className="section-title">Quick Plugins</div>
              <div className="plugins-list">
                {BUILTIN_PLUGINS.map((bp) => {
                  const connected = servers.find(s => s.id === bp.id);
                  const isConnecting = loading && name === bp.name;
                  return (
                    <div key={bp.id} className="plugin-card">
                      <div className="plugin-header">
                        <div className="plugin-name-row">
                          {(() => {
                            if ((bp as any).icon) {
                              return <img src={(bp as any).icon} alt="" className="plugin-favicon" />;
                            }
                            const domain = getDomain(bp.url);
                            const faviconUrl = getFaviconUrl(bp.url);
                            return failedFavicons.has(domain) || !faviconUrl ? (
                              <Globe size={14} className="plugin-favicon" />
                            ) : (
                              <img src={faviconUrl} alt="" className="plugin-favicon" onError={() => onFaviconError(domain)} />
                            );
                          })()}
                          <span className="plugin-name">{bp.name}</span>
                        </div>
                        {connected ? (
                          <button
                            className="remove-btn"
                            title="Disconnect"
                            onClick={() => handleRemove(connected.id)}
                            disabled={isConnecting}
                          >
                            <Trash2 size={14} />
                          </button>
                        ) : (
                          <button
                            className="add-btn"
                            style={{ padding: '4px 10px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                            disabled={isConnecting}
                            onClick={async () => {
                              setLoading(true);
                              setError('');
                              try {
                                const data = await agent.call("addPlugin", [bp.name, bp.url]) as any;
                                if (data.success) {
                                  if (data.requiresAuth && data.authUrl) {
                                    setAuthPending({ name: bp.name, url: bp.url });
                                    window.open(data.authUrl, '_blank', 'noopener,noreferrer');
                                  }
                                } else {
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
                      <div className="plugin-status-text">
                        <div>{bp.description}</div>
                        {(bp as any).additionalInfo && (
                          <div style={{ marginTop: 4, fontSize: 11, color: 'var(--accent-blue, #8ab4f8)', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                            {(bp as any).additionalInfo}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="plugins-list-section" style={{ marginTop: 16 }}>
              <div className="section-title">Connected Plugins</div>
              <div className="plugins-list">
                {servers.map((s) => (
                  <div key={s.id} className="plugin-card" title={s.url}>
                    <div className="plugin-header">
                      <div className="plugin-name-row">
                        {s.state === 'ready' ? (
                          <CircleCheck size={14} style={{ color: '#4ade80', flexShrink: 0 }} />
                        ) : s.state === 'authenticating' ? (
                          <Lock size={14} style={{ color: '#60a5fa', flexShrink: 0 }} />
                        ) : s.state === 'failed' ? (
                          <XCircle size={14} style={{ color: '#f87171', flexShrink: 0 }} />
                        ) : (
                          <Loader size={14} className="spin" style={{ flexShrink: 0 }} />
                        )}
                        {(() => {
                          const domain = getDomain(s.url);
                          const faviconUrl = getFaviconUrl(s.url);
                          return failedFavicons.has(domain) || !faviconUrl ? (
                            <Globe size={14} className="plugin-favicon" />
                          ) : (
                            <img src={faviconUrl} alt="" className="plugin-favicon" onError={() => onFaviconError(domain)} />
                          );
                        })()}
                        <span className="plugin-name">{s.name}</span>
                      </div>
                      <button
                        className="remove-btn"
                        title="Remove Plugin"
                        onClick={() => handleRemove(s.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Tab: Tools ── */}
        {activeTab === 'tools' && (
          <div className="tools-tab-content">
            {tools.length === 0 ? (
              <div className="empty-state">
                <Cpu size={24} />
                <div>No tools available. Add a plugin to enable tools.</div>
              </div>
            ) : (
              <div className="tools-list">
                {tools.map((t, idx) => (
                  <div key={`${t.serverId}-${t.name}-${idx}`} className="tool-card">
                    <div className="tool-header">
                      <span className="tool-name">{t.name}</span>
                      <span className="tool-server-badge">{getServerName(t.serverId)}</span>
                    </div>
                    {t.description && (
                      <div className="tool-desc-wrap">
                        <p className="tool-desc">
                          {expandedDescs.has(`${t.serverId}-${t.name}`) || t.description.length <= MAX_DESC_LEN
                            ? t.description
                            : t.description.slice(0, MAX_DESC_LEN) + '...'}
                        </p>
                        {t.description.length > MAX_DESC_LEN && (
                          <button className="desc-toggle" onClick={() => toggleDesc(`${t.serverId}-${t.name}`)}>
                            {expandedDescs.has(`${t.serverId}-${t.name}`) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                        )}
                      </div>
                    )}

                    {t.inputSchema && t.inputSchema.properties && Object.keys(t.inputSchema.properties).length > 0 && (
                      <div className="tool-params">
                        <div
                          className="params-title"
                          onClick={() => toggleParams(`${t.serverId}-${t.name}`)}
                          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', userSelect: 'none' }}
                        >
                          <span>Parameters ({Object.keys(t.inputSchema.properties).length})</span>
                          <button
                            className="desc-toggle"
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleParams(`${t.serverId}-${t.name}`);
                            }}
                            style={{ background: 'none', border: 'none', padding: 0, color: 'inherit', cursor: 'pointer' }}
                          >
                            {expandedParams.has(`${t.serverId}-${t.name}`) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                        </div>
                        {expandedParams.has(`${t.serverId}-${t.name}`) && (
                          <div className="params-list">
                            {Object.entries(t.inputSchema.properties).map(([pName, pSchema]: [string, any]) => {
                              const isRequired = t.inputSchema.required?.includes(pName);
                              return (
                                <div key={pName} className="param-item">
                                  <span className="param-name">{pName}</span>
                                  <span className="param-type">({pSchema.type || 'any'})</span>
                                  {isRequired && <span className="param-required">*required</span>}
                                  {pSchema.description && <span className="param-desc"> — {pSchema.description}</span>}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Resources ── */}
        {activeTab === 'resources' && (
          <div className="resources-tab-content">
            {resources.length === 0 ? (
              <div className="empty-state">
                <FileText size={24} />
                <div>No resources available from connected plugins.</div>
              </div>
            ) : (
              <div className="resources-list">
                {resources.map((r, idx) => (
                  <div key={`${r.serverId}-${r.name}-${idx}`} className="resource-card">
                    <div className="resource-header">
                      <span className="resource-name">{r.name}</span>
                      <span className="resource-server-badge">{getServerName(r.serverId)}</span>
                    </div>
                    {r.description && <p className="resource-desc">{r.description}</p>}
                    <div className="resource-uri">
                      <span className="uri-label">URI:</span> <code>{r.uri}</code>
                    </div>
                    {r.mimeType && (
                      <div className="resource-mime">
                        <span className="mime-label">Type:</span> <span>{r.mimeType}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
};
