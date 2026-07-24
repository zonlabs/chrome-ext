export function ChatSkeleton() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      background: 'var(--bg-primary, #131314)',
      padding: '16px',
      boxSizing: 'border-box'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        height: '40px',
        marginBottom: '20px',
        width: '100%'
      }}>
        <div className="skeleton-glow" style={{ width: '80px', height: '14px', borderRadius: '7px' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div className="skeleton-glow" style={{ width: '80px', height: '14px', borderRadius: '7px' }} />
        </div>
      </div>

      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        width: '100%',
        overflow: 'hidden'
      }}>
        <div className="skeleton-glow" style={{ flex: '0 0 55%', borderRadius: '16px', width: '100%' }} />
        <div className="skeleton-glow" style={{ flex: '0 0 25%', borderRadius: '16px', width: '100%' }} />
      </div>
    </div>
  );
}
