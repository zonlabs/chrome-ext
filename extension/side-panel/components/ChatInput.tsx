import React, { RefObject } from 'react';
import { Plus, ChevronDown, Check, ArrowUp, Square, X } from 'lucide-react';
import { Tab, ModelTier, ModelEntry } from '../../shared/types';
import { ModelSelector } from './ModelSelector';
import { Favicon, safeUrl } from './Favicon';

/* ── small local helpers ── */
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
  /* textarea state */
  inputValue: string;
  setInputValue: (v: string) => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  isStreaming: boolean;
  onSubmit: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;

  /* attach popup */
  showPopup: boolean;
  setShowPopup: (v: boolean) => void;
  attachPopupRef: RefObject<HTMLDivElement | null>;
  tabs: Tab[];
  selectedUrls: string[];
  activeTabUrl: string;
  onToggleUrl: (url: string) => void;

  /* selected tabs inline panel */
  showSelected: boolean;
  setShowSelected: (v: boolean) => void;
  selectedPanelRef: RefObject<HTMLDivElement | null>;

  /* model dropdown */
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
      {/* ── Header row (always visible when tabs selected) ── */}
      {selectedUrls.length > 0 && (
        <div className="input-header-row">
          <div className="input-header-left">
            {!showSelected && selectedTabs.slice(0, 3).map((t: any) => (
              <Favicon key={t.url} url={t.url} size={16} className="input-header-favicon" />
            ))}
            <span className="input-header-text">
              Sharing {selectedTabs.length} tab{selectedTabs.length > 1 ? 's' : ''}
            </span>
          </div>
          <button
            className="input-header-chevron"
            title={showSelected ? 'Hide selected tabs' : 'Show selected tabs'}
            onClick={() => { setShowPopup(false); setShowSelected(!showSelected); }}
          >
            <ChevronIcon isUp={showSelected} />
          </button>
        </div>
      )}

      {/* ── Collapsible detail panel ── */}
      <div id="selected-detail-collapsible">
        <div id="selected-detail-collapsible-inner">
          {showSelected && selectedUrls.length > 0 && (
            <>
              <div id="selected-detail">
                {selectedTabs.map((t: any) => (
                  <div key={t.url} className="detail-row">
                    <Favicon url={t.url} size={18} className="detail-row-favicon" />
                    <span className="detail-row-title">{t.title || t.url}</span>
                    {t.active && (
                      <span style={{ color: 'var(--text-muted)', fontWeight: 'normal' }}> • Current tab</span>
                    )}
                    <button
                      className="detail-row-remove"
                      title="Remove tab"
                      onClick={() => onToggleUrl(t.url)}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="input-divider" />
            </>
          )}
        </div>
      </div>

      {/* ── Textarea section ── */}
      <div id="input-capsule-wrapper">

        {/* ── Tab Attach Popup ── */}
        {showPopup && (
          <div ref={attachPopupRef} id="attach-popup" className="popup">
            <div style={{ padding: '6px 12px', fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
              Open Tabs
            </div>
            {tabs.map((t: any) => {
              const isSelected = selectedUrls.includes(t.url);
              return (
                <div
                  key={t.url}
                  className={`popup-item ${isSelected ? 'active' : ''}`}
                  onClick={() => onToggleUrl(t.url)}
                >
                  <Favicon url={t.url} size={20} className="popup-item-icon" />
                  <div className="popup-item-info">
                    <div className="popup-item-name">
                      {t.title || t.url}
                      {t.active && (
                        <span style={{ color: 'var(--text-muted)', fontWeight: 'normal' }}> • Current tab</span>
                      )}
                    </div>
                    <div className="popup-item-store">{safeUrl(t.url)}</div>
                  </div>
                  {isSelected && <CircleCheckIcon />}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Textarea + Bottom Action Row ── */}
        <div id="input-capsule">
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
          />

          <div className="input-actions-row">
            {/* Left: attach btn */}
            <div className="input-left-actions">
              <button
                className="input-action-circle-btn"
                title="Attach tabs"
                onClick={() => { setShowSelected(false); setShowPopup(!showPopup); }}
              >
                <Plus size={18} />
              </button>
            </div>

            {/* Right: model selector */}
            <div className="input-right-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                  className="submit-btn active"
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
                  className={`submit-btn ${inputValue.trim() ? 'active' : ''}`}
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
