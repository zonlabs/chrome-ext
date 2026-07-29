import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useAgent } from 'agents/react';
import { useAgentChat } from '@cloudflare/ai-chat/react';
import { CircleX, X } from 'lucide-react';

import { ChatHeader } from './ChatHeader';
import { ChatPluginBar } from '../../plugins/components/ChatPluginBar';
import { WelcomeScreen } from './WelcomeScreen';
import { MessageItem } from './MessageItem';
import { ChatInput } from './ChatInput';
import { LoadingIndicator } from './LoadingIndicator';
import { createClientTools, captureScreenshot, getActiveTabPageContext } from '../lib/clientTools';
import { WORKER_URL, MODELS_DATA } from '../../../../shared/constants';
import { ChatViewProps } from '../../../../shared/types';

/** Chat panel ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â renders the header, message list, welcome/loading states, input bar, and plugin controls. */
type InitialMessageRequest = {
  text: string;
  context: { pageContext: { url: string; title: string; text: string } | null; screenshot: string | null };
};

function ActiveThreadChatView(props: ChatViewProps & { initialRequest?: InitialMessageRequest; onInitialMessageSent?: () => void }) {
  const {
    activeThreadId,
    initialRequest,
    onInitialMessageSent,
    activeThreadTitle,
    updateActiveThreadTitle,
    handleNewChat: _handleThreadNewChat,
    handleDeleteThread,

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
  } = props;


  /** Stringified key of enabled plugins to prevent array reference instability. */
  const enabledPluginsString = useMemo(() => {
    return availablePlugins
      .filter((p: any) => !disabledPlugins.includes(p.id) && (!p.state || p.state === 'ready'))
      .map((p: any) => p.id)
      .sort()
      .join(',');
  }, [availablePlugins, disabledPlugins]);

  /** IDs of plugins that are both available and not disabled by the user. */
  const enabledPluginIds = useMemo(() => {
    return enabledPluginsString ? enabledPluginsString.split(',') : [];
  }, [enabledPluginsString]);


  /** Memoized agent configuration object ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ensures useAgent returns a stable connection instance across renders. */
  const agentOptions = useMemo(() => ({
    agent: 'McpAgent',
    name: pluginsAgentId,
    sub: [{ agent: 'ChatAgent', name: activeThreadId! }],
    host: WORKER_URL,
  }), [pluginsAgentId, activeThreadId]);

  /** Agent connection for the current active thread. */
  const agent = useAgent(agentOptions);

  /** Stable ref wrapping getSelectedTabs so client tools always read the latest tabs without re-creating. */
  const getSelectedTabsRef = useRef<() => { url: string; title: string }[]>(() => []);

  getSelectedTabsRef.current = () => {
    return tabs
      .filter((t: any) => selectedUrls.includes(t.url))
      .map((t: any) => ({ url: t.url, title: t.title || '' }));
  };

  /** Client-side tool definitions (e.g. getSelectedTabs) passed to the chat agent. */
  const clientTools = useMemo(() => {
    return createClientTools({
      getSelectedTabs: () => getSelectedTabsRef.current()
    });
  }, []);

  /** Execute a client-side tool call triggered by the agent and stream the output back. */
  const handleToolCall = useCallback(async ({ toolCall, addToolOutput }: {
    toolCall: { toolCallId: string; toolName: string; input: unknown };
    addToolOutput: (options: { toolCallId: string; output: unknown }) => void;
  }) => {
    const tool = clientTools[toolCall.toolName];
    if (!tool?.execute) {
      // Server-side tool (e.g. codemode) ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â executed on worker, ignore on client
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
  }, [clientTools]);

  /** Holds pending page context + screenshot for the next sendMessage call. Cleared by prepareSendMessagesRequest. */
  const pendingContextRef = useRef<{ pageContext: { url: string; title: string; text: string } | null; screenshot: string | null } | null>(null);

  /** Prevents React external-store notifications from re-entering the one-time first-message handoff. */
  const consumedInitialRequestRef = useRef<InitialMessageRequest | null>(null);

  /** Attach pending screen context to the request body so it goes server-side without appearing in the UI. */
  const prepareSendMessagesRequest = useCallback(async () => {
    const ctx = pendingContextRef.current;
    pendingContextRef.current = null;
    if (!ctx?.pageContext && !ctx?.screenshot) return {};
    return { body: { pageContext: ctx.pageContext, screenshot: ctx.screenshot } };
  }, []);

  /** Memoized request body for useAgentChat. */
  const chatBody = useMemo(() => ({
    model,
    pluginsAgentId,
    userId: user?.id || null,
    enabledPlugins: enabledPluginIds
  }), [model, pluginsAgentId, user?.id, enabledPluginsString]);

  /** Chat state: message list, send/stop helpers, tool approval, and streaming status from the agent. */
  const { messages, sendMessage, addToolApprovalResponse, status, stop, setMessages, error: chatError } = useAgentChat({
    agent,
    body: chatBody,
    onToolCall: handleToolCall,
    tools: clientTools,
    prepareSendMessagesRequest,
    resume: false,
    experimental_throttle: 50,
  });

  useEffect(() => {
    if (!initialRequest || consumedInitialRequestRef.current === initialRequest) return;

    consumedInitialRequestRef.current = initialRequest;
    pendingContextRef.current = initialRequest.context;
    onInitialMessageSent?.();
    sendMessage({ text: initialRequest.text });
  }, [initialRequest, onInitialMessageSent, sendMessage]);

  /** Dismissible error toast message, or null when hidden. */
  const [toastError, setToastError] = useState<string | null>(null);

  /** Listen for broadcasted chat:title events from the agent backend to update the thread title. */
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'chat:title' && data.title) {
          updateActiveThreadTitle(data.title);
        }
      } catch { }
    }
    agent.addEventListener('message', handleMessage);
    return () => agent.removeEventListener('message', handleMessage);
  }, [agent, updateActiveThreadTitle]);

  /** Show a dismissible error toast for 6 seconds when a chat error occurs. */
  useEffect(() => {
    if (chatError) {
      setToastError(chatError instanceof Error ? chatError.message : String(chatError));
      const timer = setTimeout(() => {
        setToastError(null);
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [chatError]);

  /** Dismiss the error toast manually. */
  const handleDismissToast = useCallback(() => {
    setToastError(null);
  }, []);

  /** Whether the side panel is currently opened as a detached popout window. */
  const popoutMode = new URLSearchParams(window.location.search).has('popout');

  /** Toggle between the sidebar and popout window modes. */
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
        const url = chrome.runtime.getURL(`ui/index.html?popout=true&tabId=${tabId}`);
        window.open(url, 'Obot', 'width=450,height=600,menubar=no,toolbar=no,location=no,status=no');
        window.close();
      });
    }
  }, [popoutMode]);

  /** Text pending to send as an edited message (triggers a new message on next render). */
  const [pendingEdit, setPendingEdit] = useState<{ text: string } | null>(null);

  /** Send the pending edited message, capturing context into pendingContextRef so it reaches the server without showing in UI. */
  useEffect(() => {
    if (!pendingEdit) return;
    (async () => {
      try {
        const ctx = await getActiveTabPageContext();
        let screenshot: string | null = null;
        const modelEntry = MODELS_DATA.find(m => m.value === model);
        if (modelEntry?.hasVision) {
          screenshot = await captureScreenshot();
        }
        pendingContextRef.current = { pageContext: ctx, screenshot };
      } catch {
        pendingContextRef.current = null;
      }
      sendMessage({ text: pendingEdit.text });
      setPendingEdit(null);
    })();
  }, [pendingEdit, sendMessage, model]);

  /** Name of the currently active (calling/streaming) tool, or null. */
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

  /** Index of the latest assistant message (for targeting regenerate/edit actions). */
  const latestAssistantIdx = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') {
        return i;
      }
    }
    return -1;
  }, [messages]);

  /** Ref for the invisible scroll anchor at the bottom of the message list. */
  const messagesEndRef = useRef<HTMLDivElement>(null);

  /** Start a new chat thread (no-op if the current thread is already empty). */
  const handleNewChat = useCallback(() => {
    if (messages.length === 0) return;
    _handleThreadNewChat();
  }, [messages, _handleThreadNewChat]);

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

  /** Submit the current input value ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â screen context captured into pendingContextRef (sent via body, hidden from UI). */
  const handleSubmit = useCallback(async () => {
    if (!inputValue.trim()) return;
    setIsAborted(false);


    try {
      const ctx = await getActiveTabPageContext();
      let screenshot: string | null = null;
      const modelEntry = MODELS_DATA.find(m => m.value === model);
      if (modelEntry?.hasVision) {
        screenshot = await captureScreenshot();
      }
      pendingContextRef.current = { pageContext: ctx, screenshot };
    } catch {
      pendingContextRef.current = null;
    }

    sendMessage({ text: inputValue });
    setInputValue('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
  }, [inputValue, model, sendMessage, setInputValue, inputRef]);

  /** Submit on Enter (without Shift), allowing Shift+Enter for newlines. */
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  /** Populate the input with a suggested prompt text and focus the textarea. */
  const handleSuggestionClick = useCallback((text: string) => {
    setInputValue(text);
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${inputRef.current.scrollHeight}px`;
    }
  }, [setInputValue, inputRef]);

  /** Truncate messages up to the edited one and schedule the replacement text to send. */
  const handleEditMessage = useCallback((messageId: string, newText: string) => {
    const messageIndex = messages.findIndex(message => message.id === messageId);
    if (messageIndex === -1) return;

    setMessages(messages.slice(0, messageIndex));
    setPendingEdit({ text: newText });
  }, [messages, setMessages]);

  /** Regenerate the last assistant response by re-sending the preceding user message. */
  const handleRegenerateMessage = useCallback((messageId: string) => {
    const assistantIndex = messages.findIndex(message => message.id === messageId);
    const userMessageIndex = assistantIndex - 1;
    if (assistantIndex === -1 || userMessageIndex < 0) return;

    const userMessage = messages[userMessageIndex];
    if (userMessage.role !== 'user') return;

    const userText = ((userMessage.parts.find((part: any) => part.type === 'text') as { text?: string } | undefined)?.text) || '';
    if (!userText) return;

    setMessages(messages.slice(0, userMessageIndex));
    setPendingEdit({ text: userText });
  }, [messages, setMessages]);
  /** Scroll the message list to the bottom. */
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);
  /** Auto-scroll to bottom whenever messages change. */
  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  /** Whether the agent is currently streaming a response or waiting on a tool call. */
  const isStreaming = !isAborted && (status === 'streaming' || status === 'submitted' || !!activeTool);

  return (
    <>
      <ChatHeader title={activeThreadTitle} activeThreadId={activeThreadId} threads={threads} setActiveThreadId={setActiveThreadId} showHistoryPopup={showHistoryPopup} setShowHistoryPopup={setShowHistoryPopup} historyRef={historyRef} onNewChat={handleNewChat} onDeleteThread={handleDeleteThread} user={user} onSignIn={onSignIn} signingIn={signingIn} onSignOut={onSignOut} onOpenPlugins={onOpenPlugins} />
      <div id="messages">
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



        {(isStreaming || activeTool) && (
          <LoadingIndicator />
        )}

        <div ref={messagesEndRef} />
      </div>

      <ChatPluginBar user={user} availablePlugins={availablePlugins} disabledPlugins={disabledPlugins} onTogglePlugin={onTogglePlugin} />

      <ChatInput
        inputValue={inputValue}
        setInputValue={setInputValue}
        inputRef={inputRef}
        isStreaming={isStreaming}
        onSubmit={handleSubmit}
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

      {toastError && (
        <div className="chat-error-toast">
          <div className="chat-error-toast-icon">
            <CircleX size={16} />
          </div>
          <div className="chat-error-toast-content">
            <div className="chat-error-toast-title">Error</div>
            <div className="chat-error-toast-message">{toastError}</div>
          </div>
          <button className="chat-error-toast-close" onClick={handleDismissToast} aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      )}
    </>
  );
}


function EmptyThreadChatView(props: ChatViewProps & { isCreating: boolean; onSubmit: () => void }) {
  return (
    <>
      <ChatHeader activeThreadId={null} threads={props.threads} setActiveThreadId={props.setActiveThreadId} showHistoryPopup={props.showHistoryPopup} setShowHistoryPopup={props.setShowHistoryPopup} historyRef={props.historyRef} onNewChat={props.handleNewChat} onDeleteThread={props.handleDeleteThread} user={props.user} onSignIn={props.onSignIn} signingIn={props.signingIn} onSignOut={props.onSignOut} onOpenPlugins={props.onOpenPlugins} />      <div id="messages"><WelcomeScreen user={props.user} onSuggestionClick={props.setInputValue} onSignIn={props.onSignIn} signingIn={props.signingIn} activeTabUrl={props.activeTabUrl} activeTabTitle={props.activeTabTitle} llmSuggestions={props.activeTabSuggestions} suggestionsLoading={props.suggestionsLoading} /></div>
      <ChatPluginBar user={props.user} availablePlugins={props.availablePlugins} disabledPlugins={props.disabledPlugins} onTogglePlugin={props.onTogglePlugin} />
      <ChatInput inputValue={props.inputValue} setInputValue={props.setInputValue} inputRef={props.inputRef} isStreaming={props.isCreating} onSubmit={props.onSubmit} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); props.onSubmit(); } }} showPopup={props.showPopup} setShowPopup={props.setShowPopup} attachPopupRef={props.attachPopupRef} tabs={props.tabs} selectedUrls={props.selectedUrls} activeTabUrl={props.activeTabUrl} onToggleUrl={props.onToggleUrl} showSelected={props.showSelected} setShowSelected={props.setShowSelected} selectedPanelRef={props.selectedPanelRef} showModelPopup={props.showModelPopup} setShowModelPopup={props.setShowModelPopup} modelDropdownRef={props.modelDropdownRef} model={props.model} modelsData={MODELS_DATA} selectedModelLabel={props.selectedModelLabel} selectedModelIcon={props.selectedModelIcon} onSelectModel={props.onSelectModel} onStop={() => {}} />
    </>
  );
}
/** Chat shell: no durable-object connection exists until the worker allocates an ID. */
export function ChatView(props: ChatViewProps) {
  const [pendingInitialMessage, setPendingInitialMessage] = useState<InitialMessageRequest | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const creatingThreadRef = useRef(false);
  const handleInitialMessageSent = useCallback(() => setPendingInitialMessage(null), []);

  const createAndSend = async () => {
    const text = props.inputValue.trim();
    if (!text) return;
    if (creatingThreadRef.current) return;
    creatingThreadRef.current = true;
    setIsCreating(true);
    try {
      let context: InitialMessageRequest['context'] = { pageContext: null, screenshot: null };
      try {
        const pageContext = await getActiveTabPageContext();
        const modelEntry = MODELS_DATA.find(entry => entry.value === props.model);
        context = {
          pageContext,
          screenshot: modelEntry?.hasVision ? await captureScreenshot() : null,
        };
      } catch {
        // Context capture is best-effort; sending the user's prompt must still work.
      }
      await props.createThread();
      setPendingInitialMessage({ text, context });
      props.setInputValue('');
    } finally {
      creatingThreadRef.current = false;
      setIsCreating(false);
    }
  };

  if (!props.activeThreadId) {
    return <EmptyThreadChatView {...props} isCreating={isCreating} onSubmit={() => void createAndSend()} />;
  }

  return <ActiveThreadChatView key={props.activeThreadId} {...props} initialRequest={pendingInitialMessage ?? undefined} onInitialMessageSent={handleInitialMessageSent} />;
}
