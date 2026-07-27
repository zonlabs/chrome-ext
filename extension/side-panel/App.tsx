import React, { useState, useEffect, useRef, useCallback, useMemo, Suspense } from 'react';

import { useThreads } from './utils/useThreads';
import { PluginsScreen } from './components/PluginsScreen';
import { ChatView } from './components/ChatView';
import { PluginsSubscription } from './components/PluginsSubscription';
import { ChatSkeleton } from './components/ChatSkeleton';
import { getPluginsAgentId } from './utils/agentId';
import { WORKER_URL, VALID_MODELS, DEFAULT_MODEL, MODELS_DATA, LS_DISABLED_PLUGINS, LS_MODEL } from '../shared/constants';

/** Main application component — orchestrates state, side-effects, and view routing (chat vs plugins). */
export default function App() {
  // ── Tab state ──
  /** Active browser tabs. */
  const [tabs, setTabs]               = useState<any[]>([]);
  /** URLs the user has selected to share as context. */
  const [selectedUrls, setSelectedUrls] = useState<string[]>([]);
  /** URL of the currently active browser tab. */
  const [activeTabUrl, setActiveTabUrl]         = useState<string>('');
  /** Title of the currently active browser tab. */
  const [activeTabTitle, setActiveTabTitle]     = useState<string>('');
  /** LLM-generated suggestions for the active tab content. */
  const [activeTabSuggestions, setActiveTabSuggestions] = useState<string[]>([]);
  /** Whether LLM suggestions are currently being fetched. */
  const [suggestionsLoading, setSuggestionsLoading]     = useState(false);
  /** Authenticated user object, or null if signed out. */
  const [user, setUser]               = useState<any>(null);

  /** Currently selected model ID, persisted to and restored from localStorage. */
  const [model, setModel] = useState(() => {
    const saved = localStorage.getItem(LS_MODEL);
    return saved && VALID_MODELS.includes(saved) ? saved : DEFAULT_MODEL;
  });

  /** Whether the tab-attachment popup is visible. */
  const [showPopup,        setShowPopup]        = useState(false);
  /** Whether the selected-tabs detail panel is expanded. */
  const [showSelected,     setShowSelected]     = useState(false);
  /** Whether the model selector dropdown is visible. */
  const [showModelPopup,   setShowModelPopup]   = useState(false);
  /** Current view — either the chat interface or the plugins management screen. */
  const [activeView, setActiveView] = useState<'chat' | 'plugins'>('chat');
  /** Whether the history / menu popup is visible. */
  const [showHistoryPopup, setShowHistoryPopup] = useState(false);
  /** Whether a sign-in request is currently in flight. */
  const [signingIn, setSigningIn] = useState(false);
  /** MCP plugins reported by the backend after connecting. */
  const [availablePlugins, setAvailablePlugins] = useState<any[]>([]);
  /** IDs of plugins the user has manually disabled, persisted to localStorage. */
  const [disabledPlugins, setDisabledPlugins] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(LS_DISABLED_PLUGINS);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  /** Current value of the message input textarea. */
  const [inputValue, setInputValue] = useState('');
  /** Ref for the message input textarea element. */
  const inputRef          = useRef<HTMLTextAreaElement>(null);
  /** Ref for the tab-attachment popup (used for outside-click detection). */
  const attachPopupRef    = useRef<HTMLDivElement>(null);
  /** Ref for the selected-tabs detail panel (used for outside-click detection). */
  const selectedPanelRef  = useRef<HTMLDivElement>(null);
  /** Ref for the model dropdown (used for outside-click detection). */
  const modelDropdownRef  = useRef<HTMLDivElement>(null);
  /** Ref for the history popup (used for outside-click detection). */
  const historyRef        = useRef<HTMLDivElement>(null);

  /** Thread CRUD and active-thread state from the KV-backed useThreads hook. */
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

  /** Agent ID derived from the current user for plugin registration — key+guard avoids "" identity transitions. */
  const pluginsAgentId = useMemo(() => getPluginsAgentId(user), [user?.id]);

  // Subscribe to MCP updates on pluginsAgentId — key+guard avoids "" identity transitions
  /** Receive MCP state updates from the backend and map them to the available plugins list. */
  const handleMcpUpdate = useCallback((mcpState: any) => {
    console.log('[App] MCP update received:', mcpState);
    if (mcpState?.servers) {
      const list = Object.entries(mcpState.servers).map(([id, s]: [string, any]) => ({
        id,
        name: s.name,
        url: s.server_url ?? '',
        state: s.state,
      }));
      setAvailablePlugins(prev => {
        if (
          prev.length === list.length &&
          prev.every((p, i) => p.id === list[i].id && p.name === list[i].name && p.url === list[i].url && p.state === list[i].state)
        ) {
          return prev;
        }
        return list;
      });
    }
  }, []);

  /** Toggle a plugin ID in/out of the disabled set and persist to localStorage. */
  const togglePlugin = (id: string) => {
    setDisabledPlugins(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      localStorage.setItem(LS_DISABLED_PLUGINS, JSON.stringify(next));
      return next;
    });
  };

  /** Human-readable label for the currently selected model. */
  const selectedModelLabel = useMemo(() => {
    const found = MODELS_DATA.find(m => m.value === model);
    return found ? found.label : model.split('/').pop()!;
  }, [model]);

  /** Icon string for the currently selected model. */
  const selectedModelIcon = useMemo(() => {
    const found = MODELS_DATA.find(m => m.value === model);
    return found ? found.icon : '';
  }, [model]);

  /** Track previous active tab URL to replace single auto-selected tab when switching active tab. */
  const prevActiveTabUrlRef = useRef<string>('');
  /** Track last suggested URL to prevent redundant LLM suggestion calls. */
  const lastSuggestedUrlRef = useRef<string>('');

  /** Fetch open browser tabs from the background script. */
  const fetchTabs = useCallback(() => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'tabs:get' }, (response) => {
        const t = response?.tabs || [];
        setTabs(t);
        setSelectedUrls(prev =>
          prev.length === 0
            ? []
            : prev.filter((u: string) => t.some((x: any) => x.url === u))
        );
      });
    }
  }, []);

  /** Fetch LLM suggestions for the active tab URL and title. */
  const fetchSuggestionsForTab = useCallback((tabUrl: string, tabTitle: string, tabId?: number) => {
    if (!tabUrl || tabUrl.startsWith('chrome://') || tabUrl.startsWith('about:')) {
      setActiveTabSuggestions([]);
      return;
    }

    if (lastSuggestedUrlRef.current === tabUrl) return;
    lastSuggestedUrlRef.current = tabUrl;

    console.log('[Obot][suggestions] active tab:', tabUrl, '| title:', tabTitle);
    setSuggestionsLoading(true);
    setActiveTabSuggestions([]);

    const runSuggestions = (pageText: string) => {
      console.log('[Obot][suggestions] posting to /api/suggestions, pageText len:', pageText.length);
      fetch(`${WORKER_URL}/api/suggestions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: tabUrl, title: tabTitle, pageText }),
      })
        .then((r) => r.json())
        .then((data: any) => {
          if (Array.isArray(data.suggestions) && data.suggestions.length > 0) {
            setActiveTabSuggestions(data.suggestions);
          } else {
            console.log('[Obot][suggestions] no suggestions in response');
          }
        })
        .catch((e) => { console.log('[Obot][suggestions] fetch error:', e); })
        .finally(() => setSuggestionsLoading(false));
    };

    if (typeof chrome !== 'undefined' && chrome.scripting?.executeScript && tabId) {
      chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          return (document.body?.innerText || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 4000);
        }
      })
        .then((results) => {
          const pageText = (results && results[0]) ? (results[0].result || '') : '';
          runSuggestions(pageText);
        })
        .catch((err) => {
          console.warn('[Obot][suggestions] executeScript failed:', err);
          runSuggestions('');
        });
    } else {
      runSuggestions('');
    }
  }, []);

  /** Refresh current active tab state, tab chips, and suggestions when user switches or updates tabs. */
  const refreshActiveTab = useCallback(() => {
    if (typeof chrome === 'undefined' || !chrome.tabs?.query) return;

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || tabs.length === 0) return;
      const tabUrl   = tabs[0]?.url   || '';
      const tabTitle = tabs[0]?.title || '';
      const tabId    = tabs[0]?.id;

      if (tabUrl)   setActiveTabUrl(tabUrl);
      if (tabTitle) setActiveTabTitle(tabTitle);

      if (tabUrl && !tabUrl.startsWith('chrome://') && !tabUrl.startsWith('about:')) {
        const oldActiveUrl = prevActiveTabUrlRef.current;
        prevActiveTabUrlRef.current = tabUrl;

        setSelectedUrls(prev => {
          if (prev.length === 0) return [tabUrl];
          if (prev.length === 1 && prev[0] === oldActiveUrl) return [tabUrl];
          if (!prev.includes(tabUrl)) return [...prev, tabUrl];
          return prev;
        });

        fetchTabs();
        fetchSuggestionsForTab(tabUrl, tabTitle, tabId);
      }
    });
  }, [fetchTabs, fetchSuggestionsForTab]);

  /** On mount & tab events: fetch tabs, auth status, update active tab info, and listen for live tab changes. */
  useEffect(() => {
    fetchTabs();
    refreshActiveTab();

    chrome.runtime.sendMessage({ type: 'auth:status' }, (response) => {
      if (response?.user) setUser(response.user);
    });

    const handleMessage = (message: any) => {
      if (
        message.type === 'tab:activated' ||
        message.type === 'tab:updated'
      ) {
        fetchTabs();
        refreshActiveTab();
      }
    };
    chrome.runtime.onMessage.addListener(handleMessage);

    const handleTabActivated = () => {
      refreshActiveTab();
    };

    const handleTabUpdated = (_tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
      if (tab.active && (changeInfo.status === 'complete' || changeInfo.url || changeInfo.title)) {
        refreshActiveTab();
      }
    };

    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.onActivated?.addListener(handleTabActivated);
      chrome.tabs.onUpdated?.addListener(handleTabUpdated);
    }

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        chrome.tabs.onActivated?.removeListener(handleTabActivated);
        chrome.tabs.onUpdated?.removeListener(handleTabUpdated);
      }
    };
  }, [fetchTabs, refreshActiveTab]);

  /** Close popups (attach, selected, model, history) when user clicks outside their boundaries. */
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
  /** Initiate Google sign-in flow via the background script. */
  const handleSignIn  = () => {
    setSigningIn(true);
    chrome.runtime.sendMessage({ type: 'auth:signin' },  (r) => {
      setSigningIn(false);
      if (r?.user) setUser(r.user);
    });
  };
  /** Sign the user out, clear all local state, and reload. */
  const handleSignOut = () => chrome.runtime.sendMessage({ type: 'auth:signout' }, () => {
    setUser(null);
    localStorage.clear();
    window.location.reload();
  });

  /** Persist the selected model to localStorage and close the dropdown. */
  const handleSelectModel = (val: string) => {
    setModel(val);
    localStorage.setItem(LS_MODEL, val);
    setShowModelPopup(false);
  };

  /** Add or remove a URL from the user's selected set. */
  const toggleUrl = (url: string) =>
    setSelectedUrls(prev => prev.includes(url) ? prev.filter(u => u !== url) : [...prev, url]);

  /** Render the Plugins screen when activeView is 'plugins'. */
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

