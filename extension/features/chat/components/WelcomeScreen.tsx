import { SquareArrowOutUpRight } from 'lucide-react';
import { isRestrictedUrl } from '../../../lib/tabs';

interface WelcomeScreenProps {
  user?: any;
  onSuggestionClick?: (text: string) => void;
  onSignIn?: () => void;
  signingIn?: boolean;
  activeTabUrl?: string;
  activeTabTitle?: string;
  llmSuggestions?: string[];
  suggestionsLoading?: boolean;
}

function getContextLabel(url: string, title: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    if (host) return host;
  } catch {}
  return title || 'Current tab';
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  onSuggestionClick,
  onSignIn,
  signingIn,
  user,
  activeTabUrl = '',
  activeTabTitle = '',
  llmSuggestions = [],
  suggestionsLoading = false,
}) => {
  const firstName = user?.name?.split(' ')[0] ?? null;

  const contextLabel = activeTabUrl && !isRestrictedUrl(activeTabUrl)
    ? getContextLabel(activeTabUrl, activeTabTitle)
    : null;

  return (
    <div className="flex flex-col items-start justify-center flex-1 w-full max-w-xl mx-auto px-1 py-8">
      <h1 className="text-[1.75rem] font-bold bg-gradient-to-r from-[#e8574a] from-60% to-white bg-clip-text text-transparent mb-1 tracking-tight">
        Hello{firstName ? `, ${firstName}` : ''},
      </h1>
      <h2 className="text-2xl font-normal text-[#9aa0a6] mb-6 tracking-tight">
        How can I help you today?
      </h2>

      {user && contextLabel && (
        <div className="flex items-center gap-1.5 text-xs text-[#2563eb] mb-2">
          <SquareArrowOutUpRight size={13} className="shrink-0" />
          <a
            href={activeTabUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#2563eb] underline font-medium truncate"
          >
            {contextLabel}
          </a>
        </div>
      )}

      {!user && (
        <button
          className="flex items-center gap-2 px-3.5 py-1.5 bg-black hover:bg-[#141414] border-2 border-white rounded-[9px] text-sm font-semibold text-white transition-colors cursor-pointer mb-6 disabled:opacity-50"
          onClick={onSignIn}
          disabled={signingIn}
        >
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span>{signingIn ? 'Signing in...' : 'Sign In'}</span>
        </button>
      )}

      {(suggestionsLoading || llmSuggestions.length > 0) && (
        <div className="flex flex-col items-start gap-2.5 mt-2">
          {suggestionsLoading
            ? [0, 1, 2].map((i) => (
                <div key={i} className="relative overflow-hidden h-8 w-56 bg-[#1e1f20] rounded-full">
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#2d2e30] to-transparent animate-shimmer" />
                </div>
              ))
            : llmSuggestions.map((text) => (
                <button
                  key={text}
                  className="w-full text-left py-2 border-b border-dashed border-[#3c4043] hover:border-[#c4c7c5] text-xs font-bold text-[#c4c7c5] hover:text-[#ff8a80] transition-colors cursor-pointer bg-transparent border-x-0 border-t-0"
                  onClick={() => onSuggestionClick?.(text)}
                >
                  {text}
                </button>
              ))}
        </div>
      )}
    </div>
  );
};
