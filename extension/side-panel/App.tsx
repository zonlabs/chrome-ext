import React, { useState, useEffect, useRef, useCallback, useMemo, Suspense } from 'react';

import { useThreads } from './utils/useThreads';
import { PluginsScreen } from './components/PluginsScreen';
import { ChatView } from './components/ChatView';
import { PluginsSubscription } from './components/PluginsSubscription';
import { ChatSkeleton } from './components/ChatSkeleton';
import { getPluginsAgentId } from './utils/agentId';
import { WORKER_URL, VALID_MODELS, DEFAULT_MODEL, MODELS_DATA, LS_DISABLED_PLUGINS, LS_MODEL } from '../shared/constants';

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
  const [signingIn, setSigningIn] = useState(false);
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

  // Subscribe to MCP updates on pluginsAgentId — key+guard avoids "" identity transitions
  const handleMcpUpdate = useCallback((mcpState: any) => {
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
  }, []);

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
  const handleSignIn  = () => {
    setSigningIn(true);
    chrome.runtime.sendMessage({ type: 'auth:signin' },  (r) => {
      setSigningIn(false);
      if (r?.user) setUser(r.user);
    });
  };
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
    <>
      {pluginsAgentId && (
        <PluginsSubscription
          key={pluginsAgentId}
          agentId={pluginsAgentId}
          onMcpUpdate={handleMcpUpdate}
        />
      )}
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
        signingIn={signingIn}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
        onOpenPlugins={() => setActiveView('plugins')}
        pluginsAgentId={pluginsAgentId}
        availablePlugins={availablePlugins}
        disabledPlugins={disabledPlugins}
        onTogglePlugin={togglePlugin}
      />
    </Suspense>
    </>
  );
}

