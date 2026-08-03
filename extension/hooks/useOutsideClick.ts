import { useEffect } from 'react';
import type { RefObject } from 'react';

export function useOutsideClick<T extends HTMLElement>(refs: RefObject<T | null>[], onOutsideClick: () => void) {
  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const inside = refs.some((ref) => ref.current?.contains(target));
      if (!inside) onOutsideClick();
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [refs, onOutsideClick]);
}
