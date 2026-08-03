import { useState } from 'react';

export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [stored, setStored] = useState<T>(() => {
    if (typeof localStorage === 'undefined') return initialValue;
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return initialValue;
      const parsed = JSON.parse(raw) as T;
      return parsed === null ? initialValue : parsed;
    } catch {
      return initialValue;
    }
  });

  const setValue = (value: T | ((prev: T) => T)) => {
    setStored((prev) => {
      const next = typeof value === 'function' ? (value as (prev: T) => T)(prev) : value;
      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem(key, JSON.stringify(next));
        } catch {}
      }
      return next;
    });
  };

  return [stored, setValue];
}
