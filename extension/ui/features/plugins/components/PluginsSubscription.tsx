import { useCallback, useMemo } from 'react';
import { useAgent } from 'agents/react';

import { WORKER_URL } from '../../../../shared/constants';

/** Props for the PluginsSubscription component. */
interface PluginsSubscriptionProps {
  agentId: string;
  onMcpUpdate: (state: any) => void;
}

const NOOP = () => {};

/** Subscribes to MCP plugin updates for a given agent via the Agents SDK. */
export function PluginsSubscription({ agentId, onMcpUpdate }: PluginsSubscriptionProps) {
  const asyncQuery = useCallback(async () => {
    const snapshot: { jwt?: string } = await new Promise((resolve) =>
      chrome.runtime.sendMessage({ type: 'auth:snapshot' }, resolve)
    );
    return { token: snapshot?.jwt || '' };
  }, []);

  const agentOptions = useMemo(() => ({
    agent: 'UserAgent',
    name: agentId,
    host: WORKER_URL,
    query: asyncQuery,
    onIdentityChange: NOOP,
    onMcpUpdate,
  }), [agentId, onMcpUpdate, asyncQuery]);

  useAgent(agentOptions);
  return null;
}
