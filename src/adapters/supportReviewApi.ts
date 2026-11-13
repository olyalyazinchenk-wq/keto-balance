import { fetchWithTimeout } from '../api/fetchWithTimeout';

export interface SupportReviewTicket {
  id: number;
  user_id: number;
  topic: string;
  message: string;
  status: 'open' | 'answered' | 'rejected';
  created_at: string;
  review: {
    recipient_id: number;
    draft_text: string;
    draft_version: number;
    delivery_status: 'prepared' | 'approved' | 'sending' | 'sent' | 'error' | 'unknown';
    scope: 'application' | 'personal';
    sources: string[];
    uncertainties: string[];
  };
}

export class SupportReviewError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function supportReviewRequest<T>(token: string, suffix = '', body?: Record<string, unknown>): Promise<T> {
  const response = await fetchWithTimeout(`/api/admin/support${suffix}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new SupportReviewError(response.status,
    response.status === 409 ? 'Обращение уже изменилось. Обновите карточку и проверьте ответ ещё раз.' :
    response.status === 401 ? 'Войдите в приложение заново.' :
    typeof data.detail === 'string' ? data.detail : 'Не удалось выполнить действие. Обновите очередь.');
  return data as T;
}
