import React, { useState, useRef, useEffect } from 'react';
import { RotateCw, Copy, MoreVertical, ChevronDown, ChevronRight, Pencil, Check, ChevronsUpDown, Wrench } from 'lucide-react';
import { getToolApproval } from '@cloudflare/ai-chat/react';
import { renderMarkdown } from '../lib/markdown';
import { formatToolName } from '../lib/toolNames';
import { ReasoningBlock } from './ReasoningBlock';
import { ToolCallAccordion } from './ToolCallAccordion';

/** Truncate long user messages with an expand/collapse toggle. */
function TruncatedMessage({ text, maxLen = 280 }: { text: string; maxLen?: number }) {
  const [expanded, setExpanded] = useState(false);
  const needsTruncation = text.length > maxLen;
  if (!needsTruncation) return <>{renderMarkdown(text)}</>;
  return (
    <div className="truncated-message">
      <div className={expanded ? '' : 'truncated-message-collapsed'}>
        {renderMarkdown(expanded ? text : text.slice(0, maxLen))}
      </div>
      {!expanded && <span className="truncated-ellipsis"> ...</span>}
      <button className="truncated-toggle" onClick={() => setExpanded(!expanded)}>
        <ChevronsUpDown size={13} />
        <span>{expanded ? 'Show less' : 'Show more'}</span>
      </button>
    </div>
  );
}

/** Props for MessageItem — a single message in the chat, including tool calls and approval UI. */
interface MessageItemProps {
  /** Message object from the agent */
  msg: any;
  /** Whether this is the last message in the list */
  isLast: boolean;
  /** Whether the agent is currently streaming */
  isStreaming: boolean;
  /** Callback to approve or reject a tool call */
  addToolApprovalResponse: (response: { id: string; approved: boolean }) => void;
  /** Request regeneration of this message */
  onRegenerate: (messageId: string) => void;
  /** Replace the message content starting from this point */
  onEditMessage: (messageId: string, newText: string) => void;
  /** Whether this is the latest assistant message (shows regenerate button) */
  isLatestAssistant?: boolean;
  /** All messages in the current thread (for context in tool calls) */
  allMessages?: any[];
}

/** Single chat message — renders user text, assistant markdown, reasoning blocks, tool approvals, and feedback actions. */
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
  /** Whether the user is currently editing this message. */
  const [isEditing, setIsEditing] = useState(false);
  /** Current text in the edit textarea. */
  const [editText, setEditText] = useState('');
  /** Whether the message text was just copied to clipboard. */
  const [copied, setCopied] = useState(false);

  /** Copy the message text to clipboard (with fallback for older browsers). */
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
  /** Whether the message has any non-empty text parts. */
  const hasText = msg.parts.some((p: any) => p.type === 'text' && p.text?.trim());
  /** Whether to show the feedback row (copy, regenerate) — only for finished assistant messages with text. */
  const showFeedback =
    msg.role === 'assistant' && hasText && !(isLast && isStreaming);

  /** Original text content of the first text part (used for edit comparison). */
  const originalText = msg.parts.find((p: any) => p.type === 'text')?.text || '';
  /** Whether the edit text differs from the original. */
  const isChanged = editText !== originalText;

  /** Render the inline edit mode with textarea and Cancel/Update buttons. */
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

  /** Render the message parts — text (markdown), reasoning blocks, tool-approval cards, and tool-call accordions. */
  return (
    <div className={`message ${msg.role}`}>
      {msg.parts.map((part: any, i: number) => {
        /* ── plain text ── */
        if (part.type === 'text') {
          if (msg.role === 'user') {
            return <TruncatedMessage key={i} text={part.text} />;
          }
          return (
            <React.Fragment key={i}>
              {renderMarkdown(part.text)}
            </React.Fragment>
          );
        }

        /* ── reasoning / thinking block ── */
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

        /* ── human-in-the-loop approval card ── */
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
              {/* Header */}
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

              {/* Parameters */}
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
                  Parameters
                </div>
                {Object.entries(part.input || {}).map(([key, val]) => (
                  <div
                    key={key}
                    style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}
                  >
                    <span style={{ fontFamily: 'monospace', color: 'var(--error-text, #f2b8b5)' }}>
                      {key}:
                    </span>
                    <span style={{ fontFamily: 'monospace', color: 'var(--text-primary)' }}>
                      {String(val)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
                <button
                  style={{
                    background: 'transparent',
                    border: '1px solid #444749',
                    color: '#ff6b6b',
                    padding: '6px 14px',
                    borderRadius: '16px',
                    fontSize: '12px',
                    fontWeight: 500,
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

        /* ── tool call accordion ── */
        if (part.toolCallId && part.state !== 'approval-requested') {
          return <ToolCallAccordion key={part.toolCallId} part={part} allParts={msg.parts} allMessages={allMessages} />;
        }

        return null;
      })}

      {/* Feedback row — only for finished assistant messages */}
      {showFeedback && (
        <div className={`feedback-row ${isLatestAssistant ? '' : 'feedback-row-hover'}`}>
          {isLatestAssistant && (
            <button className="feedback-btn" title="Regenerate" onClick={() => onRegenerate(msg.id)}>
              <RotateCw size={14} />
            </button>
          )}
          <button
            className="feedback-btn"
            title="Copy response"
            onClick={handleCopy}
          >
            {copied ? <Check size={14} color="#81c784" /> : <Copy size={14} />}
          </button>
          <button className="feedback-btn" title="More">
            <MoreVertical size={16} />
          </button>
        </div>
      )}

      {/* Edit button row — only for user messages */}
      {msg.role === 'user' && !isEditing && (
        <div className="user-action-row">
          <button
            className="feedback-btn"
            title="Edit prompt"
            onClick={() => {
              setIsEditing(true);
              setEditText(msg.parts.find((p: any) => p.type === 'text')?.text || '');
            }}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4px',
              borderRadius: '50%',
            }}
          >
            <Pencil size={12} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>
      )}
    </div>
  );
};
