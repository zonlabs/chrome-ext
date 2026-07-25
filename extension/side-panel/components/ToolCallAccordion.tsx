import React, { useState } from 'react';
import { ChevronDown, ChevronRight, AlertCircle, Wrench, Search, Globe, List, FileText, AppWindow, SquareTerminal } from 'lucide-react';
import { getToolSummary, formatToolName } from '../utils/toolNames';

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
  return <Wrench size={13} />;
}

/** Expandable accordion displaying a tool call's name, arguments, and result. */
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

  const argsString = JSON.stringify(part.input || part.args || {}, null, 2);
  const resultString = part.output !== undefined
    ? (typeof part.output === 'object' ? JSON.stringify(part.output, null, 2) : String(part.output))
    : '';

  const renderResult = () => {
    if (part.state === 'output-error') {
      return <pre className="tool-call-code" style={{ color: '#ff6b6b', borderColor: 'rgba(255, 107, 107, 0.2)' }}>{resultString || 'Error executing tool.'}</pre>;
    }
    return <pre className="tool-call-code">{resultString}</pre>;
  };

  const isExecuting = part.state !== 'output-available' && part.state !== 'output-error';
  const summary = getToolSummary(toolName, part.input || part.args, part.output, part.state);

  return (
    <div className="tool-call-accordion">
      <div className="tool-call-header" onClick={() => setIsOpen(!isOpen)}>
        <div className="tool-call-icon-wrapper">
          <div className="tool-call-icon">{getToolIconComponent(toolName, part.state)}</div>
          <div className="tool-call-chevron">{isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</div>
        </div>
        <span className={`tool-call-name ${isExecuting ? 'tool-call-shimmer' : ''}`}>{summary}</span>
      </div>

      {isOpen && (
        <div className="tool-call-content">
          <div className="tool-call-name-section">
            <span className="tool-call-section-title">Tool</span>
            <span className="tool-call-name-value">{toolName}</span>
          </div>
          <div>
            <div className="tool-call-section-title">Arguments</div>
            <pre className="tool-call-code">{argsString}</pre>
          </div>
          {resultString && (
            <div>
              <div className="tool-call-section-title">Result</div>
              {renderResult()}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
