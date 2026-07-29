import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Settings2 } from 'lucide-react';
import { WORKER_URL } from '../../shared/constants';

type Plugin = { id: string; name: string; url: string; state?: string };

/** Shared plugin chips and selector, rendered above the input in every chat state. */
export function ChatPluginBar({ user, availablePlugins = [], disabledPlugins = [], onTogglePlugin }: { user: any; availablePlugins?: Plugin[]; disabledPlugins?: string[]; onTogglePlugin?: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const enabled = useMemo(() => availablePlugins.filter(plugin => !disabledPlugins.includes(plugin.id) && (!plugin.state || plugin.state === 'ready')), [availablePlugins, disabledPlugins]);
  useEffect(() => {
    const close = (event: MouseEvent) => { if (open && ref.current && !ref.current.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  if (!user) return null;
  return <div className="chat-plugins-bar">
    <div className="chat-plugins-active-list">
      {enabled.slice(0, 2).map(plugin => {
        const domain = (() => { try { return new URL(plugin.url).hostname; } catch { return ''; } })();
        const favicon = domain ? `${WORKER_URL}/api/favicon?hostname=${domain}` : '';
        return <div key={plugin.id} className="active-plugin-tag" title={`Plugin: ${plugin.name}`}>
          {favicon ? <img src={favicon} alt="" className="active-plugin-favicon" onError={event => { event.currentTarget.style.display = 'none'; }} /> : null}
          {!favicon && <span className="active-plugin-fallback-icon" style={{ background: 'transparent' }}>{plugin.name.charAt(0).toUpperCase()}</span>}
          <span className="active-plugin-name">{plugin.name}</span>
        </div>;
      })}
      {enabled.length > 2 && <div className="active-plugin-tag remaining-count" title={`${enabled.length - 2} more plugins enabled`}><span>+{enabled.length - 2}</span></div>}
    </div>
    <div style={{ position: 'relative' }} ref={ref}>
      <button className={`chat-plugins-btn ${open ? 'active' : ''}`} onClick={() => setOpen(!open)} title="Configure Plugins"><Settings2 size={18} /></button>
      {open && <div className="plugins-selector-popup">
        <div className="plugins-selector-header">Plugin Access</div>
        <div className="plugins-selector-list">{availablePlugins.length === 0 ? <div className="plugins-selector-empty">No plugins connected</div> : availablePlugins.map(plugin => {
          const enabledPlugin = !disabledPlugins.includes(plugin.id);
          const domain = (() => { try { return new URL(plugin.url).hostname; } catch { return ''; } })();
          const favicon = domain ? `${WORKER_URL}/api/favicon?hostname=${domain}` : '';
          return <button key={plugin.id} type="button" className="plugins-selector-item" onClick={() => onTogglePlugin?.(plugin.id)}><div className="plugins-selector-item-left">{favicon && <img src={favicon} alt="" className="plugins-selector-favicon" />}<span className="plugins-selector-name">{plugin.name}</span>{plugin.state && <span className={`plugins-selector-status plugins-status-${plugin.state}`}>{plugin.state}</span>}</div><div className={`plugins-selector-checkbox ${enabledPlugin ? 'checked' : ''}`}>{enabledPlugin && <Check size={10} strokeWidth={4} color="#ffffff" />}</div></button>;
        })}</div>
      </div>}
    </div>
  </div>;
}