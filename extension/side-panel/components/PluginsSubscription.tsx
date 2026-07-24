import { useCallback } from 'react';
import { useAgent } from 'agents/react';

import { WORKER_URL } from '../../shared/constants';

interface PluginsSubscriptionProps {
  agentId: string;
  onMcpUpdate: (state: any) => void;
}

export function PluginsSubscription({ agentId, onMcpUpdate }: PluginsSubscriptionProps) {
  const stableOnMcpUpdate = useCallback(onMcpUpdate, []);
  useAgent({
    agent: 'ChatAgent',
    name: agentId,
    host: WORKER_URL,
    onIdentityChange: () => {},
    onMcpUpdate: stableOnMcpUpdate,
  });
  return null;
}
