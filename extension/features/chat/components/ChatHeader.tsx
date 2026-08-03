import { useCallback } from 'react';
import { MoreVertical, PictureInPicture2, SquarePen } from 'lucide-react';
import { browser } from 'wxt/browser';
import { HistoryPopup } from './HistoryPopup';

interface ChatHeaderProps {
  title?: string;
  activeThreadId: string | null;
  threads: Array<{ id: string; title: string; createdAt: number }>;
  setActiveThreadId: (id: string | null) => void;
  showHistoryPopup: boolean;
  setShowHistoryPopup: (show: boolean) => void;
  historyRef: React.RefObject<HTMLDivElement | null>;
  onNewChat: () => void;
  onDeleteThread: (id: string) => void;
  user: any;
  onSignIn: () => void;
  signingIn?: boolean;
  onSignOut: () => void;
  onOpenPlugins: () => void;
}

export function ChatHeader(props: ChatHeaderProps) {
  const popoutMode = new URLSearchParams(window.location.search).has('popout');
  const togglePopout = useCallback(() => {
    if (popoutMode) {
      const tabId = Number(new URLSearchParams(window.location.search).get('tabId'));
      if (tabId) browser.runtime.sendMessage({ type: 'sidePanel:open', tabId }).then(() => window.close()).catch(() => {});
      else window.close();
      return;
    }
    void browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      const tabId = tabs[0]?.id;
      if (!tabId) return;
      window.open(browser.runtime.getURL(`/sidepanel.html?popout=true&tabId=${tabId}`), 'Obot', 'width=450,height=600,menubar=no,toolbar=no,location=no,status=no');
      window.close();
    });
  }, [popoutMode]);

  return (
    <header
      id="header"
      className="flex flex-shrink-0 items-center justify-between px-4 py-3"
      style={{
        background:
          'linear-gradient(to bottom, rgba(19, 19, 20, 0) 0%, var(--bg-primary) 100%), linear-gradient(to right, var(--bg-primary) 40%, #250d0d 100%)',
      }}
    >
      <div className="header-title-container flex min-w-0 flex-1 items-center gap-2">
        {props.title && (
          <span
            className="brand font-medium text-sm bg-gradient-to-r from-[#f07060] from-60% to-white bg-clip-text text-transparent"
            title={props.title}
            style={{ maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {props.title}
          </span>
        )}
      </div>
      <div className="header-actions flex items-center gap-2">
        <button
          className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-secondary,#c4c7c5)] hover:bg-[var(--bg-hover,#2a2b2d)] hover:text-[var(--text-primary,#e3e3e3)] transition-colors bg-transparent border-0 cursor-pointer"
          title="New Chat"
          onClick={props.onNewChat}
        >
          <SquarePen size={18} />
        </button>
        <div style={{ position: 'relative' }} ref={props.historyRef}>
          <button
            className={`w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-secondary,#c4c7c5)] hover:bg-[var(--bg-hover,#2a2b2d)] hover:text-[var(--text-primary,#e3e3e3)] transition-colors bg-transparent border-0 cursor-pointer ${
              props.showHistoryPopup ? 'bg-[var(--bg-hover,#2a2b2d)] text-[var(--text-primary,#e3e3e3)]' : ''
            }`}
            title="Menu"
            onClick={() => props.setShowHistoryPopup(!props.showHistoryPopup)}
          >
            <MoreVertical size={18} />
          </button>
          {props.showHistoryPopup && (
            <HistoryPopup
              threads={props.threads}
              activeThreadId={props.activeThreadId ?? ''}
              setActiveThreadId={props.setActiveThreadId}
              setShowHistoryPopup={props.setShowHistoryPopup}
              onDeleteThread={props.onDeleteThread}
              user={props.user}
              onSignIn={props.onSignIn}
              signingIn={props.signingIn}
              onSignOut={props.onSignOut}
              onOpenPlugins={props.onOpenPlugins}
            />
          )}
        </div>
        {props.user &&
          (props.user.picture ? (
            <img className="w-6 h-6 rounded-full object-cover flex-shrink-0" src={props.user.picture} alt="" title={props.user.name} />
          ) : (
            <div className="w-6 h-6 rounded-full bg-[var(--accent-blue,#ff8a80)] text-white flex items-center justify-center text-[12px] font-semibold flex-shrink-0" title={props.user.name}>
              {props.user.name?.charAt(0).toUpperCase() || '?'}
            </div>
          ))}
        <button
          className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-secondary,#c4c7c5)] hover:bg-[var(--bg-hover,#2a2b2d)] hover:text-[var(--text-primary,#e3e3e3)] transition-colors bg-transparent border-0 cursor-pointer"
          title={popoutMode ? 'Attach to sidebar' : 'Pop out chat'}
          onClick={togglePopout}
        >
          <PictureInPicture2 size={18} />
        </button>
      </div>
    </header>
  );
}
