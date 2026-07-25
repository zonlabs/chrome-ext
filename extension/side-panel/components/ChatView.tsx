import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useAgent } from 'agents/react';
import { useAgentChat } from '@cloudflare/ai-chat/react';
import { SquarePen, MoreVertical, PictureInPicture2, CircleX, Settings2, Check, X } from 'lucide-react';

import { HistoryPopup } from './HistoryPopup';
import { WelcomeScreen } from './WelcomeScreen';
import { MessageItem } from './MessageItem';
import { ChatInput } from './ChatInput';
import { LoadingIndicator } from './LoadingIndicator';
import { createClientTools } from '../utils/clientTools';
import { WORKER_URL, MODELS_DATA } from '../../shared/constants';
import { ChatViewProps } from '../../shared/types';

/** Chat panel — renders the header, message list, welcome/loading states, input bar, and plugin controls. */
export function ChatView(props: ChatViewProps) {
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

  /** Whether the plugins selector popup is visible. */
  const [showPluginsPopup, setShowPluginsPopup] = useState(false);
  /** Ref for the plugins selector popup (used for outside-click detection). */
  const pluginsPopupRef = useRef<HTMLDivElement>(null);

  /** IDs of plugins that are both available and not disabled by the user. */
  const enabledPluginIds = useMemo(() => {
    return availablePlugins
      .map((p: any) => p.id)
      .filter((id: string) => !disabledPlugins.includes(id));
  }, [availablePlugins, disabledPlugins]);

  /** Close the plugins popup when clicking outside it or its trigger button. */
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

  /** Memoized agent configuration object — ensures useAgent returns a stable connection instance across renders. */
  const agentOptions = useMemo(() => ({
    agent: 'ChatAgent',
    name: activeThreadId,
    host: WORKER_URL,
  }), [activeThreadId]);

  /** Raw agent connection for the current active thread. */
  const rawAgent = useAgent(agentOptions);

  /** Stable ref holding the latest agent instance for the Proxy wrapper. */
  const agentRef = useRef(rawAgent);
  agentRef.current = rawAgent;

  /** Stable agent proxy wrapper that maintains referential identity across socket reconnects for the same activeThreadId. */
  const agent = useMemo(() => {
    return new Proxy({} as typeof rawAgent, {
      get(_target, prop) {
        const value = (agentRef.current as any)[prop];
        if (typeof value === 'function') {
          return value.bind(agentRef.current);
        }
        return value;
      }
    });
  }, [activeThreadId]);

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

  /** Tool schemas without execute method to prevent double-execution between useAgentChat's auto-resolver and onToolCall handler. */
  const clientToolSchemas = useMemo(() => {
    const schemas: Record<string, { description: string; parameters: any }> = {};
    for (const [name, tool] of Object.entries(clientTools)) {
      schemas[name] = {
        description: tool.description || '',
        parameters: tool.parameters,
      };
    }
    return schemas;
  }, [clientTools]);

  /** Execute a client-side tool call triggered by the agent and stream the output back. */
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

  const enabledPluginKey = useMemo(() => enabledPluginIds.join(','), [enabledPluginIds]);

  /** Memoized request body for useAgentChat. */
  const chatBody = useMemo(() => ({
    model,
    pluginsAgentId,
    userId: user?.id || null,
    enabledPlugins: enabledPluginIds
  }), [model, pluginsAgentId, user?.id, enabledPluginKey]);

  /** Chat state: message list, send/stop helpers, tool approval, and streaming status from the agent. */
  const { messages, sendMessage, addToolApprovalResponse, status, clearHistory, stop, setMessages, error: chatError } = useAgentChat({
    agent,
    body: chatBody,
    onToolCall: handleToolCall,
    tools: clientToolSchemas,
  });

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

  /** Toggle between side-panel and popout window modes. */
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

  /** Text pending to send as an edited message (triggers a new message on next render). */
  const [pendingEdit, setPendingEdit] = useState<{ text: string } | null>(null);

  /** Send the pending edited message as soon as it is set, then clear. */
  useEffect(() => {
    if (pendingEdit) {
      sendMessage({ text: pendingEdit.text });
      setPendingEdit(null);
    }
  }, [pendingEdit, sendMessage]);

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

  /** Submit the current input value as a new message. */
  const handleSubmit = useCallback(() => {
    if (inputValue.trim()) {
      ensureThreadEntry();
      sendMessage({ text: inputValue });
      setInputValue('');
      if (inputRef.current) inputRef.current.style.height = 'auto';
    }
  }, [inputValue, ensureThreadEntry, sendMessage, setInputValue, inputRef]);

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
    setMessages(prev => {
      const idx = prev.findIndex(m => m.id === messageId);
      if (idx === -1) return prev;
      return prev.slice(0, idx);
    });
    setPendingEdit({ text: newText });
  }, [setMessages]);

  /** Regenerate the last assistant response by re-sending the preceding user message. */
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

  /** Scroll the message list to the bottom. */
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);
  /** Auto-scroll to bottom whenever messages change. */
  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  /** Whether the agent is currently streaming a response or waiting on a tool call. */
  const isStreaming = status === 'streaming' || status === 'submitted' || !!activeTool;

  return (
    <>
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
                signingIn={signingIn}
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
