import React from 'react';
import { AlignLeft, Trash2, LogOut, LogIn, Puzzle } from 'lucide-react';
import { LS_ACTIVE } from '../../shared/constants';

/** A single chat thread entry displayed in the history list. */
interface ChatThread {
  /** Unique thread ID */
  id: string;
  /** Human-readable thread title */
  title: string;
  /** Unix timestamp of thread creation */
  createdAt: number;
}

/** Props for the HistoryPopup — thread list, auth actions, and plugin navigation. */
interface HistoryPopupProps {
  /** All chat threads */
  threads: ChatThread[];
  /** Currently active thread ID */
  activeThreadId: string;
  /** Switch to a different thread */
  setActiveThreadId: (id: string) => void;
  /** Close the popup */
  setShowHistoryPopup: (show: boolean) => void;
  /** Delete a thread by ID */
  onDeleteThread: (id: string) => void;
  /** Authenticated user object, or null */
  user: any;
  /** Initiate sign-in */
  onSignIn: () => void;
  /** Whether sign-in is in progress */
  signingIn?: boolean;
  /** Sign the user out */
  onSignOut: () => void;
  /** Navigate to the plugins management screen */
  onOpenPlugins: () => void;
}

/** Dropdown popup with MCP Plugins link, sign-in/sign-out, and a scrollable list of recent chat threads. */
export const HistoryPopup: React.FC<HistoryPopupProps> = ({
  threads,
  activeThreadId,
  setActiveThreadId,
  setShowHistoryPopup,
  onDeleteThread,
  user,
  onSignIn,
  signingIn,
  onSignOut,
  onOpenPlugins,
}) => {
  return (
    <div className="history-popup">
      {/* Menu Actions */}
      <div className="history-popup-menu-section">
        {user && (
          <button
            className="history-popup-menu-item"
            onClick={() => {
              onOpenPlugins();
              setShowHistoryPopup(false);
            }}
          >
            <Puzzle size={16} color="var(--text-secondary)" style={{ flexShrink: 0 }} />
            <span className="history-popup-menu-item-text">MCP Plugins</span>
          </button>
        )}

        {user ? (
          <button
            className="history-popup-menu-item"
            onClick={() => {
              onSignOut();
              setShowHistoryPopup(false);
            }}
          >
            <LogOut size={16} color="var(--text-secondary)" style={{ flexShrink: 0 }} />
            <span className="history-popup-menu-item-text">
              Sign Out ({user.email})
            </span>
          </button>
        ) : (
          <button
            className="history-popup-menu-item"
            disabled={signingIn}
            onClick={() => {
              onSignIn();
              setShowHistoryPopup(false);
            }}
          >
            <LogIn size={16} color="var(--text-secondary)" style={{ flexShrink: 0 }} />
            <span className="history-popup-menu-item-text">{signingIn ? 'Signing in...' : 'Sign In with Google'}</span>
          </button>
        )}
      </div>

      <div className="history-popup-divider" />

      {/* Recent Chats Section */}
      <div className="history-popup-header">Recent chats</div>
      <div className="history-popup-list">
        {threads.length === 0 ? (
          <div className="history-popup-empty">No chats yet</div>
        ) : (
          threads.map((t) => {
            const isCurrent = t.id === activeThreadId;
            return (
              <div
                key={t.id}
                className={`history-popup-item ${isCurrent ? 'active' : ''}`}
                onClick={() => {
                  setActiveThreadId(t.id);
                  localStorage.setItem(LS_ACTIVE, t.id);
                  setShowHistoryPopup(false);
                }}
              >
                <AlignLeft size={16} color="var(--text-secondary)" style={{ flexShrink: 0 }} />
                <span className="history-popup-item-text">{t.title}</span>
                <button
                  className="history-popup-delete-btn"
                  title="Delete chat"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteThread(t.id);
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
