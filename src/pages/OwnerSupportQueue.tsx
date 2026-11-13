import { useCallback, useEffect, useState } from 'react';
import { supportReviewRequest, SupportReviewError } from '../adapters/supportReviewApi';
import type { SupportReviewTicket } from '../adapters/supportReviewApi';

const DELIVERY_LABELS: Record<string, string> = { prepared: 'Черновик', approved: 'Одобрено, ожидает отправки', sending: 'Отправляется', sent: 'Отправлено', error: 'Ошибка доставки', unknown: 'Результат доставки неизвестен — не повторять' };

function TicketCard({ ticket, token, reload }: { ticket: SupportReviewTicket; token: string; reload: () => Promise<void> }) {
  const [text, setText] = useState(ticket.review.draft_text || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const review = ticket.review;
  useEffect(() => setText(review.draft_text || ''), [review.draft_text, review.draft_version]);
  const editable = ticket.status === 'open' && ['prepared', 'error'].includes(review.delivery_status);
  const unchanged = text === review.draft_text;
  async function action(name: 'draft' | 'send' | 'reject', template = false) {
    if (busy) return;
    setBusy(true); setError('');
    try {
      await supportReviewRequest(token, `/${ticket.id}/${name}`, {
        expected_version: review.draft_version, recipient_id: ticket.user_id,
        ...(name === 'draft' && !template ? { text } : {}),
      });
      await reload();
    } catch (e) { setError(e instanceof Error ? e.message : 'Действие не выполнено.'); }
    finally { setBusy(false); }
  }
  return <article className="support-ticket" data-testid={`support-ticket-${ticket.id}`}>
    <div className="support-ticket__head"><h3>Обращение №{ticket.id}</h3><span>{DELIVERY_LABELS[review.delivery_status] || ticket.status}</span></div>
    <p className="support-muted">Получатель: Telegram ID {ticket.user_id} · {ticket.topic}</p>
    <p className="support-question">{ticket.message}</p>
    {review.scope === 'personal' && <p className="support-warning">Вопрос для личного разбора. Автоматический ответ о самочувствии не готовится.</p>}
    {!!review.sources?.length && <p className="support-muted">Материалы: {review.sources.join(', ')}</p>}
    {!!review.uncertainties?.length && <p className="support-warning">Проверить: {review.uncertainties.join('; ')}</p>}
    <label className="support-label">Ответ получателю · версия {review.draft_version}
      <textarea value={text} onChange={e => setText(e.target.value)} disabled={busy || !editable} maxLength={1500} rows={6} aria-label={`Черновик ответа №${ticket.id}`} />
    </label>
    {!unchanged && <p className="support-muted">Сначала сохраните изменения. Отправка доступна только для сохранённого текста.</p>}
    {error && <p role="alert" className="support-error">{error}</p>}
    {editable && <div className="support-actions">
      {review.scope !== 'personal' && !text && <button type="button" disabled={busy} onClick={() => action('draft', true)}>Подготовить черновик</button>}
      <button type="button" disabled={busy || !text.trim() || unchanged} onClick={() => action('draft')}>Сохранить изменения</button>
      <button type="button" className="support-primary" disabled={busy || !text.trim() || !unchanged} onClick={() => action('send')}>Отправить этот ответ</button>
      <button type="button" disabled={busy} onClick={() => action('reject')}>Отклонить</button>
    </div>}
  </article>;
}

export function OwnerSupportQueue({ token }: { token: string }) {
  const [tickets, setTickets] = useState<SupportReviewTicket[]>([]);
  const [allowed, setAllowed] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      const data = await supportReviewRequest<{ tickets: SupportReviewTicket[] }>(token);
      setTickets(data.tickets); setAllowed(true); setError('');
    } catch (e) {
      if (e instanceof SupportReviewError && [401, 403].includes(e.status)) { setAllowed(false); setTickets([]); return; }
      setError(e instanceof Error ? e.message : 'Не удалось загрузить обращения.');
    }
  }, [token]);
  useEffect(() => { void load(); }, [load]);
  if (!allowed && !error) return null;
  return <section aria-label="Очередь обращений Ольги" className="support-owner" data-testid="owner-support-queue">
    <div className="support-ticket__head"><h2>Пульт Ольги</h2><button type="button" onClick={() => void load()}>Обновить очередь</button></div>
    <p className="support-muted">Ответ отправляется только после вашего нажатия. Новых расходов на ИИ нет; черновики готовятся вручную или из шаблона.</p>
    {error && <p role="alert" className="support-error">{error}</p>}
    {!tickets.length && !error && <p>Новых обращений пока нет.</p>}
    {tickets.map(ticket => <TicketCard key={ticket.id} ticket={ticket} token={token} reload={load} />)}
  </section>;
}
