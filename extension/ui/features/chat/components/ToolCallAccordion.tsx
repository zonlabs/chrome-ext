import React, { useState } from 'react';
import { ChevronDown, ChevronRight, AlertCircle, Image, Wrench, Search, Globe, List, FileText, AppWindow, SquareTerminal } from 'lucide-react';
import { getToolSummary, formatToolName } from '../lib/toolNames';

/** Props for the ToolCallAccordion component. */
interface ToolCallAccordionProps {
  part: any;
  allParts?: any[];
  allMessages?: any[];
}

/** Map a tool name to the appropriate Lucide icon based on its category. */
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

/** Expandable accordion displaying a tool call's name, arguments, and result/error. */
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
    <div className="tool-call-accordion">
      <div className="tool-call-header" onClick={() => setIsOpen(!isOpen)}>
        <div className="tool-call-icon-wrapper">
          <div className="tool-call-icon">
            {getToolIconComponent(toolName, isError ? 'output-error' : part.state)}
          </div>
          <div className="tool-call-chevron">{isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</div>
        </div>
        <span className={`tool-call-name ${isExecuting ? 'tool-call-shimmer' : ''}`}>
          {summary}
        </span>
      </div>

      {isOpen && (
        <div className="tool-call-content">
          <div className="tool-call-name-section">
            <span className="tool-call-section-title">Tool</span>
            <span className="tool-call-name-value">{toolName || 'Unknown'}</span>
          </div>
          <div>
            <div className="tool-call-section-title">Arguments</div>
            <pre className="tool-call-code">{argsString}</pre>
          </div>
          {(resultString || isError) && (
            <div>
              <div className="tool-call-section-title">Result</div>
              <pre className="tool-call-code" style={isError ? { color: '#ff6b6b' } : undefined}>
                {resultString || 'Error executing tool.'}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
