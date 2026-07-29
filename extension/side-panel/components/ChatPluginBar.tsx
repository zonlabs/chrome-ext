import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Settings2 } from 'lucide-react';
import { WORKER_URL } from '../../shared/constants';

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

/** Shared plugin chips and selector, rendered above the input in every chat state. */
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
    <div className="chat-plugins-bar">
      <div className="chat-plugins-active-list">
        {enabled.slice(0, 2).map(plugin => (
          <div key={plugin.id} className="active-plugin-tag" title={`Plugin: ${plugin.name}`}>
            <PluginIcon plugin={plugin} className="active-plugin-favicon" fallbackClassName="active-plugin-fallback-icon" />
            <span className="active-plugin-name">{plugin.name}</span>
          </div>
        ))}
        {enabled.length > 2 && (
          <div className="active-plugin-tag remaining-count" title={`${enabled.length - 2} more plugins enabled`}>
            <span>+{enabled.length - 2}</span>
          </div>
        )}
      </div>

      <div className="chat-plugins-selector" ref={ref}>
        <button
          type="button"
          className={`chat-plugins-btn ${open ? 'active' : ''}`}
          onClick={() => setOpen(current => !current)}
          title="Configure Plugins"
          aria-expanded={open}
        >
          <Settings2 size={18} />
        </button>

        {open && (
          <div className="plugins-selector-popup">
            <div className="plugins-selector-header">Plugin Access</div>
            <div className="plugins-selector-list">
              {availablePlugins.length === 0 ? (
                <div className="plugins-selector-empty">No plugins connected</div>
              ) : (
                availablePlugins.map(plugin => {
                  const enabledPlugin = !disabledPlugins.includes(plugin.id);
                  return (
                    <button
                      key={plugin.id}
                      type="button"
                      className="plugins-selector-item"
                      onClick={() => onTogglePlugin?.(plugin.id)}
                    >
                      <div className="plugins-selector-item-left">
                        <PluginIcon plugin={plugin} className="plugins-selector-favicon" fallbackClassName="plugins-selector-fallback-icon" />
                        <span className="plugins-selector-name">{plugin.name}</span>
                        {plugin.state && (
                          <span className={`plugins-selector-status plugins-status-${plugin.state}`}>
                            {plugin.state}
                          </span>
                        )}
                      </div>
                      <div className={`plugins-selector-checkbox ${enabledPlugin ? 'checked' : ''}`}>
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