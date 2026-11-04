import React, { useEffect, useRef, useState } from 'react';
import { dayKey, STORAGE_KEY, tipForDate } from './dailyTips';

export function DailyTip({ showButton }: { showButton: boolean }) {
  const [date, setDate] = useState(() => new Date());
  const [open, setOpen] = useState(false);
  const dismissed = useRef('');
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const check = () => {
      const now = new Date(); const key = dayKey(now);
      setDate(now);
      let saved = '';
      try { saved = localStorage.getItem(STORAGE_KEY) || ''; } catch { /* session fallback */ }
      if (saved !== key && dismissed.current !== key) setOpen(true);
    };
    check();
    const onVisible = () => { if (!document.hidden) check(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', check);
    const timer = window.setInterval(check, 60000);
    return () => { document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('focus', check); window.clearInterval(timer); };
  }, []);
  useEffect(() => { if (open) closeRef.current?.focus(); }, [open]);
  const close = () => {
    const key = dayKey(new Date()); dismissed.current = key;
    try { localStorage.setItem(STORAGE_KEY, key); } catch { /* remain dismissed this session */ }
    setOpen(false);
  };
  return <>
    {showButton && <button type="button" onClick={() => { setDate(new Date()); setOpen(true); }} className="w-full text-left bg-white rounded-2xl p-4 border border-stone-200 font-semibold text-stone-800" data-testid="open-daily-tip">💡 Совет дня</button>}
    {open && <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 p-3" role="presentation" onClick={close}>
      <section role="dialog" aria-modal="true" aria-labelledby="daily-tip-title" className="w-full max-w-md rounded-3xl bg-[#FDFBF6] p-6 shadow-xl text-stone-900" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape') close(); }}>
        <div className="text-3xl mb-3" aria-hidden="true">💡</div><h2 id="daily-tip-title" className="text-xl font-bold">Совет дня</h2>
        <p className="mt-3 text-base leading-relaxed">{tipForDate(date)}</p>
        <button ref={closeRef} type="button" onClick={close} className="mt-6 w-full rounded-xl bg-[#5F7161] px-4 py-3 font-semibold text-white">Понятно, закрыть</button>
      </section>
    </div>}
  </>;
}
