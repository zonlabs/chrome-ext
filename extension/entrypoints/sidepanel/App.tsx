import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../../lib/query-client';
import { AuthProvider, useAuth } from '../../lib/auth-provider';
import { AgentProvider, usePlugins } from '../../lib/agent';
import { getPluginsAgentId } from '../../lib/agent-id';
import { useThreads } from '../../lib/useThreads';
import { useTabs } from '../../lib/useTabs';
import { useSuggestions } from '../../lib/useSuggestions';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { onTabBroadcast, getActiveTab } from '../../lib/tabs';
import { DEFAULT_MODEL, LS_MODEL, LS_DISABLED_PLUGINS, MODELS_DATA, VALID_MODELS } from '../../lib/constants';
import { ChatScreen } from '../../features/chat';
import { ChatSkeleton } from '../../features/chat/components/ChatSkeleton';
import { PluginsScreen } from '../../features/plugins';
import type { ChatThread } from '../../lib/api/threads';
import type { Tab } from '../../lib/types';

interface Plugin {
  id: string;
  name: string;
  url: string;
  state?: string;
}

function Shell() {
  const { user, authLoading, signingIn, signIn, signOut, handleAuthLost } = useAuth();
  const pluginsAgentId = getPluginsAgentId(user);
  const { mcpState } = usePlugins();

  const { threads, createThread, updateActiveThreadTitle, handleDeleteThread: deleteThread } = useThreads(!!user, handleAuthLost);
  const { tabs: browserTabs } = useTabs();
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

  const tabs: Tab[] = useMemo(
    () => browserTabs.map((t) => ({ url: t.url ?? '', title: t.title, tabId: t.id, active: t.active })),
    [browserTabs],
  );

  const [selectedUrls, setSelectedUrls] = useState<string[]>([]);
  const [activeTabUrl, setActiveTabUrl] = useState('');
  const [activeTabTitle, setActiveTabTitle] = useState('');
  const prevActiveTabUrlRef = useRef('');

  const [model, setModel] = useLocalStorage<string>(LS_MODEL, DEFAULT_MODEL);
  const [disabledPlugins, setDisabledPlugins] = useLocalStorage<string[]>(LS_DISABLED_PLUGINS, []);
  const [inputValue, setInputValue] = useState('');
  const [activeView, setActiveView] = useState<'chat' | 'plugins'>('chat');

  const [showPopup, setShowPopup] = useState(false);
  const [showSelected, setShowSelected] = useState(false);
  const [showModelPopup, setShowModelPopup] = useState(false);
  const [showHistoryPopup, setShowHistoryPopup] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const attachPopupRef = useRef<HTMLDivElement>(null);
  const selectedPanelRef = useRef<HTMLDivElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);

  const tabThreadMapRef = useRef(new Map<string, string>());

  useEffect(() => {
    if (!VALID_MODELS.includes(model)) {
      setModel(DEFAULT_MODEL);
    }
  }, [model, setModel]);

  const availablePlugins: Plugin[] = useMemo(() => {
    return Object.entries(mcpState.servers ?? {}).map(([id, server]) => ({
      id,
      name: server.name,
      url: (server as { server_url?: string }).server_url ?? server.url,
      state: (server as { state?: string }).state,
    }));
  }, [mcpState.servers]);

  const { suggestions: activeTabSuggestions, isLoading: suggestionsLoading } = useSuggestions(activeTabUrl, !!user);

  const refreshActiveTab = useCallback(async () => {
    const activeTab = await getActiveTab();
    if (!activeTab) return;
    const tabUrl = activeTab.url ?? '';
    setActiveTabUrl(tabUrl);
    setActiveTabTitle(activeTab.title ?? '');
    prevActiveTabUrlRef.current = tabUrl;
    setSelectedUrls([tabUrl]);

    const threadForThisTab = tabThreadMapRef.current.get(tabUrl);
    if (threadForThisTab) {
      setActiveThreadId(threadForThisTab);
    } else {
      setActiveThreadId(null);
    }
  }, []);

  useEffect(() => {
    void refreshActiveTab();
    return onTabBroadcast(() => {
      void refreshActiveTab();
    });
  }, [refreshActiveTab]);

  useEffect(() => {
    if (activeThreadId && activeTabUrl && !activeTabUrl.startsWith('chrome://')) {
      tabThreadMapRef.current.set(activeTabUrl, activeThreadId);
    }
  }, [activeThreadId, activeTabUrl]);

  useEffect(() => {
    function handleMouseDown(event: MouseEvent) {
      const target = event.target as Node;
      if (showPopup) {
        const inAttach = attachPopupRef.current?.contains(target);
        const inCircleBtn = (target as HTMLElement).closest?.('.input-action-circle-btn');
        if (!inAttach && !inCircleBtn) setShowPopup(false);
      }
      if (showSelected && !selectedPanelRef.current?.contains(target)) setShowSelected(false);
      if (showModelPopup && !modelDropdownRef.current?.contains(target)) setShowModelPopup(false);
      if (showHistoryPopup && !historyRef.current?.contains(target)) setShowHistoryPopup(false);
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [showPopup, showSelected, showModelPopup, showHistoryPopup]);

  const togglePlugin = useCallback(
    (id: string) => {
      setDisabledPlugins((prev) => {
        const next = prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id];
        return next;
      });
    },
    [setDisabledPlugins],
  );

  const handleSelectModel = useCallback(
    (value: string) => {
      setModel(value);
      setShowModelPopup(false);
    },
    [setModel],
  );

  const toggleUrl = useCallback((url: string) => {
    setSelectedUrls((prev) => (prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url]));
  }, []);

  const handleNewChat = useCallback(() => {
    if (activeTabUrl) tabThreadMapRef.current.delete(activeTabUrl);
    setActiveThreadId(null);
  }, [activeTabUrl]);

  const handleDeleteThread = useCallback(
    async (id: string) => {
      await deleteThread(id);
      setActiveThreadId((prev) => (prev === id ? null : prev));
    },
    [deleteThread],
  );

  const activeThreadTitle = useMemo(() => {
    if (!activeThreadId) return '';
    return threads.find((t) => t.id === activeThreadId)?.title ?? '';
  }, [threads, activeThreadId]);

  const selectedModelEntry = useMemo(() => MODELS_DATA.find((m) => m.value === model), [model]);

  const chatProps = {
    activeThreadId,
    setActiveThreadId,
    threads,
    createThread,
    updateActiveThreadTitle,
    handleDeleteThread: handleDeleteThread,
    handleNewChat,
    activeThreadTitle,
    model,
    user,
    tabs,
    selectedUrls,
    activeTabUrl,
    activeTabTitle,
    activeTabSuggestions,
    suggestionsLoading,
    availablePlugins,
    disabledPlugins,
    onTogglePlugin: togglePlugin,
    signingIn,
    onSignIn: () => void signIn(),
    onSignOut: () => void signOut(),
    onOpenPlugins: () => setActiveView('plugins'),
    pluginsAgentId,
    inputValue,
    setInputValue,
    inputRef,
    attachPopupRef,
    selectedPanelRef,
    modelDropdownRef,
    historyRef,
    showPopup,
    setShowPopup,
    showSelected,
    setShowSelected,
    showModelPopup,
    setShowModelPopup,
    showHistoryPopup,
    setShowHistoryPopup,
    selectedModelLabel: selectedModelEntry?.label ?? '',
    selectedModelIcon: selectedModelEntry?.icon ?? '',
    onSelectModel: handleSelectModel,
    onToggleUrl: toggleUrl,
  };

  if (authLoading) {
    return <ChatSkeleton />;
  }

  if (activeView === 'plugins' && user) {
    return <PluginsScreen onClose={() => setActiveView('chat')} />;
  }

  return (
    <Suspense fallback={<ChatSkeleton />}>
      <ChatScreen {...chatProps} />
    </Suspense>
  );
}

function AgentGate() {
  const { user } = useAuth();
  const pluginsAgentId = getPluginsAgentId(user);

  return (
    <AgentProvider key={pluginsAgentId} agentId={pluginsAgentId}>
      <Shell />
    </AgentProvider>
  );
}

export default function App() {
  return (
    <Suspense fallback={null}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AgentGate />
        </AuthProvider>
      </QueryClientProvider>
    </Suspense>
  );
}
