import React, { useState } from 'react';
import { Check, Copy, Download } from 'lucide-react';

interface CodeBlockProps {
  language: string;
  code: string;
}

function highlightCode(code: string, language: string): React.ReactNode[] {
  const lines = code.split('\n');
  return lines.map((line, lineIdx) => {
    let content: React.ReactNode[] = [];

    if (language.toLowerCase() === 'sql') {
      const tokens = line.split(/(\s+|[,;()])/);
      tokens.forEach((token, tokIdx) => {
        const key = `${lineIdx}-${tokIdx}`;
        const upperToken = token.toUpperCase();
        const keywords = [
          'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'ALTER', 'DEFAULT', 'PRIVILEGES',
          'IN', 'SCHEMA', 'GRANT', 'ON', 'TO', 'CREATE', 'TABLE', 'DATABASE', 'WHERE',
          'FROM', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'AS', 'AND', 'OR', 'NOT'
        ];
        if (keywords.includes(upperToken)) {
          content.push(<span key={key} className="text-[#f2b8b5] font-medium">{token}</span>);
        } else if (token.startsWith("'") && token.endsWith("'")) {
          content.push(<span key={key} className="text-[#c2e7ff]">{token}</span>);
        } else if (/^\d+$/.test(token)) {
          content.push(<span key={key} className="text-[#d3e3fd]">{token}</span>);
        } else {
          content.push(token);
        }
      });
    } else {
      const tokens = line.split(/(\s+|[{}[\]().,;+\-*/=<>!&|:?])/);
      tokens.forEach((token, tokIdx) => {
        const key = `${lineIdx}-${tokIdx}`;
        const keywords = [
          'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while',
          'do', 'switch', 'case', 'break', 'continue', 'import', 'export', 'from',
          'class', 'extends', 'new', 'this', 'super', 'try', 'catch', 'finally',
          'throw', 'async', 'await', 'default'
        ];
        if (keywords.includes(token)) {
          content.push(<span key={key} className="text-[#f2b8b5] font-medium">{token}</span>);
        } else if (/^(["'`]).*\1$/.test(token)) {
          content.push(<span key={key} className="text-[#c2e7ff]">{token}</span>);
        } else if (/^\d+$/.test(token)) {
          content.push(<span key={key} className="text-[#d3e3fd]">{token}</span>);
        } else {
          content.push(token);
        }
      });
    }

    return (
      <div key={lineIdx}>
        {content.length > 0 ? content : line || ' '}
      </div>
    );
  });
}

export const CodeBlock: React.FC<CodeBlockProps> = ({ language, code }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const ext = language.toLowerCase() === 'sql' ? 'sql' : 'txt';
    link.download = `code-snippet.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="border border-[var(--border-color)] rounded-lg overflow-hidden my-3.5 bg-[var(--code-bg)]">
      <div className="bg-[var(--bg-secondary)] border-b border-[var(--border-color)] px-4 py-2 flex justify-between items-center text-xs text-[var(--text-secondary)] select-none">
        <span className="font-semibold">{language.toUpperCase()}</span>
        <div className="flex items-center gap-2">
          <button className="bg-transparent border-none cursor-pointer p-1 rounded flex items-center justify-center text-[var(--text-secondary)] transition-colors duration-150 hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]" title="Download Code" onClick={handleDownload}>
            <Download size={14} />
          </button>
          <button className="bg-transparent border-none cursor-pointer p-1 rounded flex items-center justify-center text-[var(--text-secondary)] transition-colors duration-150 hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]" title="Copy Code" onClick={handleCopy}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>
      </div>
      <pre className="p-3.5 overflow-x-auto font-['JetBrains_Mono',Consolas,Monaco,monospace] text-xs leading-normal text-[#e3e3e3] text-left">
        <code>{highlightCode(code, language)}</code>
      </pre>
    </div>
  );
};
