import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Settings2 } from 'lucide-react';
import { WORKER_URL } from '../../../lib/constants';

type Plugin = { id: string; name: string; url: string; state?: string };

type PluginIconProps = {
  plugin: Plugin;
  className: string;
  fallbackClassName: string;
};

function getFaviconUrl(plugin: Plugin): string {
  try {
    const hostname = new URL(plugin.url).hostname;
    return hostname ? `${WORKER_URL}/api/favicon?hostname=${hostname}` : '';
  } catch {
    return '';
  }
}

function PluginIcon({ plugin, className, fallbackClassName }: PluginIconProps) {
  const faviconUrl = getFaviconUrl(plugin);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [faviconUrl]);

  if (!faviconUrl || failed) {
    return (
      <span className={fallbackClassName} aria-hidden="true">
        {plugin.name.trim().charAt(0).toUpperCase() || '?'}
      </span>
    );
  }

  return (
    <img
      src={faviconUrl}
      alt=""
      className={className}
      onError={() => setFailed(true)}
    />
  );
}

export function ChatPluginBar({
  user,
  availablePlugins = [],
  disabledPlugins = [],
  onTogglePlugin,
}: {
  user: any;
  availablePlugins?: Plugin[];
  disabledPlugins?: string[];
  onTogglePlugin?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const enabled = useMemo(
    () => availablePlugins.filter(plugin => !disabledPlugins.includes(plugin.id)),
    [availablePlugins, disabledPlugins],
  );

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (open && ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  if (!user) return null;

  return (
    <div className="flex justify-between items-center px-3.5 mb-1.5 shrink-0">
      <div className="flex flex-wrap gap-1.5 items-center">
        {enabled.slice(0, 2).map(plugin => (
          <div key={plugin.id} className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-secondary)]" title={`Plugin: ${plugin.name}`}>
            <PluginIcon plugin={plugin} className="w-3.5 h-3.5 rounded object-cover shrink-0" fallbackClassName="w-3.5 h-3.5 rounded bg-[var(--text-muted)] text-white text-[9px] font-bold flex items-center justify-center shrink-0" />
            <span className="whitespace-nowrap max-w-[80px] overflow-hidden text-ellipsis">{plugin.name}</span>
          </div>
        ))}
        {enabled.length > 2 && (
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-secondary)]" title={`${enabled.length - 2} more plugins enabled`}>
            <span>+{enabled.length - 2}</span>
          </div>
        )}
      </div>

      <div className="relative" ref={ref}>
        <button
          type="button"
          className={`inline-flex items-center justify-center bg-transparent border-none text-[var(--text-muted)] cursor-pointer p-1.5 rounded-md transition-colors duration-150 hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] ${open ? 'active' : ''}`}
          onClick={() => setOpen(current => !current)}
          title="Configure Plugins"
          aria-expanded={open}
        >
          <Settings2 size={18} />
        </button>

        {open && (
          <div className="absolute bottom-[calc(100%+8px)] right-0 bg-[rgba(30,31,32,0.85)] backdrop-blur-[16px] border border-[rgba(255,255,255,0.08)] rounded-[12px] w-[220px] z-[1000] shadow-[0_8px_32px_rgba(0,0,0,0.5)] py-2 flex flex-col animate-[popupSlideIn_.2s_cubic-bezier(0.16,1,0.3,1)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-muted)] px-3.5 pt-2 pb-1">Plugin Access</div>
            <div className="flex flex-col">
              {availablePlugins.length === 0 ? (
                <div className="px-3.5 py-3 text-[12px] text-[var(--text-muted)] text-center">No plugins connected</div>
              ) : (
                availablePlugins.map(plugin => {
                  const enabledPlugin = !disabledPlugins.includes(plugin.id);
                  const statusColor =
                    plugin.state === 'ready' ? 'text-[#2ecc71]'
                    : plugin.state === 'connecting' || plugin.state === 'authenticating' ? 'text-[#f1c40f]'
                    : plugin.state === 'failed' || plugin.state === 'error' ? 'text-[#e74c3c]'
                    : '';
                  return (
                    <button
                      key={plugin.id}
                      type="button"
                      className="flex items-center justify-between w-full border-0 bg-transparent text-left px-3.5 py-2 cursor-pointer transition-colors duration-150 hover:bg-[var(--bg-hover)]"
                      onClick={() => onTogglePlugin?.(plugin.id)}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <PluginIcon plugin={plugin} className="w-[18px] h-[18px] rounded object-cover shrink-0" fallbackClassName="w-[18px] h-[18px] rounded bg-[var(--text-muted)] text-white text-[11px] font-bold flex items-center justify-center shrink-0" />
                        <span className="text-[13px] text-[var(--text-primary)] whitespace-nowrap overflow-hidden text-ellipsis">{plugin.name}</span>
                        {plugin.state && (
                          <span className={`text-[10px] font-medium capitalize ml-1.5 inline-block leading-[1.3] ${statusColor}`}>
                            {plugin.state}
                          </span>
                        )}
                      </div>
                      <div className={`w-4 h-4 rounded border-[1.5px] border-[var(--border-color)] flex items-center justify-center shrink-0 ml-3 transition-colors duration-150 ${enabledPlugin ? 'bg-[#ea4335] border-[#ea4335]' : ''}`}>
                        {enabledPlugin && <Check size={10} strokeWidth={4} color="#ffffff" />}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
