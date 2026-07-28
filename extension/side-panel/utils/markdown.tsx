import React from 'react';
import { CodeBlock } from '../components/CodeBlock';

function parseInlineStyles(text: string, lineKey: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*.*?\*\*|`.*?`)/g;
  const splitParts = text.split(regex);
  
  splitParts.forEach((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      parts.push(<strong key={`b-${lineKey}-${i}`}>{part.slice(2, -2)}</strong>);
    } else if (part.startsWith('`') && part.endsWith('`')) {
      parts.push(<code key={`c-${lineKey}-${i}`}>{part.slice(1, -1)}</code>);
    } else {
      parts.push(part);
    }
  });
  return parts;
}

function renderTextBlocks(text: string, sectionKey: string): React.ReactNode[] {
  const lines = text.split('\n');
  const blocks: React.ReactNode[] = [];
  let currentList: React.ReactNode[] = [];
  let currentListType: 'ul' | 'ol' | null = null;

  const flushList = (key: number) => {
    if (currentListType === 'ul') {
      blocks.push(<ul key={`list-${sectionKey}-${key}`}>{currentList}</ul>);
    } else if (currentListType === 'ol') {
      blocks.push(<ol key={`list-${sectionKey}-${key}`}>{currentList}</ol>);
    }
    currentList = [];
    currentListType = null;
  };

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    const lineKey = `${sectionKey}-${idx}`;
    
    if (trimmed.startsWith('### ')) {
      flushList(idx);
      blocks.push(<h3 key={`h3-${lineKey}`}>{parseInlineStyles(trimmed.slice(4), lineKey)}</h3>);
    } else if (trimmed.startsWith('#### ')) {
      flushList(idx);
      blocks.push(<h4 key={`h4-${lineKey}`}>{parseInlineStyles(trimmed.slice(5), lineKey)}</h4>);
    } else if (trimmed.startsWith('## ')) {
      flushList(idx);
      blocks.push(<h3 key={`h2-${lineKey}`}>{parseInlineStyles(trimmed.slice(3), lineKey)}</h3>);
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (currentListType !== 'ul') {
        flushList(idx);
        currentListType = 'ul';
      }
      currentList.push(<li key={`li-${lineKey}`}>{parseInlineStyles(trimmed.slice(2), lineKey)}</li>);
    } else if (/^\d+\.\s/.test(trimmed)) {
      const match = trimmed.match(/^\d+\.\s/);
      const sliceLen = match ? match[0].length : 3;
      if (currentListType !== 'ol') {
        flushList(idx);
        currentListType = 'ol';
      }
      currentList.push(<li key={`li-${lineKey}`}>{parseInlineStyles(trimmed.slice(sliceLen), lineKey)}</li>);
    } else if (!trimmed) {
      flushList(idx);
    } else {
      flushList(idx);
      blocks.push(<p key={`p-${lineKey}`}>{parseInlineStyles(line, lineKey)}</p>);
    }
  });

  flushList(lines.length);
  return blocks;
}

/** Render markdown string to React elements with code and inline style support. */
export function renderMarkdown(text: string): React.ReactNode {
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  const elements: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  let sectionIdx = 0;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const textSection = text.substring(lastIndex, match.index);
      elements.push(...renderTextBlocks(textSection, `sec-${sectionIdx++}`));
    }

    const language = match[1] || 'Code';
    const code = match[2];
    elements.push(
      <CodeBlock key={`code-${match.index}`} language={language} code={code} />
    );

    lastIndex = codeBlockRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    const textSection = text.substring(lastIndex);
    elements.push(...renderTextBlocks(textSection, `sec-${sectionIdx++}`));
  }

  return <div className="message-content">{elements}</div>;
}
