import React, { useEffect, useRef, useState } from 'react';
import { tipForDate } from './dailyTips';
export function DailyTip({ showButton }: { showButton: boolean }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(() => new Date());
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (open) closeRef.current?.focus(); }, [open]);
  useEffect(() => { if (!showButton) setOpen(false); }, [showButton]);
  const close = () => { setOpen(false); triggerRef.current?.focus(); };
  return <>
    {showButton && <button ref={triggerRef} type="button" className="ff-more-link" data-testid="open-daily-tip" onClick={() => { setDate(new Date()); setOpen(true); }}>Совет дня<span aria-hidden="true">→</span></button>}
    {open && <div className="fm-overlay" onClick={close}>
      <section role="dialog" aria-modal="true" aria-labelledby="daily-tip-title" className="fm-dialog ff-tip-dialog" onClick={e => e.stopPropagation()} onKeyDown={e => {
        if (e.key === 'Escape') close();
        if (e.key === 'Tab') { e.preventDefault(); closeRef.current?.focus(); }
      }}>
        <p className="ff-kicker">Полезно знать</p><h2 id="daily-tip-title">Совет дня</h2>
        <p>{tipForDate(date)}</p>
        <button ref={closeRef} type="button" className="ff-action" onClick={close}>Понятно, закрыть</button>
      </section>
    </div>}
  </>;
}
