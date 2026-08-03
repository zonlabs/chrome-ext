import { useCallback } from 'react';
import { MoreVertical, PictureInPicture2, SquarePen } from 'lucide-react';
import { browser } from 'wxt/browser';
import { HistoryPopup } from './HistoryPopup';
import '../../../assets/shell.css';

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
            className="brand text-[var(--text-primary)]"
            title={props.title}
            style={{ maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {props.title}
          </span>
        )}
      </div>
      <div className="header-actions flex items-center gap-2">
        <button className="header-icon-btn" title="New Chat" onClick={props.onNewChat}>
          <SquarePen size={18} />
        </button>
        <div style={{ position: 'relative' }} ref={props.historyRef}>
          <button
            className={`header-icon-btn ${props.showHistoryPopup ? 'active' : ''}`}
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
            <img className="header-avatar-img" src={props.user.picture} alt="" title={props.user.name} />
          ) : (
            <div className="header-avatar" title={props.user.name}>
              {props.user.name?.charAt(0).toUpperCase() || '?'}
            </div>
          ))}
        <button className="header-icon-btn" title={popoutMode ? 'Attach to sidebar' : 'Pop out chat'} onClick={togglePopout}>
          <PictureInPicture2 size={18} />
        </button>
      </div>
    </header>
  );
}
