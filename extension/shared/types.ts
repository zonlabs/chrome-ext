import React from 'react';

/** Authenticated premium user info. */
export interface PremiumUser {
  id: string;
  email: string;
  plan: 'free' | 'premium';
}

/** Represents a browser tab. */
export interface Tab {
  url: string;
  title?: string;
  active?: boolean;
  tabId?: number;
}

/** Difficulty/capability tier label for a model. */
export type ModelTier = 'basic' | 'intermediate' | 'advanced';

/** A selectable model's display info. */
export interface ModelEntry {
  value: string;
  label: string;
  desc: string;
  icon: string;
  tier: ModelTier;
  hasVision?: boolean;
}

/** Context providing helper methods for client-side tools. */
export interface ClientToolsContext {
  getSelectedTabs: () => { url: string; title: string }[];
}

/** A file attachment part for chat messages (e.g. image screenshot). Matches the AI SDK's FileUIPart shape. */
export type FileUIPart = {
  type: 'file';
  mediaType: string;
  filename?: string;
  url: string;
  providerMetadata?: Record<string, unknown>;
};

/** All props passed to the ChatView component. */
export interface ChatViewProps {
  activeThreadId: string;
  activeThreadTitle: string;
  updateActiveThreadTitle: (title: string) => void;
  handleNewChat: () => void;
  handleDeleteThread: (id: string) => void;
  ensureThreadEntry: () => void;
  threads: { id: string; title: string; createdAt: number }[];
  setActiveThreadId: (id: string) => void;
  model: string;
  user: any;
  tabs: any[];
  selectedUrls: string[];
  activeTabUrl: string;
  activeTabTitle: string;
  activeTabSuggestions: string[];
  suggestionsLoading: boolean;
  signingIn: boolean;
  showPopup: boolean;
  setShowPopup: (v: boolean) => void;
  showSelected: boolean;
  setShowSelected: (v: boolean) => void;
  selectedPanelRef: React.RefObject<HTMLDivElement | null>;
  showModelPopup: boolean;
  setShowModelPopup: (v: boolean) => void;
  showHistoryPopup: boolean;
  setShowHistoryPopup: (v: boolean) => void;
  inputValue: string;
  setInputValue: (v: string) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  attachPopupRef: React.RefObject<HTMLDivElement | null>;
  modelDropdownRef: React.RefObject<HTMLDivElement | null>;
  historyRef: React.RefObject<HTMLDivElement | null>;
  selectedModelLabel: string;
  selectedModelIcon: string;
  onToggleUrl: (url: string) => void;
  onSelectModel: (val: string) => void;
  onSignIn: () => void;
  onSignOut: () => void;
  onOpenPlugins: () => void;
  pluginsAgentId?: string;
  availablePlugins?: any[];
  disabledPlugins?: string[];
  onTogglePlugin?: (id: string) => void;
}
