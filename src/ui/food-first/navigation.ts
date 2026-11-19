import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { ScreenId } from './contract';

export interface NavigationEntry { screen: ScreenId; recipeId?: string; scrollY: number }
export interface NavigationMemory { current: NavigationEntry[] | null }
export function parentScreen(screen: ScreenId): ScreenId {
  if (screen === 'recipe') return 'menu';
  if (['support', 'access', 'diary'].includes(screen)) return 'more';
  return 'today';
}
export function backEntries(entries: NavigationEntry[]): NavigationEntry[] {
  if (entries.length > 1) return entries.slice(0, -1);
  const screen = entries[0]?.screen || 'today';
  return [{ screen: parentScreen(screen), scrollY: 0 }];
}

// Memory belongs to the current PilotApp session, never browser history or another user.
export function useAppNavigation(initial: { screen: ScreenId; recipeId?: string }, memory?: NavigationMemory) {
  const [entries, setEntries] = useState<NavigationEntry[]>(() => memory?.current || [{ ...initial, scrollY: 0 }]);
  const entriesRef = useRef(entries);
  const current = entries[entries.length - 1];
  const saveScroll = useCallback(() => {
    const next = entriesRef.current.map((entry, index, list) => index === list.length - 1
      ? { ...entry, scrollY: window.scrollY } : entry);
    entriesRef.current = next;
    if (memory) memory.current = next;
    return next;
  }, [memory]);
  const change = useCallback((next: NavigationEntry[]) => {
    entriesRef.current = next;
    if (memory) memory.current = next;
    setEntries(next);
  }, [memory]);
  const navigateTo = useCallback((screen: ScreenId, recipeId?: string) => {
    const prev = saveScroll();
    const last = prev[prev.length - 1];
    if (last.screen === screen && last.recipeId === recipeId) return;
    change([...prev, { screen, recipeId, scrollY: 0 }]);
  }, [saveScroll, change]);
  const navigateBack = useCallback(() => change(backEntries(saveScroll())), [saveScroll, change]);
  useLayoutEffect(() => {
    window.scrollTo({ top: current.scrollY, behavior: 'instant' as ScrollBehavior });
  }, [entries]);
  return { entries, current, navigateTo, navigateBack, saveScroll };
}
