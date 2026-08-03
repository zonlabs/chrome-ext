import React, { useState } from 'react';
import { ChevronDown, ChevronRight, AlertCircle, Image, Wrench, Search, Globe, List, FileText, AppWindow, SquareTerminal } from 'lucide-react';
import { getToolSummary } from '../lib/toolNames';

interface ToolCallAccordionProps {
  part: any;
  allParts?: any[];
  allMessages?: any[];
}

function getToolIconComponent(rawName: string, state: string) {
  if (state === 'output-error') return <AlertCircle size={13} style={{ color: '#ff6b6b' }} />;
  if (!rawName) return <Wrench size={13} />;
  const name = rawName.toLowerCase();
  if (name.includes('codemode') || name.includes('code_mode') || name.includes('terminal') || name.includes('shell')) return <SquareTerminal size={13} />;
  if (name === 'gettabcontent' || name === 'getactivetabs') return <AppWindow size={13} />;
  if (name.includes('search')) return <Search size={13} />;
  if (name.includes('fetch') || name.includes('navigate') || name.includes('browse') || name.includes('scrape') || name.includes('web')) return <Globe size={13} />;
  if (name.includes('list')) return <List size={13} />;
  if (name.includes('get') || name.includes('read') || name.includes('file') || name.includes('export')) return <FileText size={13} />;
  if (name.includes('screenshot') || name.includes('capture')) return <Image size={13} />;
  return <Wrench size={13} />;
}

export const ToolCallAccordion: React.FC<ToolCallAccordionProps> = ({ part, allParts, allMessages }) => {
  const [isOpen, setIsOpen] = useState(false);

  const getToolNameFromPart = (p: any) => {
    if (!p) return '';
    if (p.toolName) return p.toolName;
    if (p.type && p.type.startsWith('tool-')) return p.type.slice(5);
    return '';
  };

  let toolName = getToolNameFromPart(part);

  if (!toolName && allParts) {
    const found = allParts.find((p: any) => p.toolCallId === part.toolCallId && getToolNameFromPart(p));
    if (found) toolName = getToolNameFromPart(found);
  }

  if (!toolName && allMessages) {
    for (const m of allMessages) {
      if (m.parts) {
        const found = m.parts.find((p: any) => p.toolCallId === part.toolCallId && getToolNameFromPart(p));
        if (found) { toolName = getToolNameFromPart(found); break; }
      }
    }
  }

  const rawOutput = part.output !== undefined ? part.output : (part.result !== undefined ? part.result : part.error);

  const isError = part.state === 'output-error' ||
    part.isError === true ||
    part.error !== undefined ||
    (typeof rawOutput === 'string' && (rawOutput.startsWith('Error') || rawOutput.startsWith('Failed'))) ||
    (rawOutput && typeof rawOutput === 'object' && ('error' in rawOutput || 'errorMessage' in rawOutput));

  const argsString = JSON.stringify(part.input || part.args || {}, null, 2);
  const resultString = rawOutput !== undefined
    ? (typeof rawOutput === 'object' ? JSON.stringify(rawOutput, null, 2) : String(rawOutput))
    : '';

  const summary = getToolSummary(toolName, part.input || part.args, rawOutput, part.state);

  const isExecuting = part.state !== 'output-available' && part.state !== 'output-error' && !isError;

  return (
    <div className="my-0.5 max-h-[600px] overflow-hidden transition-[opacity,max-height,margin,padding] duration-200">
      <div className="group flex items-center gap-2 py-1 bg-transparent cursor-pointer select-none" onClick={() => setIsOpen(!isOpen)}>
        <div className="relative w-3.5 h-3.5 flex items-center justify-center shrink-0">
          <div className="text-[var(--text-muted,#8e8e8e)] flex items-center justify-center opacity-100 transition-opacity duration-150 group-hover:opacity-0">
            {getToolIconComponent(toolName, isError ? 'output-error' : part.state)}
          </div>
          <div className="absolute inset-0 text-[var(--text-muted,#8e8e8e)] flex items-center justify-center opacity-0 transition-opacity duration-150 group-hover:opacity-100">
            {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </div>
        </div>
        <span className={`truncate font-medium text-[12.5px] text-[var(--text-muted,#8e8e8e)] font-[inherit] transition-colors duration-150 group-hover:text-[var(--text-secondary,#c4c7c5)] ${isExecuting ? 'tool-call-shimmer' : ''}`}>
          {summary}
        </span>
      </div>

      {isOpen && (
        <div className="py-1.5 pl-[22px] flex flex-col gap-2.5 text-xs text-left">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[var(--text-muted,#8e8e8e)] mb-1 text-[11px] uppercase tracking-[0.03em]">Tool</span>
            <span className="font-['JetBrains_Mono',monospace] text-[11px] text-[var(--text-primary)]">{toolName || 'Unknown'}</span>
          </div>
          <div>
            <div className="font-semibold text-[var(--text-muted,#8e8e8e)] mb-1 text-[11px] uppercase tracking-[0.03em]">Arguments</div>
            <pre className="m-0 p-2.5 rounded-md bg-[#0f0f11] text-[#d4d4d4] font-['JetBrains_Mono',Consolas,Monaco,monospace] text-[11px] overflow-auto max-h-[180px] whitespace-pre-wrap break-all border border-[rgba(255,255,255,0.03)]">{argsString}</pre>
          </div>
          {(resultString || isError) && (
            <div>
              <div className="font-semibold text-[var(--text-muted,#8e8e8e)] mb-1 text-[11px] uppercase tracking-[0.03em]">Result</div>
              <pre className="m-0 p-2.5 rounded-md bg-[#0f0f11] text-[#d4d4d4] font-['JetBrains_Mono',Consolas,Monaco,monospace] text-[11px] overflow-auto max-h-[180px] whitespace-pre-wrap break-all border border-[rgba(255,255,255,0.03)]" style={isError ? { color: '#ff6b6b' } : undefined}>
                {resultString || 'Error executing tool.'}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
