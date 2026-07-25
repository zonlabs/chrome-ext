import React, { useState, useRef, useEffect } from 'react';
import { Brain, ChevronDown, ChevronRight } from 'lucide-react';

interface ReasoningBlockProps {
  text: string;
  isStreaming: boolean;
}

export const ReasoningBlock: React.FC<ReasoningBlockProps> = ({ text, isStreaming }) => {
  const [expanded, setExpanded] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isStreaming) {
      setElapsed(0);
      startTimeRef.current = null;
      return;
    }
    startTimeRef.current = Date.now();
    const interval = setInterval(() => {
      if (startTimeRef.current) {
        setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [isStreaming]);

  if (!text?.trim()) return null;

  return (
    <div className="reasoning-block">
      <button
        type="button"
        className="reasoning-toggle"
        onClick={() => setExpanded(!expanded)}
      >
        <Brain size={14} className="reasoning-icon" />
        <span className={`reasoning-label${isStreaming ? ' reasoning-shimmer' : ''}`}>
          Thinking{isStreaming && elapsed > 0 ? ` ${elapsed}s` : ''}
        </span>
        {expanded ? (
          <ChevronDown size={12} className="reasoning-chevron" />
        ) : (
          <ChevronRight size={12} className="reasoning-chevron" />
        )}
      </button>
      {expanded && (
        <div className="reasoning-content">
          <pre className="reasoning-text">
            {text}
          </pre>
        </div>
      )}
    </div>
  );
};
