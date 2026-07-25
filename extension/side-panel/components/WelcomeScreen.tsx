import React from 'react';
import { SquareArrowOutUpRight } from 'lucide-react';

/** Props for the WelcomeScreen component. */
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

/** Extract a human-readable domain label from a URL. */
function getContextLabel(url: string, title: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    if (host) return host;
  } catch {}
  return title || 'Current tab';
}

/** Placeholder shimmer chip shown while suggestions load. */
const SkeletonChip = () => (
  <div className="skeleton-glow suggestion-chip-skeleton" />
);

/** Full-screen greeting with sign-in, context label, and LLM-suggested prompts. */
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

  const contextLabel = activeTabUrl && !activeTabUrl.startsWith('chrome://')
    ? getContextLabel(activeTabUrl, activeTabTitle)
    : null;

  return (
    <div className="welcome-container">
      <h1 className="welcome-greeting">Hello{firstName ? `, ${firstName}` : ''},</h1>
      <h2 className="welcome-question">How can I help you today?</h2>

      {contextLabel && (
        <p className="welcome-context-label">
          <SquareArrowOutUpRight size={12} className="welcome-context-icon" />
          <span className="welcome-context-site">{contextLabel}</span>
          {!user && (
            <>
              <span className="welcome-context-divider">|</span>
              <button className="welcome-signin-btn" onClick={onSignIn} disabled={signingIn}>
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" width="16" height="16" />
                {signingIn ? 'Signing in...' : 'Sign In'}
              </button>
            </>
          )}
        </p>
      )}

      {!user && !contextLabel && (
        <button className="welcome-signin-btn" onClick={onSignIn} disabled={signingIn}>
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" width="16" height="16" />
          {signingIn ? 'Signing in...' : 'Sign In'}
        </button>
      )}

      {(suggestionsLoading || llmSuggestions.length > 0) && (
        <div className="suggestion-chips">
          {suggestionsLoading
            ? [0, 1, 2].map(i => <SkeletonChip key={i} />)
            : llmSuggestions.map((text) => (
                <button
                  key={text}
                  className="suggestion-chip"
                  onClick={() => onSuggestionClick(text)}
                >
                  <span className="suggestion-chip-text">{text}</span>
                </button>
              ))}
        </div>
      )}
    </div>
  );
};
