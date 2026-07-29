import React, { useMemo, useState, RefObject } from 'react';
import { Check, Search, ChevronDown } from 'lucide-react';
import { ModelEntry } from '../../../../shared/types';

/** Props for the ModelSelector component. */
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

/** Dropdown popup to search and select an LLM model by provider. */
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

  // Filter models based on search query
  const filteredModels = useMemo(() => {
    return modelsData.filter(m =>
      m.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.desc.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [modelsData, searchQuery]);

  // Group filtered models by provider
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
    ? chrome.runtime.getURL(`ui/assets/icons/models/${selectedModelIcon}`)
    : '';

  return (
    <div className="model-selector-container" ref={modelDropdownRef}>
      <button
        className="model-selector-trigger"
        onClick={() => setShowModelPopup(!showModelPopup)}
      >
        {selectedModelIcon && (
          <img
            src={selectedModelIconUrl}
            alt=""
            className="model-selector-trigger-icon"
          />
        )}
        <span className="model-selector-trigger-text">{selectedModelLabel}</span>
        <ChevronDown
          size={14}
          className={`model-selector-trigger-chevron ${showModelPopup ? 'open' : ''}`}
        />
      </button>

      {showModelPopup && (
        <div className="model-selector-popup">
          <div className="model-selector-search-container">
            <Search size={14} className="model-selector-search-icon" />
            <input
              type="text"
              placeholder="Search models..."
              className="model-selector-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
          </div>

          <div className="model-selector-list">
            {filteredModels.length === 0 ? (
              <div className="model-selector-empty">No models found.</div>
            ) : (
              Object.entries(groupedModels).map(([provider, items]) => (
                <div key={provider} className="model-selector-group">
                  <div className="model-selector-group-header">{provider}</div>
                  {items.map((m) => {
                    const isSelected = model === m.value;
                    const iconUrl = chrome.runtime.getURL(`ui/assets/icons/models/${m.icon}`);
                    return (
                      <div
                        key={m.value}
                        className={`model-selector-item ${isSelected ? 'active' : ''}`}
                        onClick={() => {
                          onSelectModel(m.value);
                          setSearchQuery('');
                        }}
                      >
                        <img
                          src={iconUrl}
                          alt=""
                          className="model-selector-item-icon"
                        />
                        <div className="model-selector-item-info">
                          <div className="model-selector-item-label">{m.label}</div>
                          <div className="model-selector-item-desc">{m.desc}</div>
                        </div>
                        {isSelected && (
                          <div className="model-selector-item-checkmark">
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
