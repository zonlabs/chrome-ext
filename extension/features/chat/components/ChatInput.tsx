import React, { RefObject } from 'react';
import { Plus, ChevronDown, Check, ArrowUp, Square, X } from 'lucide-react';
import { Tab, ModelTier, ModelEntry } from '../../../lib/types';
import { ModelSelector } from './ModelSelector';
import { Favicon, safeUrl } from '../../../components/Favicon';
import '../../../assets/input.css';

const CircleCheckIcon = () => (
  <div
    style={{
      width: '18px',
      height: '18px',
      borderRadius: '50%',
      backgroundColor: 'var(--red)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    }}
  >
    <Check size={12} strokeWidth={4} color="#ffffff" />
  </div>
);

const ChevronIcon = ({ isUp }: { isUp: boolean }) => (
  <ChevronDown
    size={14}
    style={{ transform: isUp ? 'none' : 'rotate(180deg)', transition: 'transform 0.2s' }}
  />
);

const TIER_CONFIG: Record<ModelTier, { label: string; color: string }> = {
  basic:        { label: 'Basic',        color: 'var(--text-muted, #8e8e8e)' },
  intermediate: { label: 'Intermediate', color: 'var(--text-secondary, #b0b0b0)' },
  advanced:     { label: 'Advanced',     color: 'var(--text-primary, #ffffff)' },
};

interface ChatInputProps {
  inputValue: string;
  setInputValue: (v: string) => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  isStreaming: boolean;
  onSubmit: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;

  showPopup: boolean;
  setShowPopup: (v: boolean) => void;
  attachPopupRef: RefObject<HTMLDivElement | null>;
  tabs: Tab[];
  selectedUrls: string[];
  activeTabUrl: string;
  onToggleUrl: (url: string) => void;

  showSelected: boolean;
  setShowSelected: (v: boolean) => void;
  selectedPanelRef: RefObject<HTMLDivElement | null>;

  showModelPopup: boolean;
  setShowModelPopup: (v: boolean) => void;
  modelDropdownRef: RefObject<HTMLDivElement | null>;
  model: string;
  modelsData: ModelEntry[];
  selectedModelLabel: string;
  selectedModelIcon: string;
  onSelectModel: (val: string) => void;
  onStop: () => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  inputValue,
  setInputValue,
  inputRef,
  isStreaming,
  onSubmit,
  onKeyDown,
  showPopup,
  setShowPopup,
  attachPopupRef,
  tabs,
  selectedUrls,
  activeTabUrl,
  onToggleUrl,
  showSelected,
  setShowSelected,
  selectedPanelRef,
  showModelPopup,
  setShowModelPopup,
  modelDropdownRef,
  model,
  modelsData,
  selectedModelLabel,
  selectedModelIcon,
  onSelectModel,
  onStop,
}) => {
  const selectedTabs = tabs.filter((t: any) => selectedUrls.includes(t.url));

  return (
    <div id="input-outer-container" className={`${showSelected && selectedUrls.length > 0 ? 'expanded' : ''} ${isStreaming ? 'streaming' : ''}`}>
      {selectedUrls.length > 0 && (
        <div className="flex items-center justify-between px-2.5 pt-2 pb-1 min-h-8">
          <div className="flex items-center gap-1.5 min-w-0">
            {!showSelected && selectedTabs.slice(0, 3).map((t: any, idx: number) => (
              <Favicon key={t.tabId ? `header-${t.url}-${t.tabId}` : `header-${t.url}-${idx}`} url={t.url} size={16} className="w-4 h-4 rounded-[2px] shrink-0" />
            ))}
            <span className="text-[13px] font-medium text-[var(--text-primary)] whitespace-nowrap">
              Sharing {selectedTabs.length} tab{selectedTabs.length > 1 ? 's' : ''}
            </span>
          </div>
          <button
            className="bg-transparent border-none text-[var(--text-secondary)] cursor-pointer flex items-center justify-center p-0.5 shrink-0 transition-colors duration-150 hover:text-[var(--text-primary)]"
            title={showSelected ? 'Hide selected tabs' : 'Show selected tabs'}
            onClick={() => { setShowPopup(false); setShowSelected(!showSelected); }}
          >
            <ChevronIcon isUp={showSelected} />
          </button>
        </div>
      )}

      <div id="selected-detail-collapsible" className="grid grid-rows-[0fr] min-h-0 transition-[grid-template-rows] duration-200 ease-[cubic-bezier(0.25,0.1,0.25,1)]">
        <div id="selected-detail-collapsible-inner" className="min-h-0 overflow-hidden">
          {showSelected && selectedUrls.length > 0 && (
            <>
              <div id="selected-detail" className="px-2.5 flex flex-col gap-0.5 max-h-[200px] overflow-y-auto">
                {selectedTabs.map((t: any, idx: number) => (
                  <div key={t.tabId ? `detail-${t.url}-${t.tabId}` : `detail-${t.url}-${idx}`} className="flex items-center gap-2 py-1">
                    <Favicon url={t.url} size={18} className="w-[18px] h-[18px] rounded-[3px] shrink-0" />
                    <span className="text-[13px] text-[var(--text-primary)] overflow-hidden text-ellipsis whitespace-nowrap flex-1 min-w-0">{t.title || t.url}</span>
                    {t.active && (
                      <span style={{ color: 'var(--text-muted)', fontWeight: 'normal' }}> • Current tab</span>
                    )}
                    <button
                      className="bg-transparent border-none text-[var(--text-muted)] cursor-pointer flex items-center justify-center p-0.5 rounded hover:text-[var(--text-primary)] transition-colors duration-150"
                      title="Remove tab"
                      onClick={() => onToggleUrl(t.url)}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="h-px bg-[var(--border-color)] mx-2.5 mb-0.5" />
            </>
          )}
        </div>
      </div>

      <div id="input-capsule-wrapper" className="relative flex flex-col px-1.5 pb-1.5">
        {showPopup && (
          <div ref={attachPopupRef} id="attach-popup" className="popup absolute bottom-[calc(100%+8px)] left-0 right-0 max-h-[240px] overflow-y-auto bg-[rgba(30,31,32,0.85)] backdrop-blur-[16px] border border-[rgba(255,255,255,0.08)] rounded-[14px] z-[1000] p-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.5)] animate-[popupSlideIn_.2s_cubic-bezier(0.16,1,0.3,1)]">
            <div style={{ padding: '6px 12px', fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
              Open Tabs
            </div>
            {tabs.map((t: any, idx: number) => {
              const isSelected = selectedUrls.includes(t.url);
              return (
                <div
                  key={t.tabId ? `popup-${t.url}-${t.tabId}` : `popup-${t.url}-${idx}`}
                  className={`flex items-center gap-3 px-3 py-2 rounded-[10px] cursor-pointer transition-colors duration-150 hover:bg-[var(--bg-hover)] ${isSelected ? 'bg-[rgba(255,255,255,0.03)]' : ''}`}
                  onClick={() => onToggleUrl(t.url)}
                >
                  <Favicon url={t.url} size={20} className="w-5 h-5 rounded shrink-0" />
                  <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <div className="text-[13px] font-medium text-[var(--text-primary)] whitespace-nowrap overflow-hidden text-ellipsis">
                      {t.title || t.url}
                      {t.active && (
                        <span style={{ color: 'var(--text-muted)', fontWeight: 'normal' }}> • Current tab</span>
                      )}
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)] whitespace-nowrap overflow-hidden text-ellipsis">{safeUrl(t.url)}</div>
                  </div>
                  {isSelected && <CircleCheckIcon />}
                </div>
              );
            })}
          </div>
        )}

        <div id="input-capsule" className="bg-transparent border-none p-1 flex flex-col">
          <textarea
            ref={inputRef}
            id="input"
            value={inputValue}
            placeholder="Type @ to ask about a tab"
            rows={1}
            disabled={isStreaming}
            onKeyDown={onKeyDown}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
              setInputValue(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${e.target.scrollHeight}px`;
            }}
            className="w-full bg-transparent border-none resize-none outline-none font-[inherit] text-[14px] leading-[1.4] text-[var(--text-primary)] min-h-[24px] max-h-[120px] px-1 py-2 placeholder:text-[var(--text-muted)]"
          />

          <div className="flex justify-between items-center mt-1">
            <div className="flex items-center">
              <button
                className="bg-transparent border-none cursor-pointer w-7 h-7 rounded-full flex items-center justify-center text-[var(--text-secondary)] transition-[background-color,color] duration-150 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                title="Attach tabs"
                onClick={() => { setShowSelected(false); setShowPopup(!showPopup); }}
              >
                <Plus size={18} />
              </button>
            </div>

            <div className="flex items-center" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ModelSelector
                showModelPopup={showModelPopup}
                setShowModelPopup={setShowModelPopup}
                modelDropdownRef={modelDropdownRef}
                model={model}
                modelsData={modelsData}
                selectedModelLabel={selectedModelLabel}
                selectedModelIcon={selectedModelIcon}
                onSelectModel={onSelectModel}
              />

              {isStreaming ? (
                <button
                  className="transition-[background-color,color] duration-150"
                  title="Stop generating"
                  onClick={onStop}
                  style={{
                    backgroundColor: 'var(--red, #ea4335)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '50%',
                    width: '28px',
                    height: '28px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <Square size={10} fill="#ffffff" stroke="none" />
                </button>
              ) : (
                <button
                  className="transition-[background-color,color] duration-150"
                  title="Send message"
                  onClick={onSubmit}
                  disabled={!inputValue.trim()}
                  style={{
                    borderRadius: '50%',
                    width: '28px',
                    height: '28px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: 'none',
                    backgroundColor: inputValue.trim() ? '#ffffff' : 'transparent',
                    color: inputValue.trim() ? '#131314' : '#8e8e8e',
                    cursor: inputValue.trim() ? 'pointer' : 'default',
                  }}
                >
                  <ArrowUp size={14} strokeWidth={2.5} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
