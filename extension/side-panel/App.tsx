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
  /** Active browser tabs from the canvas (background pages). */
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
      setAvailablePlugins(list);
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

  /** On mount: fetch canvas tabs, auth status, active tab info, and generate LLM suggestions for the active tab. */
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

