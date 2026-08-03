import { useState } from 'react';

export function usePopout(): { isPopout: boolean } {
  const [isPopout] = useState(() => new URLSearchParams(window.location.search).has('popout'));
  return { isPopout };
}
