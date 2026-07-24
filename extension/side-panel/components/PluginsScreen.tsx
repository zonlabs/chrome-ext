import React, { useState, useCallback } from 'react';
import { ArrowLeft, Trash2, Cpu, FileText, Plus, ChevronDown, ChevronRight, Globe, CircleCheck, XCircle, Loader, Lock } from 'lucide-react';
import { useAgent } from 'agents/react';

import { WORKER_URL } from '../../shared/constants';

const BUILTIN_PLUGINS = [
  {
    id: 'exa',
    name: 'Exa Web Search',
    url: 'https://mcp.exa.ai/mcp?tools=web_search_exa,web_search_advanced_exa,web_fetch_exa',
    description: 'Search the web, fetch page content, and find relevant information.',
    icon: 'Globe',
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
}

interface McpTool {
  serverId: string;
  name: string;
  description?: string;
  inputSchema?: any;
}

interface McpResource {
  serverId: string;
  name: string;
  uri: string;
  description?: string;
  mimeType?: string;
}

interface PluginsScreenProps {
  agentId: string;
  userId: string | null;
  onClose: () => void;
}

function mcpStateToServers(mcpState: any): McpServer[] {
  return Object.entries(mcpState?.servers ?? {}).map(([id, server]: [string, any]) => ({
    id,
    name: server.name,
    url: server.server_url ?? '',
    state: server.state,
  }));
}

export const PluginsScreen: React.FC<PluginsScreenProps> = ({ agentId, userId, onClose }) => {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [tools, setTools] = useState<McpTool[]>([]);
  const [resources, setResources] = useState<McpResource[]>([]);
  const [activeTab, setActiveTab] = useState<'settings' | 'tools' | 'resources'>('settings');

  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [authPending, setAuthPending] = useState<{ name: string; url: string } | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [expandedDescs, setExpandedDescs] = useState<Set<string>>(new Set());
  const [failedFavicons, setFailedFavicons] = useState<Set<string>>(new Set());

  const onFaviconError = (domain: string) => {
    setFailedFavicons(prev => { const next = new Set(prev); next.add(domain); return next; });
  };

  const toggleDesc = (key: string) => {
    setExpandedDescs(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const MAX_DESC_LEN = 80;

  const agent = useAgent({
    agent: 'ChatAgent',
    name: agentId,
    host: WORKER_URL,
    onClose: useCallback(() => setConnectionStatus('disconnected'), []),
    onOpen: useCallback(() => setConnectionStatus('connected'), []),
    onMcpUpdate: (mcpState: any) => {
      console.log('[PluginsPage] MCP state updated:', mcpState);
      if (mcpState) {
        setServers(mcpStateToServers(mcpState));
        setTools(mcpState.tools ?? []);
        setResources(mcpState.resources ?? []);
      }
    },
  });

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

  const handleRemove = async (serverId: string) => {
    try {
      await agent.call("removePlugin", [serverId]);
    } catch (e) {
      console.error('[PluginsPage] removePlugin failed:', e);
    }
  };

  // Find server name by serverId
  const getServerName = (serverId: string) => {
    const found = servers.find(s => s.id === serverId);
    if (found) return found.name;
    return serverId;
  };

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
              <div className="section-title">Built-in Plugins</div>
              <div className="plugins-list">
                {BUILTIN_PLUGINS.map((bp) => {
                  const connected = servers.find(s => s.id === bp.id);
                  const isConnecting = loading && name === bp.name;
                  return (
                    <div key={bp.id} className="plugin-card">
                      <div className="plugin-header">
                        <div className="plugin-name-row">
                          <Globe size={14} className="plugin-favicon" />
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
                      <div className="plugin-status-text" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        {bp.description}
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
                    <div className="plugin-status-text">Status: {s.state}</div>
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
                        <div className="params-title">Parameters:</div>
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
