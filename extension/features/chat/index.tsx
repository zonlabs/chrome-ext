import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useAgent } from 'agents/react';
import { useAgentChat } from '@cloudflare/ai-chat/react';


import { ChatHeader } from './components/ChatHeader';
import { ChatPluginBar } from './components/ChatPluginBar';
import { WelcomeScreen } from './components/WelcomeScreen';
import { MessageItem } from './components/MessageItem';
import { ChatInput } from './components/ChatInput';
import { LoadingIndicator } from './components/LoadingIndicator';
import { createClientTools, captureScreenshot } from './lib/clientTools';
import { getActiveTabPageContext } from '../../lib/page-context-client';
import { sendMessage } from '../../lib/messages';
import { browser } from 'wxt/browser';
import { WORKER_URL, MODELS_DATA } from '../../lib/constants';
import type { ChatThread } from '../../lib/api/threads';
import type { Tab, ModelEntry } from '../../lib/types';

interface Plugin {
  id: string;
  name: string;
  url: string;
  state?: string;
}

export interface ChatScreenProps {
  activeThreadId: string | null;
  setActiveThreadId: (id: string | null) => void;
  threads: ChatThread[];
  createThread: () => Promise<ChatThread>;
  updateActiveThreadTitle: (args: { id: string; title: string }) => Promise<ChatThread>;
  handleDeleteThread: (id: string) => Promise<void>;
  handleNewChat: () => void;
  activeThreadTitle: string;
  model: string;
  user: any;
  tabs: Tab[];
  selectedUrls: string[];
  activeTabUrl: string;
  activeTabTitle: string;
  activeTabSuggestions: string[];
  suggestionsLoading: boolean;
  availablePlugins: Plugin[];
  disabledPlugins: string[];
  onTogglePlugin: (id: string) => void;
  signingIn: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  onOpenPlugins: () => void;
  pluginsAgentId: string;
  inputValue: string;
  setInputValue: (value: string) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  attachPopupRef: React.RefObject<HTMLDivElement | null>;
  selectedPanelRef: React.RefObject<HTMLDivElement | null>;
  modelDropdownRef: React.RefObject<HTMLDivElement | null>;
  historyRef: React.RefObject<HTMLDivElement | null>;
  showPopup: boolean;
  setShowPopup: (value: boolean) => void;
  showSelected: boolean;
  setShowSelected: (value: boolean) => void;
  showModelPopup: boolean;
  setShowModelPopup: (value: boolean) => void;
  showHistoryPopup: boolean;
  setShowHistoryPopup: (value: boolean) => void;
  selectedModelLabel: string;
  selectedModelIcon: string;
  onSelectModel: (value: string) => void;
  onToggleUrl: (url: string) => void;
}

type InitialMessageRequest = {
  text: string;
  context: { pageContext: { url: string; title: string; text: string } | null; screenshot: string | null };
};

function ActiveThreadChatView(
  props: ChatScreenProps & { initialRequest?: InitialMessageRequest; onInitialMessageSent?: () => void },
) {
  const {
    activeThreadId,
    initialRequest,
    onInitialMessageSent,
    activeThreadTitle,
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
    signingIn,
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
    updateActiveThreadTitle,
    handleDeleteThread,
  } = props;

  const enabledPluginsString = useMemo(() => {
    return availablePlugins
      .filter((p) => !disabledPlugins.includes(p.id) && (!p.state || p.state === 'ready'))
      .map((p) => p.id)
      .sort()
      .join(',');
  }, [availablePlugins, disabledPlugins]);

  const enabledPluginIds = useMemo(() => {
    return enabledPluginsString ? enabledPluginsString.split(',') : [];
  }, [enabledPluginsString]);

  const asyncQuery = useCallback(async () => {
    const snapshot = await sendMessage({ type: 'auth:snapshot' });
    const token = 'jwt' in snapshot ? (snapshot.jwt ?? '') : '';
    return { token };
  }, []);

  const agentOptions = useMemo(
    () => ({
      agent: 'UserAgent',
      name: pluginsAgentId,
      sub: [{ agent: 'ChatAgent', name: activeThreadId! }],
      host: WORKER_URL,
      query: asyncQuery,
    }),
    [pluginsAgentId, activeThreadId, asyncQuery],
  );

  const agent = useAgent(agentOptions);

  const getSelectedTabsRef = useRef<() => { url: string; title: string }[]>(() => []);

  getSelectedTabsRef.current = () => {
    return tabs
      .filter((t) => selectedUrls.includes(t.url))
      .map((t) => ({ url: t.url, title: t.title || '' }));
  };

  const clientTools = useMemo(() => {
    return createClientTools({
      getSelectedTabs: () => getSelectedTabsRef.current(),
    });
  }, []);

  const handleToolCall = useCallback(
    async ({ toolCall, addToolOutput }: { toolCall: { toolCallId: string; toolName: string; input: unknown }; addToolOutput: (options: { toolCallId: string; output: unknown }) => void }) => {
      const tool = clientTools[toolCall.toolName];
      if (!tool?.execute) {
        return;
      }

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
    },
    [clientTools],
  );

  const pendingContextRef = useRef<{ pageContext: { url: string; title: string; text: string } | null; screenshot: string | null } | null>(null);

  const consumedInitialRequestRef = useRef<InitialMessageRequest | null>(null);

  const prepareSendMessagesRequest = useCallback(async () => {
    const ctx = pendingContextRef.current;
    pendingContextRef.current = null;
    if (!ctx?.pageContext && !ctx?.screenshot) return {};
    return { body: { pageContext: ctx.pageContext, screenshot: ctx.screenshot } };
  }, []);

  const chatBody = useMemo(
    () => ({
      model,
      enabledPlugins: enabledPluginIds,
    }),
    [model, enabledPluginsString],
  );

  const {
    messages,
    sendMessage: sendChatMessage,
    addToolApprovalResponse,
    status,
    stop,
    setMessages,
    error: chatError,
    connectionError,
  } = useAgentChat({
    agent,
    body: chatBody,
    onToolCall: handleToolCall,
    tools: clientTools,
    prepareSendMessagesRequest,
    resume: false,
    experimental_throttle: 50,
  });

  const rawErrorMessage = connectionError?.message || (chatError instanceof Error ? chatError.message : (typeof chatError === 'string' ? chatError : null));
  const displayError = (chatError || connectionError)
    ? (rawErrorMessage?.trim() || 'An error occurred while processing your request. Please try again.')
    : null;

  useEffect(() => {
    if (!initialRequest || consumedInitialRequestRef.current === initialRequest) return;

    consumedInitialRequestRef.current = initialRequest;
    pendingContextRef.current = initialRequest.context;
    onInitialMessageSent?.();
    sendChatMessage({ text: initialRequest.text });
  }, [initialRequest, onInitialMessageSent, sendChatMessage]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'chat:title' && data.title && activeThreadId) {
          void updateActiveThreadTitle({ id: activeThreadId, title: data.title });
        }
      } catch {}
    }
    agent.addEventListener('message', handleMessage);
    return () => agent.removeEventListener('message', handleMessage);
  }, [agent, updateActiveThreadTitle, activeThreadId]);

  const popoutMode = new URLSearchParams(window.location.search).has('popout');

  const handleTogglePopout = useCallback(() => {
    if (popoutMode) {
      const params = new URLSearchParams(window.location.search);
      const tabId = parseInt(params.get('tabId') || '0', 10);
      if (tabId) {
        void sendMessage({ type: 'sidePanel:open', tabId }).then(() => {
          window.close();
        });
      } else {
        window.close();
      }
    } else {
      void browser.tabs.query({ active: true, currentWindow: true }).then((tabsList) => {
        const tabId = tabsList[0]?.id || 0;
        const url = browser.runtime.getURL(`/sidepanel.html?popout=true&tabId=${tabId}`);
        window.open(url, 'Obot', 'width=450,height=600,menubar=no,toolbar=no,location=no,status=no');
        window.close();
      });
    }
  }, [popoutMode]);

  const [pendingEdit, setPendingEdit] = useState<{ text: string } | null>(null);

  useEffect(() => {
    if (!pendingEdit) return;
    (async () => {
      try {
        const ctx = await getActiveTabPageContext();
        let screenshot: string | null = null;
        const modelEntry = MODELS_DATA.find((m) => m.value === model);
        if (modelEntry?.hasVision) {
          screenshot = await captureScreenshot();
        }
        pendingContextRef.current = { pageContext: ctx, screenshot };
      } catch {
        pendingContextRef.current = null;
      }
      sendChatMessage({ text: pendingEdit.text });
      setPendingEdit(null);
    })();
  }, [pendingEdit, sendChatMessage, model]);

  const activeTool = useMemo(() => {
    for (const msg of messages) {
      for (const part of msg.parts) {
        const type = (part as any).type || '';
        const state = (part as any).state;
        if (type.startsWith('tool-') && (state === 'call' || state === 'input-streaming' || state === 'input-available')) {
          return (part as any).toolName || type.slice(5);
        }
      }
    }
    return null;
  }, [messages]);

  const latestAssistantIdx = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') {
        return i;
      }
    }
    return -1;
  }, [messages]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleNewChat = useCallback(() => {
    if (messages.length === 0) return;
    props.handleNewChat();
  }, [messages, props]);

  const [isAborted, setIsAborted] = useState(false);

  const handleStop = useCallback(() => {
    setIsAborted(true);
    stop();
  }, [stop]);

  useEffect(() => {
    if (isAborted && (status === 'ready' || (status as string) === 'idle' || chatError)) {
      setIsAborted(false);
    }
  }, [isAborted, status, chatError]);

  const handleSubmit = useCallback(async () => {
    if (!inputValue.trim()) return;
    setIsAborted(false);

    try {
      const ctx = await getActiveTabPageContext();
      let screenshot: string | null = null;
      const modelEntry = MODELS_DATA.find((m) => m.value === model);
      if (modelEntry?.hasVision) {
        screenshot = await captureScreenshot();
      }
      pendingContextRef.current = { pageContext: ctx, screenshot };
    } catch {
      pendingContextRef.current = null;
    }

    sendChatMessage({ text: inputValue });
    setInputValue('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
  }, [inputValue, model, sendChatMessage, setInputValue, inputRef]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void handleSubmit();
      }
    },
    [handleSubmit],
  );

  const handleSuggestionClick = useCallback(
    (text: string) => {
      setInputValue(text);
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.style.height = 'auto';
        inputRef.current.style.height = `${inputRef.current.scrollHeight}px`;
      }
    },
    [setInputValue, inputRef],
  );

  const handleEditMessage = useCallback(
    (messageId: string, newText: string) => {
      const messageIndex = messages.findIndex((message) => message.id === messageId);
      if (messageIndex === -1) return;

      setMessages(messages.slice(0, messageIndex));
      setPendingEdit({ text: newText });
    },
    [messages, setMessages],
  );

  const handleRegenerateMessage = useCallback(
    (messageId: string) => {
      const assistantIndex = messages.findIndex((message) => message.id === messageId);
      const userMessageIndex = assistantIndex - 1;
      if (assistantIndex === -1 || userMessageIndex < 0) return;

      const userMessage = messages[userMessageIndex];
      if (userMessage.role !== 'user') return;

      const userText = ((userMessage.parts.find((part: any) => part.type === 'text') as { text?: string } | undefined)?.text) || '';
      if (!userText) return;

      setMessages(messages.slice(0, userMessageIndex));
      setPendingEdit({ text: userText });
    },
    [messages, setMessages],
  );

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const isStreaming = !isAborted && (status === 'streaming' || status === 'submitted' || !!activeTool);

  return (
    <div className="flex flex-col flex-1 h-full min-h-0 bg-[var(--bg-primary,#131314)] text-[var(--text-primary,#e3e3e3)] overflow-hidden">
      <div className="flex flex-col flex-1 h-full min-h-0 w-full max-w-3xl mx-auto">
        <ChatHeader
          title={activeThreadTitle}
          activeThreadId={activeThreadId}
          threads={threads}
          setActiveThreadId={setActiveThreadId}
          showHistoryPopup={showHistoryPopup}
          setShowHistoryPopup={setShowHistoryPopup}
          historyRef={historyRef}
          onNewChat={handleNewChat}
          onDeleteThread={handleDeleteThread}
          user={user}
          onSignIn={onSignIn}
          signingIn={signingIn}
          onSignOut={onSignOut}
          onOpenPlugins={onOpenPlugins}
        />
        <div id="messages" className="flex flex-1 min-h-0 flex-col gap-3.5 overflow-y-auto px-4 py-2">
          {messages.length === 0 ? (
            <WelcomeScreen
              user={user}
              onSuggestionClick={handleSuggestionClick}
              onSignIn={onSignIn}
              signingIn={signingIn}
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

          {(isStreaming || activeTool) && <LoadingIndicator />}

          {displayError && (
            <div className="self-start w-full leading-relaxed flex flex-col">
              <div className="message-content text-error-text">
                {displayError}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <ChatPluginBar user={user} availablePlugins={availablePlugins} disabledPlugins={disabledPlugins} onTogglePlugin={onTogglePlugin} />

        <ChatInput
          inputValue={inputValue}
          setInputValue={setInputValue}
          inputRef={inputRef}
          isStreaming={isStreaming}
          onSubmit={() => void handleSubmit()}
          onKeyDown={handleKeyDown}
          onStop={handleStop}
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
      </div>
    </div>
  );
}

function EmptyThreadChatView(props: ChatScreenProps & { isCreating: boolean; createError: string | null; onSubmit: () => void }) {
  return (
    <div className="flex flex-col flex-1 h-full min-h-0 bg-[var(--bg-primary,#131314)] text-[var(--text-primary,#e3e3e3)] overflow-hidden">
      <div className="flex flex-col flex-1 h-full min-h-0 w-full max-w-3xl mx-auto">
        <ChatHeader
          activeThreadId={null}
          threads={props.threads}
          setActiveThreadId={props.setActiveThreadId}
          showHistoryPopup={props.showHistoryPopup}
          setShowHistoryPopup={props.setShowHistoryPopup}
          historyRef={props.historyRef}
          onNewChat={props.handleNewChat}
          onDeleteThread={props.handleDeleteThread}
          user={props.user}
          onSignIn={props.onSignIn}
          signingIn={props.signingIn}
          onSignOut={props.onSignOut}
          onOpenPlugins={props.onOpenPlugins}
        />
        <div id="messages" className="flex flex-1 min-h-0 flex-col gap-3.5 overflow-y-auto px-4 py-2">
          <WelcomeScreen
            user={props.user}
            onSuggestionClick={props.setInputValue}
            onSignIn={props.onSignIn}
            signingIn={props.signingIn}
            activeTabUrl={props.activeTabUrl}
            activeTabTitle={props.activeTabTitle}
            llmSuggestions={props.activeTabSuggestions}
            suggestionsLoading={props.suggestionsLoading}
          />
        </div>
        <ChatPluginBar user={props.user} availablePlugins={props.availablePlugins} disabledPlugins={props.disabledPlugins} onTogglePlugin={props.onTogglePlugin} />
        {props.createError && (
          <div className="px-4 pb-2">
            <div className="text-sm leading-relaxed text-error-text">{props.createError}</div>
          </div>
        )}
        <ChatInput
          inputValue={props.inputValue}
          setInputValue={props.setInputValue}
          inputRef={props.inputRef}
          isStreaming={props.isCreating}
          onSubmit={props.onSubmit}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              props.onSubmit();
            }
          }}
          showPopup={props.showPopup}
          setShowPopup={props.setShowPopup}
          attachPopupRef={props.attachPopupRef}
          tabs={props.tabs}
          selectedUrls={props.selectedUrls}
          activeTabUrl={props.activeTabUrl}
          onToggleUrl={props.onToggleUrl}
          showSelected={props.showSelected}
          setShowSelected={props.setShowSelected}
          selectedPanelRef={props.selectedPanelRef}
          showModelPopup={props.showModelPopup}
          setShowModelPopup={props.setShowModelPopup}
          modelDropdownRef={props.modelDropdownRef}
          model={props.model}
          modelsData={MODELS_DATA}
          selectedModelLabel={props.selectedModelLabel}
          selectedModelIcon={props.selectedModelIcon}
          onSelectModel={props.onSelectModel}
          onStop={() => {}}
        />
      </div>
    </div>
  );
}

export function ChatScreen(props: ChatScreenProps) {
  const [pendingInitialMessage, setPendingInitialMessage] = useState<InitialMessageRequest | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const creatingThreadRef = useRef(false);
  const handleInitialMessageSent = useCallback(() => setPendingInitialMessage(null), []);

  const createAndSend = async () => {
    const text = props.inputValue.trim();
    if (!text) return;
    if (creatingThreadRef.current) return;
    creatingThreadRef.current = true;
    setIsCreating(true);
    setCreateError(null);
    try {
      let context: InitialMessageRequest['context'] = { pageContext: null, screenshot: null };
      try {
        const pageContext = await getActiveTabPageContext();
        const modelEntry = MODELS_DATA.find((entry) => entry.value === props.model);
        context = {
          pageContext,
          screenshot: modelEntry?.hasVision ? await captureScreenshot() : null,
        };
      } catch {}
      try {
        const thread = await props.createThread();
        props.setActiveThreadId(thread.id);
        setPendingInitialMessage({ text, context });
        props.setInputValue('');
      } catch (error) {
        const detail = error instanceof Error && error.message.trim() ? error.message : 'Please sign in and try again.';
        setCreateError(`Couldn't start a chat. ${detail}`);
      }
    } finally {
      creatingThreadRef.current = false;
      setIsCreating(false);
    }
  };

  if (!props.activeThreadId) {
    return <EmptyThreadChatView {...props} isCreating={isCreating} createError={createError} onSubmit={() => void createAndSend()} />;
  }

  return <ActiveThreadChatView key={props.activeThreadId} {...props} initialRequest={pendingInitialMessage ?? undefined} onInitialMessageSent={handleInitialMessageSent} />;
}
