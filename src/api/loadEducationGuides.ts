import { fetchWithTimeout } from './fetchWithTimeout';

export interface EducationGuide {
  id: string;
  title: string;
  category: string;
  read_time_minutes: number;
  summary: string;
  content: string;
  sources: string[];
  verified_date: string;
  editorial_review: string;
  disclaimer: string;
  editorial_status?: string;
  kind?: 'education' | 'guides';
  actions?: { label: string; screen: 'settings' | 'menu' | 'shopping' | 'support' }[];
}


/** Read-only request: tolerate slow connections; retry transient failures once. */
export async function loadEducationGuides(signal: AbortSignal, sessionToken?: string): Promise<EducationGuide[]> {
  const options = { signal, headers: sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {} };
  for (let attempt = 0; attempt < 2; attempt++) {
    if (signal.aborted) throw new Error('Загрузка отменена.');
    let response: Response;
    try {
      response = await fetchWithTimeout('/api/education/guides', options, 15000);
    } catch (error) {
      if (signal.aborted || attempt === 1) throw error;
      continue;
    }
    if (response.status === 401) throw new Error('Сеанс закончился. Откройте КетоБаланс заново через бота.');
    if (response.status === 403) throw new Error('Материалы недоступны для текущего аккаунта.');
    if ([408, 502, 503, 504].includes(response.status) && attempt === 0) continue;
    if (!response.ok) throw new Error('Не удалось загрузить материалы. Повторите попытку.');
    const data = await response.json();
    if (!Array.isArray(data.guides)) throw new Error('Сервер вернул неверный список материалов.');
    return data.guides;
  }
  throw new Error('Не удалось загрузить материалы.');
}

// Created by the app for a single session and never persisted on the device.
export function createEducationGuideLoader(sessionToken?: string) {
  let cached: { guides: EducationGuide[]; expiresAt: number } | undefined;
  return async (signal: AbortSignal): Promise<EducationGuide[]> => {
    if (signal.aborted) throw new Error('Загрузка отменена.');
    if (cached && Date.now() < cached.expiresAt) return cached.guides;
    const guides = await loadEducationGuides(signal, sessionToken);
    if (signal.aborted) throw new Error('Загрузка отменена.');
    cached = { guides, expiresAt: Date.now() + 60_000 };
    return guides;
  };
}
