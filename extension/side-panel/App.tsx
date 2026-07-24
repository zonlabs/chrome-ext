import React, { useState, useEffect, useRef, useCallback, useMemo, Suspense } from 'react';
import { useAgent } from 'agents/react';
import { useAgentChat } from '@cloudflare/ai-chat/react';
import { SquarePen, MoreVertical, PictureInPicture2, User, X, CircleX, Settings2, Check } from 'lucide-react';

import { HistoryPopup } from './components/HistoryPopup';
import { WelcomeScreen } from './components/WelcomeScreen';
import { MessageItem } from './components/MessageItem';
import { ChatInput } from './components/ChatInput';
import { LoadingIndicator } from './components/LoadingIndicator';
import { useThreads } from './utils/useThreads';
import { createClientTools } from './utils/clientTools';
import { PluginsScreen } from './components/PluginsScreen';
import { ChatViewProps } from '../shared/types';

import { 
  WORKER_URL, 
  VALID_MODELS,
  DEFAULT_MODEL,
  MODELS_DATA,
  LS_DISABLED_PLUGINS,
  LS_MODEL
} from '../shared/constants';

function sanitizeAgentIdPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function getPluginsAgentId(user: any): string {
  const userId = user?.id ? String(user.id) : '';
  return userId ? `plugins-user-${sanitizeAgentIdPart(userId)}` : '';
}

type ModelTier = 'basic' | 'intermediate' | 'advanced';

interface ModelEntry {
  value: string;
  label: string;
  desc: string;
  icon: string;
  tier: ModelTier;
}

// ── ChatView sub-component: keyed by activeThreadId so it remounts cleanly ──

function ChatView(props: ChatViewProps) {
  const {
    activeThreadId,
    activeThreadTitle,
    updateActiveThreadTitle,
    handleNewChat: _handleThreadNewChat,
    handleDeleteThread,
    ensureThreadEntry,
    threads,
    setActiveThreadId,
    model,
    user,
    tabs,
    selectedUrls,
    activeTabUrl,
    activeTabTitle,
    activeTabSuggestions,
    suggestionsLoading,
    showPopup,
    setShowPopup,
    showSelected,
    setShowSelected,
    selectedPanelRef,
    showModelPopup,
    setShowModelPopup,
    showHistoryPopup,
    setShowHistoryPopup,
    inputValue,
    setInputValue,
    inputRef,
    attachPopupRef,
    modelDropdownRef,
    historyRef,
    selectedModelLabel,
    selectedModelIcon,
    onToggleUrl,
    onSelectModel,
    onSignIn,
    onSignOut,
    onOpenPlugins,
    pluginsAgentId,
    availablePlugins = [],
    disabledPlugins = [],
    onTogglePlugin,
  } = props;

  const [showPluginsPopup, setShowPluginsPopup] = useState(false);
  const pluginsPopupRef = useRef<HTMLDivElement>(null);

  // Compute enabled plugins
  const enabledPluginIds = useMemo(() => {
    return availablePlugins
      .map((p: any) => p.id)
      .filter((id: string) => !disabledPlugins.includes(id));
  }, [availablePlugins, disabledPlugins]);

  // Click outside handler for plugins popup
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showPluginsPopup && pluginsPopupRef.current && !pluginsPopupRef.current.contains(event.target as Node)) {
        const triggerBtn = document.querySelector('.chat-plugins-btn');
        if (!triggerBtn?.contains(event.target as Node)) {
          setShowPluginsPopup(false);
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showPluginsPopup]);

  // ── Agent & chat — clean remount per threadId ──
  const agent = useAgent({
    agent: 'ChatAgent',
    name: activeThreadId,
    host: WORKER_URL,
    onIdentityChange: () => {},
  });

  const getSelectedTabsRef = useRef<() => { url: string; title: string }[]>(() => []);

  // Keep the ref up-to-date with the latest state
  getSelectedTabsRef.current = () => {
    return tabs
      .filter((t: any) => selectedUrls.includes(t.url))
      .map((t: any) => ({ url: t.url, title: t.title || '' }));
  };

  const clientTools = useMemo(() => {
    return createClientTools({
      getSelectedTabs: () => getSelectedTabsRef.current()
    });
  }, []); // Stable tools reference

  const handleToolCall = useCallback(async ({ toolCall, addToolOutput }: {
    toolCall: { toolCallId: string; toolName: string; input: unknown };
    addToolOutput: (options: { toolCallId: string; output: unknown }) => void;
  }) => {
    const tool = clientTools[toolCall.toolName];
    if (!tool?.execute) return;

    let output: unknown;
    try {
      output = await tool.execute(toolCall.input);
    } catch (error) {
      output = `Error executing tool: ${error instanceof Error ? error.message : String(error)}`;
    }

    addToolOutput({
      toolCallId: toolCall.toolCallId,
      output,
    });
  }, [clientTools]);

  const { messages, sendMessage, addToolApprovalResponse, status, clearHistory, stop, setMessages, error: chatError } = useAgentChat({
    agent,
    body: { model, pluginsAgentId, userId: user?.id || null, enabledPlugins: enabledPluginIds },
    onToolCall: handleToolCall,
    tools: clientTools,
  });

  const popoutMode = new URLSearchParams(window.location.search).has('popout');

  const handleTogglePopout = useCallback(() => {
    if (popoutMode) {
      const params = new URLSearchParams(window.location.search);
      const tabId = parseInt(params.get('tabId') || '0', 10);
      if (tabId) {
        chrome.runtime.sendMessage({ type: 'sidePanel:open', tabId }, () => {
          window.close();
        });
      } else {
        window.close();
      }
    } else {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tabId = tabs[0]?.id || 0;
        const url = chrome.runtime.getURL(`side-panel/index.html?popout=true&tabId=${tabId}`);
        window.open(url, 'Obot', 'width=450,height=600,menubar=no,toolbar=no,location=no,status=no');
        window.close();
      });
    }
  }, [popoutMode]);

  const [pendingEdit, setPendingEdit] = useState<{ text: string } | null>(null);

  // ── Trigger edited message submission after state update ──
  useEffect(() => {
    if (pendingEdit) {
      sendMessage({ text: pendingEdit.text });
      setPendingEdit(null);
    }
  }, [pendingEdit, sendMessage]);

  // ── Agent message listener (title broadcasts) ──
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'chat:title') {
          updateActiveThreadTitle(data.title);
        }
      } catch {}
    }
    agent.addEventListener('message', handleMessage);
    return () => agent.removeEventListener('message', handleMessage);
  }, [agent, updateActiveThreadTitle]);

  // ── Active tool detection ──
  const activeTool = useMemo(() => {
    for (const msg of messages) {
      for (const part of msg.parts) {
        const type = (part as any).type || '';
        const state = (part as any).state;
        if (type.startsWith('tool-') && 
            (state === 'call' || state === 'input-streaming' || state === 'input-available')) {
          return (part as any).toolName || type.slice(5);
        }
      }
    }
    return null;
  }, [messages]);

  // ── Find the index of the latest assistant message ──
  const latestAssistantIdx = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') {
        return i;
      }
    }
    return -1;
  }, [messages]);

  // ── Handlers ──
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleNewChat = useCallback(() => {
    if (messages.length === 0) return;
    _handleThreadNewChat();
  }, [messages, _handleThreadNewChat]);

  const handleSubmit = useCallback(() => {
    if (inputValue.trim()) {
      ensureThreadEntry();
      sendMessage({ text: inputValue });
      setInputValue('');
      if (inputRef.current) inputRef.current.style.height = 'auto';
    }
  }, [inputValue, ensureThreadEntry, sendMessage, setInputValue, inputRef]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  const handleSuggestionClick = useCallback((text: string) => {
    setInputValue(text);
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${inputRef.current.scrollHeight}px`;
    }
  }, [setInputValue, inputRef]);

  const handleEditMessage = useCallback((messageId: string, newText: string) => {
    setMessages(prev => {
      const idx = prev.findIndex(m => m.id === messageId);
      if (idx === -1) return prev;
      return prev.slice(0, idx);
    });
    setPendingEdit({ text: newText });
  }, [setMessages]);

  const handleRegenerateMessage = useCallback((messageId: string) => {
    setMessages(prev => {
      const idx = prev.findIndex(m => m.id === messageId);
      if (idx === -1) return prev;
      const userMsgIdx = idx - 1;
      if (userMsgIdx < 0) return prev;
      const userMsg = prev[userMsgIdx];
      if (userMsg.role !== 'user') return prev;
      const userText = ((userMsg.parts.find((p: any) => p.type === 'text') as { text?: string } | undefined)?.text) || '';
      if (!userText) return prev;
      setPendingEdit({ text: userText });
      return prev.slice(0, userMsgIdx);
    });
  }, [setMessages]);

  // ── Scroll to bottom on new messages ──
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);
  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  // ── Render ──
  const isStreaming = status === 'streaming' || status === 'submitted';

  return (
    <>
      {/* ── Header ── */}
      <header id="header">
        <div className="header-title-container" style={{ flex: 1, minWidth: 0 }}>
          {activeThreadTitle && (
            <span
              className="brand"
              title={activeThreadTitle}
              style={{ maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {activeThreadTitle}
            </span>
          )}
        </div>

        <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button className="header-icon-btn" title="New Chat" onClick={handleNewChat}>
            <SquarePen size={18} />
          </button>

          {/* History / Actions popup */}
          <div style={{ position: 'relative' }} ref={historyRef}>
            <button
              className={`header-icon-btn ${showHistoryPopup ? 'active' : ''}`}
              title="Menu"
              onClick={() => setShowHistoryPopup(!showHistoryPopup)}
            >
              <MoreVertical size={18} />
            </button>
            {showHistoryPopup && (
              <HistoryPopup
                threads={threads}
                activeThreadId={activeThreadId}
                setActiveThreadId={setActiveThreadId}
                setShowHistoryPopup={setShowHistoryPopup}
                onDeleteThread={handleDeleteThread}
                user={user}
                onSignIn={onSignIn}
                onSignOut={onSignOut}
                onOpenPlugins={onOpenPlugins}
              />
            )}
          </div>

          {user && (
            user.picture ? (
              <img className="header-avatar-img" src={user.picture} alt="" title={user.name} />
            ) : (
              <div className="header-avatar" title={user.name}>
                {user.name?.charAt(0).toUpperCase() || '?'}
              </div>
            )
          )}

          <button className="header-icon-btn" title={popoutMode ? 'Attach to sidebar' : 'Pop out chat'} onClick={handleTogglePopout}>
            <PictureInPicture2 size={18} />
          </button>
        </div>
      </header>

      {/* ── Message area ── */}
      <div id="messages">
        {messages.length === 0 ? (
          <WelcomeScreen
            user={user}
            onSuggestionClick={handleSuggestionClick}
            onSignIn={onSignIn}
            activeTabUrl={activeTabUrl}
            activeTabTitle={activeTabTitle}
            llmSuggestions={activeTabSuggestions}
            suggestionsLoading={suggestionsLoading}
          />
        ) : (
          messages.map((msg, idx) => (
            <MessageItem
              key={msg.id}
              msg={msg}
              isLast={idx === messages.length - 1}
              isStreaming={isStreaming}
              addToolApprovalResponse={addToolApprovalResponse}
              onRegenerate={handleRegenerateMessage}
              onEditMessage={handleEditMessage}
              isLatestAssistant={idx === latestAssistantIdx}
              allMessages={messages}
            />
          ))
        )}

        {chatError && (
          <div className="chat-error-banner">
            <CircleX size={14} style={{ flexShrink: 0 }} />
            <span>{chatError instanceof Error ? chatError.message : String(chatError)}</span>
          </div>
        )}

        {(isStreaming || activeTool) && (
          <LoadingIndicator />
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Plugins Trigger ── */}
      {user && (
        <div className="chat-plugins-bar">
          <div className="chat-plugins-active-list">
            {(() => {
              const enabled = availablePlugins.filter(p => !disabledPlugins.includes(p.id));
              const visible = enabled.slice(0, 2);
              const remaining = enabled.length - 2;
              return (
                <>
                  {visible.map(p => {
                    const domain = (() => {
                      try { return new URL(p.url).hostname; } catch { return ''; }
                    })();
                    const faviconUrl = domain ? `${WORKER_URL}/api/favicon?hostname=${domain}` : '';
                    return (
                      <div key={p.id} className="active-plugin-tag" title={`Plugin: ${p.name}`}>
                        {faviconUrl ? (
                          <img
                            src={faviconUrl}
                            alt=""
                            className="active-plugin-favicon"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                              const fallback = (e.target as HTMLElement).nextElementSibling as HTMLElement;
                              if (fallback) fallback.style.display = 'flex';
                            }}
                          />
                        ) : null}
                        <div className="active-plugin-fallback-icon" style={{ display: faviconUrl ? 'none' : 'flex' }}>
                          {(p.name || '?').charAt(0).toUpperCase()}
                        </div>
                        <span className="active-plugin-name">{p.name}</span>
                      </div>
                    );
                  })}
                  {remaining > 0 && (
                    <div className="active-plugin-tag remaining-count" title={`${remaining} more plugins enabled`}>
                      <span>+{remaining}</span>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
          
          <div style={{ position: 'relative' }}>
            <button
              className={`chat-plugins-btn ${showPluginsPopup ? 'active' : ''}`}
              onClick={() => setShowPluginsPopup(!showPluginsPopup)}
              title="Configure Plugins"
            >
              <Settings2 size={18} />
            </button>
            
            {showPluginsPopup && (
              <div className="plugins-selector-popup" ref={pluginsPopupRef}>
                <div className="plugins-selector-header">Plugin Access</div>
                <div className="plugins-selector-list">
                  {availablePlugins.length === 0 ? (
                    <div className="plugins-selector-empty">No plugins connected</div>
                  ) : (
                    availablePlugins.map(p => {
                      const isEnabled = !disabledPlugins.includes(p.id);
                      const domain = (() => {
                        try { return new URL(p.url).hostname; } catch { return ''; }
                      })();
                      const faviconUrl = domain ? `${WORKER_URL}/api/favicon?hostname=${domain}` : '';
                      return (
                        <div
                          key={p.id}
                          className="plugins-selector-item"
                          onClick={() => onTogglePlugin?.(p.id)}
                        >
                          <div className="plugins-selector-item-left">
                            {faviconUrl ? (
                              <img
                                src={faviconUrl}
                                alt=""
                                className="plugins-selector-favicon"
                                onError={(e) => {
                                  (e.target as HTMLElement).style.display = 'none';
                                  const fallback = (e.target as HTMLElement).nextElementSibling as HTMLElement;
                                  if (fallback) fallback.style.display = 'flex';
                                }}
                              />
                            ) : null}
                            <div className="plugins-selector-fallback-icon" style={{ display: faviconUrl ? 'none' : 'flex' }}>
                              {(p.name || '?').charAt(0).toUpperCase()}
                            </div>
                            <span className="plugins-selector-name">{p.name}</span>
                          </div>
                          
                          <div className={`plugins-selector-checkbox ${isEnabled ? 'checked' : ''}`}>
                            {isEnabled && <Check size={10} strokeWidth={4} color="#ffffff" />}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Chat Input ── */}
      <ChatInput
        inputValue={inputValue}
        setInputValue={setInputValue}
        inputRef={inputRef}
        isStreaming={isStreaming}
        onSubmit={handleSubmit}
        onKeyDown={handleKeyDown}
        onStop={stop}
        showPopup={showPopup}
        setShowPopup={setShowPopup}
        showSelected={showSelected}
        setShowSelected={setShowSelected}
        selectedPanelRef={selectedPanelRef}
        attachPopupRef={attachPopupRef}
        tabs={tabs}
        selectedUrls={selectedUrls}
        activeTabUrl={activeTabUrl}
        onToggleUrl={onToggleUrl}
        showModelPopup={showModelPopup}
        setShowModelPopup={setShowModelPopup}
        modelDropdownRef={modelDropdownRef}
        model={model}
        modelsData={MODELS_DATA}
        selectedModelLabel={selectedModelLabel}
        selectedModelIcon={selectedModelIcon}
        onSelectModel={onSelectModel}
      />
    </>
  );
}

const ChatSkeleton = () => {
  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: '100vh', 
      background: 'var(--bg-primary, #131314)', 
      padding: '16px', 
      boxSizing: 'border-box' 
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        height: '40px',
        marginBottom: '20px',
        width: '100%'
      }}>
        <div className="skeleton-glow" style={{ width: '80px', height: '14px', borderRadius: '7px' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div className="skeleton-glow" style={{ width: '80px', height: '14px', borderRadius: '7px' }} />
        </div>
      </div>
      
      {/* Content Area */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        width: '100%',
        overflow: 'hidden'
      }}>
        {/* Large Top Card */}
        <div className="skeleton-glow" style={{
          flex: '0 0 55%',
          borderRadius: '16px',
          width: '100%'
        }} />
        
        {/* Smaller Bottom Card */}
        <div className="skeleton-glow" style={{
          flex: '0 0 25%',
          borderRadius: '16px',
          width: '100%'
        }} />
      </div>
    </div>
  );
};

// ── Main App ──
export default function App() {
  // ── Tab state ──
  const [tabs, setTabs]               = useState<any[]>([]);
  const [selectedUrls, setSelectedUrls] = useState<string[]>([]);
  const [activeTabUrl, setActiveTabUrl]         = useState<string>('');
  const [activeTabTitle, setActiveTabTitle]     = useState<string>('');
  const [activeTabSuggestions, setActiveTabSuggestions] = useState<string[]>([]);
  const [suggestionsLoading, setSuggestionsLoading]     = useState(false);
  const [user, setUser]               = useState<any>(null);

  // ── Model state ──
  const [model, setModel] = useState(() => {
    const saved = localStorage.getItem(LS_MODEL);
    return saved && VALID_MODELS.includes(saved) ? saved : DEFAULT_MODEL;
  });

  // ── Popup visibility ──
  const [showPopup,        setShowPopup]        = useState(false);
  const [showSelected,     setShowSelected]     = useState(false);
  const [showModelPopup,   setShowModelPopup]   = useState(false);
  const [activeView, setActiveView] = useState<'chat' | 'plugins'>('chat');
  const [showHistoryPopup, setShowHistoryPopup] = useState(false);
  const [availablePlugins, setAvailablePlugins] = useState<any[]>([]);
  const [disabledPlugins, setDisabledPlugins] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(LS_DISABLED_PLUGINS);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // ── Input state ──
  const [inputValue, setInputValue] = useState('');
  const inputRef          = useRef<HTMLTextAreaElement>(null);
  const attachPopupRef    = useRef<HTMLDivElement>(null);
  const selectedPanelRef  = useRef<HTMLDivElement>(null);
  const modelDropdownRef  = useRef<HTMLDivElement>(null);
  const historyRef        = useRef<HTMLDivElement>(null);

  // ── Thread management (via KV-backed hook) ──
  const {
    threads,
    activeThreadId,
    setActiveThreadId,
    activeThreadTitle,
    updateActiveThreadTitle,
    handleNewChat: _handleNewChat,
    handleDeleteThread,
    ensureThreadEntry,
  } = useThreads(!!user);

  // ── Derived ──
  const pluginsAgentId = useMemo(() => getPluginsAgentId(user), [user?.id]);

  // Subscribe to MCP updates on pluginsAgentId
  useAgent({
    agent: 'ChatAgent',
    name: pluginsAgentId,
    host: WORKER_URL,
    onMcpUpdate: (mcpState: any) => {
      console.log('[App] MCP update received:', mcpState);
      if (mcpState?.servers) {
        const list = Object.entries(mcpState.servers).map(([id, s]: [string, any]) => ({
          id,
          name: s.name,
          url: s.server_url ?? '',
          state: s.state,
        }));
        setAvailablePlugins(list);
      }
    },
  });

  const togglePlugin = (id: string) => {
    setDisabledPlugins(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      localStorage.setItem(LS_DISABLED_PLUGINS, JSON.stringify(next));
      return next;
    });
  };

  const selectedModelLabel = useMemo(() => {
    const found = MODELS_DATA.find(m => m.value === model);
    return found ? found.label : model.split('/').pop()!;
  }, [model]);

  const selectedModelIcon = useMemo(() => {
    const found = MODELS_DATA.find(m => m.value === model);
    return found ? found.icon : '';
  }, [model]);

  // ── Effects ──
  useEffect(() => {
    const fetchTabs = () => {
      chrome.runtime.sendMessage({ type: 'canvas:get' }, (response) => {
        const t = response?.tabs || [];
        setTabs(t);
        setSelectedUrls(prev =>
          prev.length === 0
            ? []
            : prev.filter((u: string) => t.some((x: any) => x.url === u))
        );
      });
    };

    fetchTabs();

    chrome.runtime.sendMessage({ type: 'auth:status' }, (response) => {
      if (response?.user) setUser(response.user);
    });

    if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tabUrl   = tabs[0]?.url   || '';
        const tabTitle = tabs[0]?.title || '';
        if (tabs[0]?.url)   setActiveTabUrl(tabUrl);
        if (tabs[0]?.title) setActiveTabTitle(tabTitle);

        // Auto-add active tab to selected set on first load (Option B)
        if (tabUrl && !tabUrl.startsWith('chrome://')) {
          setSelectedUrls(prev => {
            if (prev.length === 0) return [tabUrl];
            if (!prev.includes(tabUrl)) return [...prev, tabUrl];
            return prev;
          });
        }

        // Generate LLM suggestions for the active tab
        if (tabUrl && !tabUrl.startsWith('chrome://')) {
          console.log('[Obot][suggestions] active tab:', tabUrl, '| title:', tabTitle);
          setSuggestionsLoading(true);
          setActiveTabSuggestions([]);

          // Extract a short page text via the content script (best-effort).
          // If the content script isn't injected into this tab, lastError is set
          // and we simply fall back to an empty pageText.
          const runSuggestions = (pageText: string) => {
            console.log('[Obot][suggestions] posting to /api/suggestions, pageText len:', pageText.length);
            fetch(`${WORKER_URL}/api/suggestions`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: tabUrl, title: tabTitle, pageText }),
            })
              .then((r) => {
                console.log('[Obot][suggestions] response status:', r.status);
                return r.json();
              })
              .then((data: any) => {
                console.log('[Obot][suggestions] response data:', JSON.stringify(data));
                console.log('[Obot][suggestions] DEBUG:', JSON.stringify(data?.debug));
                if (Array.isArray(data.suggestions) && data.suggestions.length > 0) {
                  console.log('[Obot][suggestions] setting', data.suggestions.length, 'suggestions');
                  setActiveTabSuggestions(data.suggestions);
                } else {
                  console.log('[Obot][suggestions] no suggestions in response');
                }
              })
              .catch((e) => { console.log('[Obot][suggestions] fetch error:', e); })
              .finally(() => setSuggestionsLoading(false));
          };

          if (typeof chrome !== 'undefined' && chrome.scripting?.executeScript && tabs[0]?.id) {
            chrome.scripting.executeScript({
              target: { tabId: tabs[0].id },
              func: () => {
                return (document.body?.innerText || '')
                  .replace(/\s+/g, ' ')
                  .trim()
                  .slice(0, 4000);
              }
            })
              .then((results) => {
                const pageText = (results && results[0]) ? (results[0].result || '') : '';
                console.log('[Obot][suggestions] pageText from executeScript len:', pageText.length);
                runSuggestions(pageText);
              })
              .catch((err) => {
                console.warn('[Obot][suggestions] executeScript failed:', err);
                runSuggestions('');
              });
          } else {
            runSuggestions('');
          }
        }
      });
    }

    const handleMessage = (message: any) => {
      if (message.type === 'canvas:updated' || message.type === 'product:detected') {
        fetchTabs();
      }
    };
    chrome.runtime.onMessage.addListener(handleMessage);
    return () => { chrome.runtime.onMessage.removeListener(handleMessage); };
  }, []);

  // Close popups on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showPopup && attachPopupRef.current && !attachPopupRef.current.contains(event.target as Node)) {
        const plusBtn    = document.querySelector('.input-action-circle-btn');
        const chevronBtn = document.querySelector('.chips-expand');
        if (!plusBtn?.contains(event.target as Node) && !chevronBtn?.contains(event.target as Node)) {
          setShowPopup(false);
        }
      }
      if (showSelected && selectedPanelRef.current && !selectedPanelRef.current.contains(event.target as Node)) {
        const chips = document.querySelector('#context-chips');
        if (!chips?.contains(event.target as Node)) {
          setShowSelected(false);
        }
      }
      if (showModelPopup && modelDropdownRef.current && !modelDropdownRef.current.contains(event.target as Node)) {
        setShowModelPopup(false);
      }
      if (showHistoryPopup && historyRef.current && !historyRef.current.contains(event.target as Node)) {
        setShowHistoryPopup(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => { document.removeEventListener('mousedown', handleClickOutside); };
  }, [showPopup, showSelected, showModelPopup, showHistoryPopup]);

  // ── Handlers ──
  const handleSignIn  = () => chrome.runtime.sendMessage({ type: 'auth:signin' },  (r) => { if (r?.user) setUser(r.user); });
  const handleSignOut = () => chrome.runtime.sendMessage({ type: 'auth:signout' }, () => {
    setUser(null);
    localStorage.clear();
    window.location.reload();
  });

  const handleSelectModel = (val: string) => {
    setModel(val);
    localStorage.setItem(LS_MODEL, val);
    setShowModelPopup(false);
  };

  const toggleUrl = (url: string) =>
    setSelectedUrls(prev => prev.includes(url) ? prev.filter(u => u !== url) : [...prev, url]);

  // ── Render ──
  if (activeView === 'plugins') {
    return (
      <PluginsScreen
        agentId={pluginsAgentId}
        userId={user?.id || null}
        onClose={() => setActiveView('chat')}
      />
    );
  }

  return (
    <Suspense fallback={<ChatSkeleton />}>
      <ChatView
        key={activeThreadId}
        activeThreadId={activeThreadId}
        activeThreadTitle={activeThreadTitle}
        updateActiveThreadTitle={updateActiveThreadTitle}
        handleNewChat={_handleNewChat}
        handleDeleteThread={handleDeleteThread}
        ensureThreadEntry={ensureThreadEntry}
        threads={threads}
        setActiveThreadId={setActiveThreadId}
        model={model}
        user={user}
        tabs={tabs}
        selectedUrls={selectedUrls}
        activeTabUrl={activeTabUrl}
        activeTabTitle={activeTabTitle}
        activeTabSuggestions={activeTabSuggestions}
        suggestionsLoading={suggestionsLoading}
        showPopup={showPopup}
        setShowPopup={setShowPopup}
        showSelected={showSelected}
        setShowSelected={setShowSelected}
        selectedPanelRef={selectedPanelRef}
        showModelPopup={showModelPopup}
        setShowModelPopup={setShowModelPopup}
        showHistoryPopup={showHistoryPopup}
        setShowHistoryPopup={setShowHistoryPopup}
        inputValue={inputValue}
        setInputValue={setInputValue}
        inputRef={inputRef}
        attachPopupRef={attachPopupRef}
        modelDropdownRef={modelDropdownRef}
        historyRef={historyRef}
        selectedModelLabel={selectedModelLabel}
        selectedModelIcon={selectedModelIcon}
        onToggleUrl={toggleUrl}
        onSelectModel={handleSelectModel}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
        onOpenPlugins={() => setActiveView('plugins')}
        pluginsAgentId={pluginsAgentId}
        availablePlugins={availablePlugins}
        disabledPlugins={disabledPlugins}
        onTogglePlugin={togglePlugin}
      />
    </Suspense>
  );
}

