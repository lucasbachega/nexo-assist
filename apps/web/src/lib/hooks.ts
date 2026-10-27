'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';

/**
 * Executa `callback` logo ao montar e depois a cada `ms`, pausando com a aba oculta.
 * Reinicia quando `restartKey` muda (ex.: filtro trocado). `ms = null` desliga.
 */
export function usePolling(callback: () => unknown, ms: number | null, restartKey: unknown = null) {
  const saved = useRef(callback);
  useEffect(() => {
    saved.current = callback;
  });

  useEffect(() => {
    if (ms === null) return;
    const tick = () => {
      if (!document.hidden) void saved.current();
    };
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, ms);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [ms, restartKey]);
}

/** Valor mais recente sempre disponível em callbacks, sem refazer efeitos. */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
