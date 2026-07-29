import React, { useCallback } from 'react';
import { MoreVertical, PictureInPicture2, SquarePen } from 'lucide-react';
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

/** Shared navigation chrome for both empty and thread-bound chat states. */
export function ChatHeader(props: ChatHeaderProps) {
  const popoutMode = new URLSearchParams(window.location.search).has('popout');
  const togglePopout = useCallback(() => {
    if (popoutMode) {
      const tabId = Number(new URLSearchParams(window.location.search).get('tabId'));
      if (tabId) chrome.runtime.sendMessage({ type: 'sidePanel:open', tabId }, () => window.close());
      else window.close();
      return;
    }
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (!tabId) return;
      window.open(chrome.runtime.getURL(`side-panel/index.html?popout=true&tabId=${tabId}`), 'Obot', 'width=450,height=600,menubar=no,toolbar=no,location=no,status=no');
      window.close();
    });
  }, [popoutMode]);

  return <header id="header">
    <div className="header-title-container" style={{ flex: 1, minWidth: 0 }}>
      {props.title && <span className="brand" title={props.title} style={{ maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{props.title}</span>}
    </div>
    <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <button className="header-icon-btn" title="New Chat" onClick={props.onNewChat}><SquarePen size={18} /></button>
      <div style={{ position: 'relative' }} ref={props.historyRef}>
        <button className={`header-icon-btn ${props.showHistoryPopup ? 'active' : ''}`} title="Menu" onClick={() => props.setShowHistoryPopup(!props.showHistoryPopup)}><MoreVertical size={18} /></button>
        {props.showHistoryPopup && <HistoryPopup threads={props.threads} activeThreadId={props.activeThreadId ?? ''} setActiveThreadId={props.setActiveThreadId} setShowHistoryPopup={props.setShowHistoryPopup} onDeleteThread={props.onDeleteThread} user={props.user} onSignIn={props.onSignIn} signingIn={props.signingIn} onSignOut={props.onSignOut} onOpenPlugins={props.onOpenPlugins} />}
      </div>
      {props.user && (props.user.picture ? <img className="header-avatar-img" src={props.user.picture} alt="" title={props.user.name} /> : <div className="header-avatar" title={props.user.name}>{props.user.name?.charAt(0).toUpperCase() || '?'}</div>)}
      <button className="header-icon-btn" title={popoutMode ? 'Attach to sidebar' : 'Pop out chat'} onClick={togglePopout}><PictureInPicture2 size={18} /></button>
    </div>
  </header>;
}