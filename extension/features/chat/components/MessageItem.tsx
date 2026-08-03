import React, { useState, useRef, useEffect } from 'react';
import { RotateCw, Copy, MoreVertical, ChevronDown, ChevronRight, Pencil, Check, ChevronsUpDown, Wrench } from 'lucide-react';
import { getToolApproval } from '@cloudflare/ai-chat/react';
import { renderMarkdown } from '../lib/markdown';
import { formatToolName } from '../lib/toolNames';
import { ReasoningBlock } from './ReasoningBlock';
import { ToolCallAccordion } from './ToolCallAccordion';

function TruncatedMessage({ text, maxLen = 280 }: { text: string; maxLen?: number }) {
  const [expanded, setExpanded] = useState(false);
  const needsTruncation = text.length > maxLen;
  if (!needsTruncation) return <>{renderMarkdown(text)}</>;
  return (
    <div className="w-full">
      <div className={expanded ? '' : 'inline overflow-hidden'}>
        {renderMarkdown(expanded ? text : text.slice(0, maxLen))}
      </div>
      {!expanded && <span className="text-[var(--text-muted)] text-[13px]"> ...</span>}
      <button className="inline-flex items-center gap-1 mt-1.5 bg-transparent border-none text-[var(--text-muted)] cursor-pointer text-xs px-1.5 py-0.5 rounded hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--text-primary)]" onClick={() => setExpanded(!expanded)}>
        <ChevronsUpDown size={13} />
        <span>{expanded ? 'Show less' : 'Show more'}</span>
      </button>
    </div>
  );
}

interface MessageItemProps {
  msg: any;
  isLast: boolean;
  isStreaming: boolean;
  addToolApprovalResponse: (response: { id: string; approved: boolean }) => void;
  onRegenerate: (messageId: string) => void;
  onEditMessage: (messageId: string, newText: string) => void;
  isLatestAssistant?: boolean;
  allMessages?: any[];
}

export const MessageItem: React.FC<MessageItemProps> = ({
  msg,
  isLast,
  isStreaming,
  addToolApprovalResponse,
  onRegenerate,
  onEditMessage,
  isLatestAssistant,
  allMessages,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const text = msg.parts
      .filter((p: any) => p.type === 'text')
      .map((p: any) => p.text)
      .join('\n');

    const fallbackCopy = (t: string) => {
      const textArea = document.createElement("textarea");
      textArea.value = t;
      textArea.style.position = "fixed";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('Fallback: unable to copy', err);
      }
      document.body.removeChild(textArea);
    };

    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => {
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
  };
  const hasText = msg.parts.some((p: any) => p.type === 'text' && p.text?.trim());
  const showFeedback =
    msg.role === 'assistant' && hasText && !(isLast && isStreaming);

  const originalText = msg.parts.find((p: any) => p.type === 'text')?.text || '';
  const isChanged = editText !== originalText;

  if (isEditing) {
    return (
      <div
        style={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          alignSelf: 'stretch',
          background: 'transparent',
          border: 'none',
          padding: '0',
          margin: '8px 0',
        }}
      >
        <textarea
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          style={{
            width: '100%',
            minHeight: '48px',
            background: 'transparent',
            border: '1px solid var(--border-color, #3c4043)',
            borderRadius: '24px',
            outline: 'none',
            resize: 'none',
            color: 'var(--text-primary)',
            fontFamily: 'inherit',
            fontSize: '14px',
            lineHeight: '1.5',
            padding: '12px 20px',
            boxSizing: 'border-box',
          }}
        />
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', alignItems: 'center', paddingRight: '8px' }}>
          <button
            onClick={() => setIsEditing(false)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              padding: '6px 12px',
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (editText.trim() && isChanged) {
                onEditMessage(msg.id, editText.trim());
                setIsEditing(false);
              }
            }}
            disabled={!isChanged || !editText.trim()}
            style={{
              background: isChanged && editText.trim() ? 'var(--red, #ea4335)' : '#2a2b2d',
              color: isChanged && editText.trim() ? '#ffffff' : '#8e8e8e',
              border: 'none',
              padding: '8px 20px',
              borderRadius: '20px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: isChanged && editText.trim() ? 'pointer' : 'default',
            }}
          >
            Update
          </button>
        </div>
      </div>
    );
  }

  if (msg.role === 'user') {
    return (
      <div className="group flex items-center gap-1.5 self-end max-w-[85%]">
        {!isEditing && (
          <button
            className="opacity-0 group-hover:opacity-100 p-1.5 text-[var(--text-muted,#8e8e8e)] hover:text-[var(--text-primary,#e3e3e3)] hover:bg-[var(--bg-hover,#2a2b2d)] rounded-full transition-all cursor-pointer border-0 bg-transparent shrink-0"
            title="Edit prompt"
            onClick={() => {
              setIsEditing(true);
              setEditText(msg.parts.find((p: any) => p.type === 'text')?.text || '');
            }}
          >
            <Pencil size={13} />
          </button>
        )}
        <div className="bg-[var(--user-bubble-bg,#1e1f20)] text-[var(--text-primary,#e3e3e3)] px-4 py-3 rounded-[18px] leading-normal break-words whitespace-pre-wrap flex-1 min-w-0 overflow-x-hidden">
          {msg.parts.map((part: any, i: number) => {
            if (part.type === 'text') {
              return <TruncatedMessage key={i} text={part.text} />;
            }
            return null;
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="self-start w-full text-[var(--text-primary,#e3e3e3)] leading-relaxed flex flex-col">
      {msg.parts.map((part: any, i: number) => {
        if (part.type === 'text') {
          return (
            <React.Fragment key={i}>
              {renderMarkdown(part.text)}
            </React.Fragment>
          );
        }

        if (part.type === 'reasoning') {
          const isCurrentPartStreaming = isStreaming && isLast && i === msg.parts.length - 1;
          return (
            <ReasoningBlock
              key={i}
              text={part.text}
              isStreaming={isCurrentPartStreaming}
            />
          );
        }

        if (part.state === 'approval-requested') {
          const approval = getToolApproval(part);
          if (!approval) return null;
          return (
            <div
              key={part.toolCallId}
              style={{
                marginTop: '12px',
                padding: '16px',
                border: '1px solid var(--border-color)',
                borderRadius: '12px',
                background: 'var(--bg-secondary)',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    backgroundColor: 'rgba(234, 67, 53, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Wrench size={14} color="var(--red)" />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Action Required
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Tool: {formatToolName(part.toolName || (part.type?.startsWith('tool-') ? part.type.slice(5) : ''))}
                  </span>
                </div>
              </div>

              <div
                style={{
                  background: '#131314',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                }}
              >
                <div
                  style={{
                    fontWeight: 600,
                    marginBottom: '6px',
                    fontSize: '11px',
                    color: 'var(--text-muted)',
                  }}
                >
                  Arguments
                </div>
                <pre
                  style={{
                    margin: 0,
                    fontSize: '11px',
                    fontFamily: 'monospace',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                  }}
                >
                  {JSON.stringify(part.input || part.args || {}, null, 2)}
                </pre>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                <button
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-secondary)',
                    padding: '6px 14px',
                    borderRadius: '16px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    transition: 'background-color 0.15s',
                  }}
                  onClick={() => addToolApprovalResponse({ id: approval.id, approved: false })}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 107, 107, 0.05)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  Reject
                </button>
                <button
                  style={{
                    background: 'var(--red)',
                    border: 'none',
                    color: '#ffffff',
                    padding: '6px 14px',
                    borderRadius: '16px',
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'background-color 0.15s',
                  }}
                  onClick={() => addToolApprovalResponse({ id: approval.id, approved: true })}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#d3362a')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--red)')}
                >
                  Approve
                </button>
              </div>
            </div>
          );
        }

        if (part.toolCallId && part.state !== 'approval-requested') {
          return <ToolCallAccordion key={part.toolCallId} part={part} allParts={msg.parts} allMessages={allMessages} />;
        }

        return null;
      })}

      {showFeedback && (
        <div className={`flex items-center gap-2 mt-2 pl-0.5 ${isLatestAssistant ? '' : 'feedback-row-hover'}`}>
          {isLatestAssistant && (
            <button className="bg-transparent border-none cursor-pointer w-7 h-7 rounded-full flex items-center justify-center text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]" title="Regenerate" onClick={() => onRegenerate(msg.id)}>
              <RotateCw size={14} />
            </button>
          )}
          <button
            className="bg-transparent border-none cursor-pointer w-7 h-7 rounded-full flex items-center justify-center text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            title="Copy response"
            onClick={handleCopy}
          >
            {copied ? <Check size={14} color="#81c784" /> : <Copy size={14} />}
          </button>
          <button className="bg-transparent border-none cursor-pointer w-7 h-7 rounded-full flex items-center justify-center text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]" title="More">
            <MoreVertical size={16} />
          </button>
        </div>
      )}
    </div>
  );
};
