import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { fetchWithTimeout } from '../../api/fetchWithTimeout';

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
  actions?: { label: string; screen: 'settings' | 'menu' | 'shopping' | 'support' }[];
}

interface EducationGuidesProps {
  sessionToken?: string;
  onOpenSettings?: () => void;
  onNavigate?: (screen: 'menu' | 'shopping' | 'support') => void;
}

export function EducationGuides({ sessionToken, onOpenSettings, onNavigate }: EducationGuidesProps = {}) {
  const [guides, setGuides] = useState<EducationGuide[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const requestGeneration = useRef(0);

  const loadGuides = useCallback(() => {
    const generation = ++requestGeneration.current;
    setLoading(true);
    setError(null);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      controller.abort();
    }, 5000);

    fetchWithTimeout('/api/education/guides', { signal: controller.signal, headers: sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {} }, 5000)
      .then((res) => {
        window.clearTimeout(timeoutId);
        if (!res.ok) throw new Error('Не удалось загрузить руководства');
        return res.json();
      })
      .then((data) => {
        if (generation !== requestGeneration.current) return;
        setGuides(data.guides || []);
        setLoading(false);
      })
      .catch((err) => {
        if (generation !== requestGeneration.current) return;
        window.clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          setError('Превышено время ожидания ответа (5 сек). Проверьте интернет-соединение.');
        } else {
          setError(err.message || 'Ошибка загрузки материалов');
        }
        setLoading(false);
      });
    return controller;
  }, [sessionToken]);

  useEffect(() => {
    const controller = loadGuides();
    return () => { requestGeneration.current++; controller.abort(); };
  }, [loadGuides]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    guides.forEach((g) => set.add(g.category));
    return ['all', ...Array.from(set)];
  }, [guides]);

  const filteredGuides = useMemo(() => {
    return guides.filter((g) => {
      const matchCat = selectedCategory === 'all' || g.category === selectedCategory;
      const q = searchQuery.trim().toLowerCase();
      const matchSearch =
        !q ||
        g.title.toLowerCase().includes(q) ||
        g.summary.toLowerCase().includes(q) ||
        g.category.toLowerCase().includes(q) ||
        g.content.toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [guides, selectedCategory, searchQuery]);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  if (loading) {
    return (
      <div className="bg-[var(--kb-surface)] rounded-2xl p-5 border border-[var(--kb-border)] shadow-sm text-center py-8">
        <div className="w-6 h-6 border-2 border-emerald-700 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <p className="text-xs text-[var(--kb-text-3)] font-medium">Загрузка материалов о питании...</p>
      </div>
    );
  }

  if (error && guides.length === 0) {
    return (
      <div className="bg-[var(--kb-surface)] rounded-2xl p-5 border border-[var(--kb-danger-border)] shadow-sm text-center py-6 space-y-3" data-testid="guides-error-container">
        <div>
          <p className="text-xs text-[var(--kb-danger-ink)] font-semibold mb-1">Не удалось загрузить руководства</p>
          <p className="text-[11px] text-[var(--kb-text-3)]">{error}</p>
        </div>
        <button
          type="button"
          onClick={loadGuides}
          data-testid="guides-retry-btn"
          className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 transition-colors shadow-sm"
        >
          Повторить попытку
        </button>
      </div>
    );
  }

  return (
    <div className="bg-[var(--kb-surface)] rounded-2xl p-4 sm:p-5 border border-[var(--kb-border)] shadow-sm space-y-4" data-testid="education-guides-container">
      <div className="flex items-center justify-between border-b border-[var(--kb-border)] pb-3">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--kb-primary)]">
            Материалы о питании
          </span>
          <h3 className="text-base font-bold text-[var(--kb-text-1)] mt-0.5">
            Обучение и микро-гайды
          </h3>
        </div>
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[var(--kb-surface-muted)] text-[var(--kb-primary)] border border-emerald-200">
          {guides.length} руководств
        </span>
      </div>

      {/* Search Input */}
      <div className="relative">
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Поиск по статьям и руководствам..."
          aria-label="Поиск по учебным материалам"
          data-testid="guides-search-input"
          className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--kb-border)] bg-[var(--kb-bg)] focus:bg-[var(--kb-surface)] focus:outline-none focus:border-emerald-600 transition-colors"
        />
        {searchQuery && (
          <button
            type="button"
            aria-label="Очистить поиск"
            onClick={() => setSearchQuery('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--kb-text-3)] hover:text-[var(--kb-text-2)]"
          >
            ✕
          </button>
        )}
      </div>

      {/* Category Pills */}
      <div className="flex flex-wrap gap-1.5 pb-1">
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setSelectedCategory(cat)}
            className={`text-[11px] px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
              selectedCategory === cat
                ? 'bg-[#255c48] text-white'
                : 'bg-[var(--kb-surface-muted)] hover:bg-stone-200 text-[var(--kb-text-2)]'
            }`}
          >
            {cat === 'all' ? 'Все темы' : cat}
          </button>
        ))}
      </div>

      {/* Empty State */}
      {filteredGuides.length === 0 && (
        <div className="text-center py-6 text-[var(--kb-text-3)] text-xs space-y-2">
          <p>{guides.length ? 'По вашему запросу руководств не найдено.' : 'Материалы готовятся к публикации. Доступные руководства появятся здесь после проверки.'}</p>
          {(selectedCategory !== 'all' || searchQuery) && (
            <button
              type="button"
              onClick={() => {
                setSelectedCategory('all');
                setSearchQuery('');
              }}
              className="text-[11px] text-[var(--kb-primary)] font-semibold underline"
            >
              Сбросить фильтры
            </button>
          )}
        </div>
      )}

      {/* Guide Cards */}
      <div className="space-y-3">
        {filteredGuides.map((guide) => {
          const isExpanded = expandedId === guide.id;
          return (
            <div
              key={guide.id}
              data-testid={`guide-card-${guide.id}`}
              className="rounded-xl border border-[var(--kb-border)] overflow-hidden transition-all bg-[var(--kb-bg)] hover:bg-[var(--kb-bg)]"
            >
              <button
                type="button"
                aria-expanded={isExpanded}
                onClick={() => toggleExpand(guide.id)}
                className="w-full text-left p-3.5 flex items-start justify-between gap-3 cursor-pointer"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[var(--kb-surface-muted)] text-[var(--kb-text-2)]">
                      {guide.category}
                    </span>
                    <span className="text-[11px] text-[var(--kb-text-3)]">
                      ⏱️ {guide.read_time_minutes} мин
                    </span>
                  </div>
                  <h4 className="text-xs sm:text-sm font-bold text-[var(--kb-text-1)] leading-snug">
                    {guide.title}
                  </h4>
                  <p className="text-[11px] text-[var(--kb-text-2)] line-clamp-2">
                    {guide.summary}
                  </p>
                </div>
                <span className="text-[var(--kb-text-3)] font-bold text-sm shrink-0 mt-1">
                  {isExpanded ? '▲' : '▼'}
                </span>
              </button>

              {isExpanded && (
                <div className="px-3.5 pb-4 pt-2 border-t border-[var(--kb-border)] bg-[var(--kb-surface)] space-y-3 text-xs text-[var(--kb-text-2)] leading-relaxed">
                  <div className="whitespace-pre-line text-[var(--kb-text-1)]">
                    {guide.content}
                  </div>
                  {guide.editorial_status !== 'approved' && <p className="text-[var(--kb-warn-ink)] bg-[var(--kb-warn-bg)] rounded-lg p-2">Материал подготовлен к проверке Ольгой. Публичный допуск ещё не подтверждён.</p>}
                  <div className="flex flex-wrap gap-2">
                    {guide.actions?.map(action => <button key={action.label} type="button" className="ff-proof__help-btn" onClick={() => action.screen === 'settings' ? onOpenSettings?.() : onNavigate?.(action.screen)} disabled={action.screen === 'settings' ? !onOpenSettings : !onNavigate}>{action.label}</button>)}
                  </div>

                  {guide.sources && guide.sources.length > 0 && (
                    <div className="p-2.5 bg-[var(--kb-bg)] rounded-lg border border-[var(--kb-border)] text-[11px] space-y-1">
                      <div className="font-semibold text-[var(--kb-text-2)]">Источники материала:</div>
                      <ul className="list-disc pl-4 space-y-0.5 text-[var(--kb-text-2)]">
                        {guide.sources.map((src, i) => (
                          <li key={i}>{src}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between text-[10px] text-[var(--kb-text-3)] pt-1 border-t border-[var(--kb-border)]">
                    <span>Редактор: <b>{guide.editorial_review}</b></span>
                    <span>{guide.verified_date ? `Проверено: ${guide.verified_date}` : 'Ожидает проверки'}</span>
                  </div>

                  {guide.disclaimer && (
                    <div className="p-2 rounded bg-[var(--kb-warn-bg)] border border-[var(--kb-warn-border)] text-[10px] text-[var(--kb-warn-ink)] leading-tight">
                      ⚠️ {guide.disclaimer}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
