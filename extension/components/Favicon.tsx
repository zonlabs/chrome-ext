import { useState } from 'react';
import type { CSSProperties } from 'react';

export function safeUrl(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

interface FaviconProps {
  url: string;
  size?: number;
  className?: string;
}

export const Favicon: React.FC<FaviconProps> = ({ url, size = 20, className }) => {
  const domain = safeUrl(url);
  const [errored, setErrored] = useState(false);
  const isLocal = !domain || domain === 'localhost' || domain.startsWith('127.') || domain === '0.0.0.0';
  const showFallback = errored || isLocal;
  const letter = (domain || '?').charAt(0).toUpperCase();

  const boxStyle: CSSProperties = {
    width: size,
    height: size,
    borderRadius: '4px',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--text-muted, #8e8e8e)',
    color: '#ffffff',
    fontWeight: 600,
    fontSize: Math.max(9, Math.round(size * 0.55)),
    textTransform: 'uppercase',
  };

  if (showFallback) {
    return (
      <div className={className} style={boxStyle}>
        {letter}
      </div>
    );
  }

  return (
    <img
      className={className}
      src={`https://icons.duckduckgo.com/ip3/${domain}.ico`}
      alt=""
      style={{ width: size, height: size, borderRadius: '4px', flexShrink: 0, objectFit: 'cover' }}
      onError={() => setErrored(true)}
    />
  );
};
