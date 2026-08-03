export interface PremiumUser {
  id: string;
  email: string;
  plan: 'free' | 'premium';
}

export interface Tab {
  url: string;
  title?: string;
  active?: boolean;
  tabId?: number;
}

export type ModelTier = 'basic' | 'intermediate' | 'advanced';

export interface ModelEntry {
  value: string;
  label: string;
  desc: string;
  icon: string;
  tier: ModelTier;
  hasVision?: boolean;
}

export interface ClientToolsContext {
  getSelectedTabs: () => { url: string; title: string }[];
}
