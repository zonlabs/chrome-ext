/** Full-viewport skeleton placeholder shown while the chat interface loads. */
export function ChatSkeleton() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      background: 'var(--bg-primary, #131314)',
      boxSizing: 'border-box'
    }}>
      {/* Header Skeleton */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 16px',
        height: '56px',
        boxSizing: 'border-box',
        width: '100%',
        borderBottom: '1px solid var(--border-color, #3c4043)'
      }}>
        <div className="skeleton-glow" style={{ width: '120px', height: '16px', borderRadius: '8px' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="skeleton-glow" style={{ width: '28px', height: '28px', borderRadius: '50%' }} />
          <div className="skeleton-glow" style={{ width: '28px', height: '28px', borderRadius: '50%' }} />
          <div className="skeleton-glow" style={{ width: '28px', height: '28px', borderRadius: '50%' }} />
        </div>
      </div>

      {/* Messages Skeleton */}
      <div style={{
        flex: 1,
        padding: '16px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        width: '100%',
        overflow: 'hidden',
        boxSizing: 'border-box'
      }}>
        <div className="skeleton-glow" style={{ flex: 1, borderRadius: '16px', width: '100%' }} />
      </div>

      {/* Input Box Skeleton */}
      <div style={{
        padding: '0 10px 10px',
        boxSizing: 'border-box',
        width: '100%',
        flexShrink: 0
      }}>
        <div className="skeleton-glow" style={{
          height: '88px',
          borderRadius: '12px',
          width: '100%'
        }} />
      </div>
    </div>
  );
}
