import { useEffect, useMemo, useRef, useState } from 'react';
import { KetoClient } from '../../api/ketoClient';
import type { ProgressEntry, ProgressMetric, ProgressSnapshot } from '../../api/progressTypes';
import { PROGRESS_METRICS, parseProgressEntry, progressDate, progressDelta, progressNumber, progressToday } from './progressModel';
import './progress.css';

const emptyFields = (): Record<ProgressMetric, string> => ({ weight: '', chest: '', waist: '', hips: '' });

export function Progress({ sessionToken, active = true }: { sessionToken?: string; active?: boolean }) {
  const client = useMemo(() => { const api = new KetoClient(); api.setToken(sessionToken || null); return api; }, [sessionToken]);
  const [snapshot, setSnapshot] = useState<ProgressSnapshot | null>(null);
  const [age, setAge] = useState('');
  const [height, setHeight] = useState('');
  const heightEdited = useRef(false);
  const [date, setDate] = useState(progressToday);
  const [fields, setFields] = useState(emptyFields);
  const [metricId, setMetricId] = useState<ProgressMetric>('weight');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const reportError = (err: unknown) => {
    const status = (err as { status?: number })?.status;
    return status === 409 ? 'Замеры изменились в другой сессии. Обновите данные и повторите сохранение. Ваш ввод сохранён на экране.'
      : status === 401 || status === 403 ? 'Войдите заново через кнопку приложения в Telegram.'
      : status === 422 ? 'Проверьте возраст, рост, дату и значения замеров.' : 'Не удалось связаться с сервером. Введённые значения остаются на экране; попробуйте ещё раз.';
  };
  async function load() {
    if (!sessionToken) return;
    setBusy(true); setError('');
    try { const data = await client.getProgress(); if (alive.current) { setSnapshot(data); setEditingDate(null); setAge(previous => previous || (data.age == null ? '' : String(data.age))); if (!heightEdited.current) setHeight(data.height_cm == null ? '' : String(data.height_cm)); } }
    catch (err) { if (alive.current) setError(reportError(err)); }
    finally { if (alive.current) setBusy(false); }
  }
  useEffect(() => { if (active && !snapshot && sessionToken) void load(); }, [active, sessionToken]);
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!snapshot || busy) return;
    setError(''); setNotice('');
    let entry: ProgressEntry;
    let heightCm: number | null = null;
    try {
      if (!/^\d+$/.test(age) || Number(age) < 18 || Number(age) > 120) throw new Error('Укажите возраст от 18 до 120 лет.');
      const heightValue = height.trim().replace(',', '.');
      if (heightValue) {
        heightCm = Number(heightValue);
        if (!/^\d+(?:\.\d)?$/.test(heightValue) || heightCm < 80 || heightCm > 250) {
          throw new Error('Укажите рост от 80 до 250 см, например 168 или 168,5.');
        }
      }
      if (!consent) throw new Error('Подтвердите согласие на сохранение личных замеров.');
      if (snapshot.entries.some(item => item.date === date) && editingDate !== date) throw new Error('За эту дату уже есть замер. Откройте его кнопкой «Изменить» в истории, чтобы сохранить прежние значения.');
      entry = parseProgressEntry(date, fields);
    } catch (err) { setError((err as Error).message); return; }
    setBusy(true);
    try {
      const data = await client.saveProgress({ age: Number(age), ...(heightEdited.current ? { height_cm: heightCm } : {}), entry, expected_revision: snapshot.revision, consent: true });
      if (alive.current) { setSnapshot(data); setHeight(data.height_cm == null ? '' : String(data.height_cm)); heightEdited.current = false; setNotice('Замеры сохранены.'); setEditingDate(date); setPendingDelete(null); }
    } catch (err) { if (alive.current) setError(reportError(err)); }
    finally { if (alive.current) setBusy(false); }
  }
  async function remove() {
    if (!pendingDelete || !snapshot || busy) return;
    setBusy(true); setError(''); setNotice('');
    try { const data = await client.deleteProgress(pendingDelete, snapshot.revision); if (alive.current) { setSnapshot(data); setEditingDate(null); setPendingDelete(null); setNotice('Запись удалена.'); } }
    catch (err) { if (alive.current) setError(reportError(err)); }
    finally { if (alive.current) setBusy(false); }
  }
  const entries = [...(snapshot?.entries || [])].sort((a, b) => b.date.localeCompare(a.date));
  const metric = PROGRESS_METRICS.find(item => item.id === metricId)!;
  const measurements = [...entries].reverse().flatMap(entry => {
    const value = entry[metricId];
    return value === null ? [] : [{ date: entry.date, value }];
  });
  const lowest = Math.min(...measurements.map(entry => entry.value));
  const highest = Math.max(...measurements.map(entry => entry.value));
  const valueRange = Math.max(1, highest - lowest);
  const first = measurements[0];
  const last = measurements[measurements.length - 1];
  const firstTime = first ? Date.parse(first.date) : 0;
  const timeRange = last ? Math.max(1, Date.parse(last.date) - firstTime) : 1;
  const points = measurements.map(({ date, value }) => ({
    x: 12 + (Date.parse(date) - firstTime) * 276 / timeRange,
    y: 105 - (value - lowest) * 85 / valueRange,
  }));
  return <section className="ff-more progress" data-testid="progress-screen">
    <h1>Мой прогресс</h1>
    <p>Вес и объёмы по датам. Сравнивайте свои замеры в похожих условиях, без оценки «хорошо» или «плохо».</p>
    {!sessionToken ? <p role="alert">Откройте приложение через Telegram, чтобы сохранять личные замеры.</p> : <>
      {error && <div role="alert"><p>{error}</p><button type="button" disabled={busy} onClick={() => void load()}>Обновить данные</button></div>}
      <p role="status" aria-live="polite">{busy ? 'Сохраняем или загружаем данные…' : notice}</p>
      <form ref={formRef} onSubmit={save} aria-label="Новый замер">
        <h2>Добавить или исправить замер</h2>
        <div className="progress-fields">
          <label>Возраст, лет<input name="age" inputMode="numeric" value={age} onChange={e => setAge(e.target.value)} required maxLength={3} disabled={busy} /></label>
          <label>Рост, см<input name="height_cm" inputMode="decimal" value={height} onChange={e => { heightEdited.current = true; setHeight(e.target.value); }} placeholder="Необязательно" maxLength={5} disabled={busy} /></label>
          <label>Дата замера<input name="date" type="date" min="1900-01-01" max={progressToday()} value={date} onChange={e => { setDate(e.target.value); setEditingDate(null); }} required disabled={busy} /></label>
          {PROGRESS_METRICS.map(({ id, label, unit }) => <label key={id}>{label}, {unit}<input name={id} inputMode="decimal" value={fields[id]} onChange={e => setFields(previous => ({ ...previous, [id]: e.target.value }))} placeholder="Необязательно" disabled={busy} /></label>)}
        </div>
        <p>Достаточно одного замера. Повторное сохранение той же даты заменит запись целиком; оставьте в форме все значения, которые хотите сохранить.</p>
        {entries.some(e => e.date === date) && editingDate !== date && <p>За эту дату уже есть замер. Для заполнения формы нажмите «Изменить» в истории.</p>}
        <label className="progress-consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} disabled={busy} />Я согласен сохранять возраст, рост, вес и объёмы в моём аккаунте «КетоБаланс» для отслеживания изменений. Записи можно удалить.</label>
        <button className="ff-action" type="submit" disabled={busy || !snapshot || !consent}>Сохранить замер</button>
      </form>
      <section aria-label="Изменения с первого замера"><h2>Изменения с первого замера</h2>
        <div className="progress-summary">{PROGRESS_METRICS.map(({ id, label, unit }) => { const change = progressDelta(entries, id); return <div key={id}><h3>{label}</h3>{change ? <><strong>{change.delta > 0 ? '+' : ''}{progressNumber(change.delta)} {unit}</strong><p>{progressNumber(change.first)} → {progressNumber(change.latest)} {unit}</p></> : <p>Нужны два замера</p>}</div>; })}</div>
      </section>
      {entries.length > 0 && <section className="progress-chart">
        <h2>График замеров</h2>
        <label>Показатель
          <select value={metricId} onChange={event => setMetricId(event.target.value as ProgressMetric)}>
            {PROGRESS_METRICS.map(({ id, label, unit }) => <option key={id} value={id}>{label}, {unit}</option>)}
          </select>
        </label>
        {measurements.length >= 2 ? <figure>
          <figcaption>{metric.label}: {progressNumber(first.value)} → {progressNumber(last.value)} {metric.unit}</figcaption>
          <svg viewBox="0 0 300 120" role="img" aria-label={`Динамика: ${metric.label}. Точные значения в истории замеров.`}>
            <polyline points={points.map(({ x, y }) => `${x},${y}`).join(' ')} fill="none" stroke="currentColor" strokeWidth="3" />
            {points.map(({ x, y }, index) => <circle key={measurements[index].date} cx={x} cy={y} r="3.5" fill="currentColor" />)}
          </svg>
          <div className="progress-chart-dates"><time dateTime={first.date}>{progressDate(first.date)}</time><time dateTime={last.date}>{progressDate(last.date)}</time></div>
        </figure> : <p>Добавьте хотя бы два замера выбранного показателя.</p>}
      </section>}
      <section><h2>История замеров</h2>
        {!entries.length ? <p>Пока нет записей. Добавьте первый замер — он станет точкой отсчёта.</p> : <div className="progress-history">{entries.map(entry => <article key={entry.date} aria-label={`Замер ${progressDate(entry.date)}`}>
          <h3>{progressDate(entry.date)}</h3><dl>{PROGRESS_METRICS.map(({ id, label, unit }) => <div key={id}><dt>{label}</dt><dd>{entry[id] == null ? '—' : `${progressNumber(entry[id]!)} ${unit}`}</dd></div>)}</dl>
          <div className="progress-actions"><button type="button" disabled={busy} onClick={() => { setDate(entry.date); setEditingDate(entry.date); setFields(Object.fromEntries(PROGRESS_METRICS.map(({ id }) => [id, entry[id] == null ? '' : String(entry[id])])) as Record<ProgressMetric, string>); setNotice('Запись открыта для редактирования.'); formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>Изменить</button><button type="button" disabled={busy} onClick={() => setPendingDelete(entry.date)}>Удалить</button></div>
        </article>)}</div>}
      </section>
      {pendingDelete && <div className="progress-delete" role="alertdialog" aria-labelledby="progress-delete-title"><h2 id="progress-delete-title">Удалить замер за {progressDate(pendingDelete)}?</h2><p>Восстановить запись после удаления нельзя.</p><div className="progress-actions"><button type="button" disabled={busy} onClick={() => void remove()}>Да, удалить запись</button><button type="button" disabled={busy} onClick={() => setPendingDelete(null)}>Отмена</button></div></div>}
    </>}
  </section>;
}
