import React, { useMemo, useState, type RefObject } from 'react';
import { Check, Search, ChevronDown } from 'lucide-react';
import { browser, type PublicPath } from 'wxt/browser';
import type { ModelEntry } from '../../../lib/types';

interface ModelSelectorProps {
  showModelPopup: boolean;
  setShowModelPopup: (v: boolean) => void;
  modelDropdownRef: RefObject<HTMLDivElement | null>;
  model: string;
  modelsData: ModelEntry[];
  selectedModelLabel: string;
  selectedModelIcon: string;
  onSelectModel: (val: string) => void;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  showModelPopup,
  setShowModelPopup,
  modelDropdownRef,
  model,
  modelsData,
  selectedModelLabel,
  selectedModelIcon,
  onSelectModel,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const getProviderName = (icon: string) => {
    switch (icon) {
      case 'meta.svg': return 'Meta';
      case 'google.svg': return 'Google';
      case 'qwen.svg': return 'Alibaba Qwen';
      case 'zai.svg': return 'Zhipu AI';
      case 'moonshotai.svg': return 'Moonshot AI';
      case 'openai.svg': return 'OpenAI';
      default: return 'Other';
    }
  };

  const filteredModels = useMemo(() => {
    return modelsData.filter(m =>
      m.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.desc.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [modelsData, searchQuery]);

  const groupedModels = useMemo(() => {
    const groups: Record<string, ModelEntry[]> = {};
    for (const m of filteredModels) {
      const provider = getProviderName(m.icon);
      if (!groups[provider]) {
        groups[provider] = [];
      }
      groups[provider].push(m);
    }
    return groups;
  }, [filteredModels]);

  const selectedModelIconUrl = selectedModelIcon
    ? browser.runtime.getURL(`/icons/models/${selectedModelIcon}` as PublicPath)
    : '';

  return (
    <div className="flex items-center" ref={modelDropdownRef}>
      <button
        className="bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-[18px] text-[var(--text-primary)] text-[13px] font-medium px-2.5 h-7 cursor-pointer outline-none flex items-center gap-2 transition-all duration-200 ease-[cubic-bezier(0.25,0.1,0.25,1)] hover:bg-[var(--bg-hover)] hover:border-[var(--text-muted)]"
        onClick={() => setShowModelPopup(!showModelPopup)}
      >
        {selectedModelIcon && (
          <img
            src={selectedModelIconUrl}
            alt=""
            className="w-4 h-4 rounded-[2px] block"
          />
        )}
        <span className="max-w-[120px] whitespace-nowrap overflow-hidden text-ellipsis">{selectedModelLabel}</span>
        <ChevronDown
          size={14}
          className={`transition-transform duration-200 ease-[cubic-bezier(0.25,0.1,0.25,1)] ${showModelPopup ? 'rotate-180' : ''}`}
        />
      </button>

      {showModelPopup && (
        <div className="absolute bottom-[calc(100%+8px)] left-4 right-4 bg-[rgba(30,31,32,0.85)] backdrop-blur-[16px] border border-[rgba(255,255,255,0.08)] rounded-[14px] shadow-[0_10px_30px_rgba(0,0,0,0.5)] z-[1000] flex flex-col overflow-hidden animate-[popupSlideIn_.2s_cubic-bezier(0.16,1,0.3,1)]">
          <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-[rgba(255,255,255,0.05)]">
            <Search size={14} className="text-[var(--text-muted)] shrink-0" />
            <input
              type="text"
              placeholder="Search models..."
              className="bg-transparent border-none outline-none text-[var(--text-primary)] text-[13px] w-full placeholder:text-[var(--text-muted)]"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
          </div>

          <div className="max-h-[280px] overflow-y-auto py-1">
            {filteredModels.length === 0 ? (
              <div className="p-4 text-center text-[13px] text-[var(--text-muted)]">No models found.</div>
            ) : (
              Object.entries(groupedModels).map(([provider, items]) => (
                <div key={provider}>
                  <div className="px-3.5 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.8px] text-[var(--text-muted)]">{provider}</div>
                  {items.map((m) => {
                    const isSelected = model === m.value;
                    const iconUrl = browser.runtime.getURL(`/icons/models/${m.icon}` as PublicPath);
                    return (
                      <div
                        key={m.value}
                        className={`px-3.5 py-2 flex items-center gap-3 cursor-pointer transition-colors duration-150 hover:bg-[var(--bg-hover)] ${isSelected ? 'bg-[rgba(255,255,255,0.03)]' : ''}`}
                        onClick={() => {
                          onSelectModel(m.value);
                          setSearchQuery('');
                        }}
                      >
                        <img
                          src={iconUrl}
                          alt=""
                          className="w-5 h-5 rounded block shrink-0"
                        />
                        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                          <div className="text-[13.5px] font-medium text-[var(--text-primary)]">{m.label}</div>
                          <div className="text-[11px] text-[var(--text-muted)] whitespace-nowrap overflow-hidden text-ellipsis">{m.desc}</div>
                        </div>
                        {isSelected && (
                          <div className="w-[18px] h-[18px] rounded-full bg-[var(--red,#ea4335)] flex items-center justify-center text-white shrink-0">
                            <Check size={12} strokeWidth={3} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
