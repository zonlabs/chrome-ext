import { AlignLeft, Trash2, LogOut, LogIn, Settings2 } from 'lucide-react';
import { LS_ACTIVE } from '../../../lib/constants';

interface ChatThread {
  id: string;
  title: string;
  createdAt: number;
}

interface HistoryPopupProps {
  threads: ChatThread[];
  activeThreadId: string;
  setActiveThreadId: (id: string) => void;
  setShowHistoryPopup: (show: boolean) => void;
  onDeleteThread: (id: string) => void;
  user: any;
  onSignIn: () => void;
  signingIn?: boolean;
  onSignOut: () => void;
  onOpenPlugins: () => void;
}

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
    <div className="absolute top-10 right-[-32px] z-50 w-64 bg-[#1e1f20] border border-[#3c4043] rounded-xl shadow-2xl p-2 flex flex-col gap-1 text-[13px] animate-[popupSlideIn_0.15s_ease-out]">
      <div className="flex flex-col gap-0.5">
        {user && (
          <button
            className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[#e3e3e3] hover:bg-[#2a2b2d] transition-colors cursor-pointer border-0 bg-transparent text-[13px] font-medium text-left"
            onClick={() => {
              onOpenPlugins();
              setShowHistoryPopup(false);
            }}
          >
            <Settings2 size={16} color="var(--text-secondary)" style={{ flexShrink: 0 }} />
            <span className="truncate">MCP Plugins</span>
          </button>
        )}

        {user ? (
          <button
            className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[#e3e3e3] hover:bg-[#2a2b2d] transition-colors cursor-pointer border-0 bg-transparent text-[13px] font-medium text-left"
            onClick={() => {
              onSignOut();
              setShowHistoryPopup(false);
            }}
          >
            <LogOut size={16} color="var(--text-secondary)" style={{ flexShrink: 0 }} />
            <span className="truncate">Sign Out ({user.email})</span>
          </button>
        ) : (
          <button
            className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[#e3e3e3] hover:bg-[#2a2b2d] transition-colors cursor-pointer border-0 bg-transparent text-[13px] font-medium text-left disabled:opacity-50"
            disabled={signingIn}
            onClick={() => {
              onSignIn();
              setShowHistoryPopup(false);
            }}
          >
            <LogIn size={16} color="var(--text-secondary)" style={{ flexShrink: 0 }} />
            <span className="truncate">{signingIn ? 'Signing in...' : 'Sign In with Google'}</span>
          </button>
        )}
      </div>

      <div className="h-px bg-[#3c4043] my-1 w-full" />

      <div className="px-3 py-1 text-[11px] font-semibold text-[#8e8e8e] uppercase tracking-wider">Recent chats</div>
      <div className="flex flex-col gap-0.5 max-h-[260px] overflow-y-auto pr-0.5">
        {threads.length === 0 ? (
          <div className="px-3 py-3 text-center text-xs text-[#8e8e8e]">No chats yet</div>
        ) : (
          threads.map((t) => {
            const isCurrent = t.id === activeThreadId;
            return (
              <div
                key={t.id}
                className={`group flex items-center justify-between gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors text-[13px] border-0 bg-transparent ${
                  isCurrent ? 'bg-[#2a2b2d] text-[#e3e3e3] font-medium' : 'text-[#c4c7c5] hover:bg-[#2a2b2d] hover:text-[#e3e3e3]'
                }`}
                onClick={() => {
                  setActiveThreadId(t.id);
                  localStorage.setItem(LS_ACTIVE, t.id);
                  setShowHistoryPopup(false);
                }}
              >
                <AlignLeft size={16} color="var(--text-secondary)" style={{ flexShrink: 0 }} />
                <span className="truncate flex-1 text-left">{t.title}</span>
                <button
                  className="opacity-0 group-hover:opacity-100 p-1 text-[#8e8e8e] hover:text-[#ea4335] rounded transition-opacity bg-transparent border-0 cursor-pointer shrink-0"
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
