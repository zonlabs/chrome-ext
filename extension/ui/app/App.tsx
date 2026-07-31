import React, { useState, useEffect, useRef, useCallback, useMemo, Suspense } from 'react';

import { useThreads } from '../features/chat/hooks/useThreads';
import { PluginsScreen } from '../features/plugins/components/PluginsScreen';
import { ChatView } from '../features/chat/components/ChatView';
import { PluginsSubscription } from '../features/plugins/components/PluginsSubscription';
import { ChatSkeleton } from '../features/chat/components/ChatSkeleton';
import { getPluginsAgentId } from '../features/plugins/lib/agentId';
import { getActiveTabPageContext } from '../features/chat/lib/clientTools';
import { WORKER_URL, VALID_MODELS, DEFAULT_MODEL, MODELS_DATA, LS_DISABLED_PLUGINS, LS_MODEL } from '../../shared/constants';

/** Main application component Ã¢â‚¬â€ orchestrates state, side-effects, and view routing (chat vs plugins). */
export default function App() {
  // Ã¢â€â‚¬Ã¢â€â‚¬ Tab state Ã¢â€â‚¬Ã¢â€â‚¬
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
  /** True until the stored auth session is resolved on mount (prevents a sign-in flash). */
  const [authLoading, setAuthLoading] = useState(true);
  const handleAuthLost = useCallback(() => setUser(null), []);

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
  /** Current view Ã¢â‚¬â€ either the chat interface or the plugins management screen. */
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
    createThread,
  } = useThreads(!!user, handleAuthLost);

  /** Agent ID derived from the current user for plugin registration Ã¢â‚¬â€ key+guard avoids "" identity transitions. */
  const pluginsAgentId = useMemo(() => getPluginsAgentId(user), [user?.id]);

  // Subscribe to MCP updates on pluginsAgentId Ã¢â‚¬â€ key+guard avoids "" identity transitions
  /** Receive MCP state updates from the backend and map them to the available plugins list. */
  const handleMcpUpdate = useCallback((mcpState: any) => {
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

  /** Fetch open browser tabs from the background script. */
  const fetchTabs = useCallback(() => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'tabs:get' }, (response) => {
        const t = response?.tabs || [];
        setTabs(t);
      });
    }
  }, []);

  /** In-memory cache mapping tab URLs to AI suggestion arrays. */
  const suggestionsCacheRef = useRef<Map<string, string[]>>(new Map());
  /** Ref for debouncing suggestion requests when switching tabs rapidly. */
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Track timestamps of recent API calls for client-side rate limiting. */
  const apiCallTimesRef = useRef<number[]>([]);
  /** Track last tab URL for which suggestion fetch was triggered. */
  const lastSuggestedUrlRef = useRef<string>('');
  /** Max API calls allowed per 60 seconds rolling window. */
  const MAX_CALLS_PER_MINUTE = 5;
  /** Debounce delay in ms before triggering suggestion API call. */
  const DEBOUNCE_MS = 500;

  /** Fetch AI suggestions from /api/suggestions with caching, debouncing, and rate limiting. */
  const fetchSuggestionsForTab = useCallback((tabUrl: string, tabTitle: string) => {
    if (!tabUrl || tabUrl.startsWith('chrome://') || tabUrl.startsWith('about:')) {
      setActiveTabSuggestions([]);
      setSuggestionsLoading(false);
      lastSuggestedUrlRef.current = tabUrl;
      return;
    }

    // 1. Instant Cache Hit Check (0ms delay, 0 network calls)
    if (suggestionsCacheRef.current.has(tabUrl)) {
      setActiveTabSuggestions(suggestionsCacheRef.current.get(tabUrl)!);
      setSuggestionsLoading(false);
      lastSuggestedUrlRef.current = tabUrl;
      return;
    }

    // 2. Strict URL Guard: If we have already initiated suggestion fetch for this EXACT tab URL, skip!
    if (lastSuggestedUrlRef.current === tabUrl) {
      return;
    }
    lastSuggestedUrlRef.current = tabUrl;

    // 3. Clear any pending debounced request from previous tab switch
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Clear old suggestions and show shimmer loading state while waiting for API
    setActiveTabSuggestions([]);
    setSuggestionsLoading(true);

    // 4. Debounce: wait 500ms before calling /api/suggestions
    debounceTimerRef.current = setTimeout(async () => {
      const now = Date.now();
      apiCallTimesRef.current = apiCallTimesRef.current.filter(t => now - t < 60000);

      if (apiCallTimesRef.current.length >= MAX_CALLS_PER_MINUTE) {
        console.warn(`[Obot][suggestions] Rate limit reached (${MAX_CALLS_PER_MINUTE}/min).`);
        setSuggestionsLoading(false);
        return;
      }

      apiCallTimesRef.current.push(now);

      // Extract rich page context (headings, paragraphs, content excerpts)
      let pageText = '';
      try {
        const ctx = await getActiveTabPageContext();
        if (ctx?.text) pageText = ctx.text;
      } catch {}

      fetch(`${WORKER_URL}/api/suggestions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: tabUrl, title: tabTitle, pageText }),
      })
        .then((r) => r.json())
        .then((data: any) => {
          if (Array.isArray(data.suggestions) && data.suggestions.length > 0) {
            suggestionsCacheRef.current.set(tabUrl, data.suggestions);
            setActiveTabSuggestions(data.suggestions);
          } else {
            setActiveTabSuggestions([]);
          }
        })
        .catch((e) => {
          console.log('[Obot][suggestions] fetch error:', e);
          setActiveTabSuggestions([]);
        })
        .finally(() => setSuggestionsLoading(false));
    }, DEBOUNCE_MS);
  }, []);

  /** Map of tabUrl -> threadId attached to that tab. */
  const tabThreadMapRef = useRef<Map<string, string>>(new Map());

  /** Keep tabThreadMap updated when activeThreadId changes. */
  useEffect(() => {
    if (activeThreadId && activeTabUrl && !activeTabUrl.startsWith('chrome://')) {
      tabThreadMapRef.current.set(activeTabUrl, activeThreadId);
    }
  }, [activeThreadId, activeTabUrl]);

  /** Refresh current active tab state, tab chips, and suggestions when user switches or updates tabs. */
  const refreshActiveTab = useCallback(() => {
    if (typeof chrome === 'undefined' || !chrome.tabs?.query) return;

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || tabs.length === 0) return;
      const tabUrl   = tabs[0]?.url   || '';
      const tabTitle = tabs[0]?.title || '';

      if (tabUrl)   setActiveTabUrl(tabUrl);
      if (tabTitle) setActiveTabTitle(tabTitle);

      if (tabUrl && !tabUrl.startsWith('chrome://') && !tabUrl.startsWith('about:')) {
        prevActiveTabUrlRef.current = tabUrl;

        // Reset selectedUrls to current tab URL only
        setSelectedUrls([tabUrl]);

        // Tab-specific thread lookup: if tab has no attached thread, show Welcome Screen
        const threadForThisTab = tabThreadMapRef.current.get(tabUrl);
        if (threadForThisTab) {
          setActiveThreadId(threadForThisTab);
        } else {
          setActiveThreadId(null);
          fetchSuggestionsForTab(tabUrl, tabTitle);
        }

        fetchTabs();
      }
    });
  }, [fetchTabs, setActiveThreadId, fetchSuggestionsForTab]);

  /** On mount & tab events: fetch tabs, auth status, update active tab info, and listen for live tab changes. */
  useEffect(() => {
    fetchTabs();
    refreshActiveTab();

    chrome.runtime.sendMessage({ type: 'auth:status' }, (response) => {
      if (response?.user) setUser(response.user);
      setAuthLoading(false);
    });

    const handleMessage = (message: any) => {
      if (message.type === 'tab:activated') {
        refreshActiveTab();
      } else if (message.type === 'tab:updated' && message.url && message.url !== prevActiveTabUrlRef.current) {
        refreshActiveTab();
      }
    };
    chrome.runtime.onMessage.addListener(handleMessage);

    const handleTabActivated = () => {
      refreshActiveTab();
    };

    const handleTabUpdated = (_tabId: number, changeInfo: { url?: string }) => {
      if (changeInfo.url && changeInfo.url !== prevActiveTabUrlRef.current) {
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

  // Ã¢â€â‚¬Ã¢â€â‚¬ Handlers Ã¢â€â‚¬Ã¢â€â‚¬
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

  /** Handle new chat creation, unbinding current tab thread. */
  const handleNewChat = useCallback(() => {
    if (activeTabUrl) {
      tabThreadMapRef.current.delete(activeTabUrl);
      fetchSuggestionsForTab(activeTabUrl, activeTabTitle);
    }
    _handleNewChat();
  }, [_handleNewChat, activeTabUrl, activeTabTitle, fetchSuggestionsForTab]);

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

  /** Wait for the stored auth session before rendering, so the sign-in screen never flashes for logged-in users. */
  if (authLoading) {
    return <ChatSkeleton />;
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
        activeThreadId={activeThreadId}
        activeThreadTitle={activeThreadTitle}
        updateActiveThreadTitle={updateActiveThreadTitle}
        handleNewChat={handleNewChat}
        handleDeleteThread={handleDeleteThread}
        createThread={createThread}
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
