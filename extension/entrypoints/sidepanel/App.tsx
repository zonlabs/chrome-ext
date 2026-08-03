import { Suspense } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../../lib/query-client';
import { AuthProvider, useAuth } from '../../lib/auth-provider';
import { AgentProvider } from '../../lib/agent';
import { getPluginsAgentId } from '../../lib/agent-id';

function Shell() {
  const { user, authLoading, signingIn, signIn } = useAuth();
  const pluginsAgentId = getPluginsAgentId(user);

  return (
    <AgentProvider key={pluginsAgentId} agentId={pluginsAgentId}>
      <main
        style={{
          minHeight: '100vh',
          background: '#131314',
          color: '#e3e3e3',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          padding: 24,
          fontFamily: 'Inter, sans-serif',
          textAlign: 'center',
        }}
      >
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Obot</h1>
        {authLoading ? (
          <p style={{ margin: 0, fontSize: 13, opacity: 0.7 }}>Loading&hellip;</p>
        ) : user ? (
          <p style={{ margin: 0, fontSize: 13, opacity: 0.7 }}>Signed in as {user.email}</p>
        ) : (
          <button
            onClick={() => void signIn()}
            disabled={signingIn}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: '#8ab4f8',
              color: '#131314',
              fontWeight: 600,
              cursor: signingIn ? 'default' : 'pointer',
            }}
          >
            {signingIn ? 'Signing in&hellip;' : 'Sign in with Google'}
          </button>
        )}
        <p style={{ margin: 0, fontSize: 12, opacity: 0.5, maxWidth: 320, lineHeight: 1.5 }}>
          The full UI lands in Stage 4.
        </p>
      </main>
    </AgentProvider>
  );
}

export default function App() {
  return (
    <Suspense fallback={null}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Shell />
        </AuthProvider>
      </QueryClientProvider>
    </Suspense>
  );
}
