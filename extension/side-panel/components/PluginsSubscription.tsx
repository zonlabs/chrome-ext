import { useMemo } from 'react';
import { useAgent } from 'agents/react';

import { WORKER_URL } from '../../shared/constants';

/** Props for the PluginsSubscription component. */
interface PluginsSubscriptionProps {
  agentId: string;
  onMcpUpdate: (state: any) => void;
}

const NOOP = () => {};

/** Subscribes to MCP plugin updates for a given agent via the Agents SDK. */
export function PluginsSubscription({ agentId, onMcpUpdate }: PluginsSubscriptionProps) {
  const agentOptions = useMemo(() => ({
    agent: 'Orchestrator',
    name: agentId,
    host: WORKER_URL,
    onIdentityChange: NOOP,
    onMcpUpdate,
  }), [agentId, onMcpUpdate]);

  useAgent(agentOptions);
  return null;
}
