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
    <div className="my-2 border-l-2 border-[rgba(150,150,150,0.3)] pl-2">
      <button
        type="button"
        className="flex items-center gap-1.5 bg-transparent border-none text-[var(--text-muted,#8e8e8e)] font-[inherit] text-xs font-semibold cursor-pointer py-1 transition-colors duration-150 hover:text-[var(--text-secondary,#c4c7c5)]"
        onClick={() => setExpanded(!expanded)}
      >
        <Brain size={14} className="text-[rgb(234,67,53)] shrink-0" />
        <span className={`reasoning-label tracking-[0.5px] text-[11px]${isStreaming ? ' reasoning-shimmer' : ''}`}>
          {isStreaming ? `Thinking${elapsed > 0 ? ` ${elapsed}s` : ''}` : 'Thought'}
        </span>
        {expanded ? (
          <ChevronDown size={12} className="shrink-0 transition-transform duration-150" />
        ) : (
          <ChevronRight size={12} className="shrink-0 transition-transform duration-150" />
        )}
      </button>
      {expanded && (
        <div className="mt-1">
          <pre className="text-xs leading-normal text-[var(--text-secondary,#c4c7c5)] whitespace-pre-wrap break-words font-[inherit]">
            {text}
          </pre>
        </div>
      )}
    </div>
  );
};
