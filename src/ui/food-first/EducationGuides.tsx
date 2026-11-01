import React, { useState, useEffect } from 'react';

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
}

export function EducationGuides() {
  const [guides, setGuides] = useState<EducationGuide[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  useEffect(() => {
    let isMounted = true;
    fetch('/api/education/guides')
      .then((res) => {
        if (!res.ok) throw new Error('Не удалось загрузить руководства');
        return res.json();
      })
      .then((data) => {
        if (isMounted) {
          setGuides(data.guides || []);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || 'Ошибка загрузки');
          setLoading(false);
        }
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const categories = React.useMemo(() => {
    const set = new Set<string>();
    guides.forEach((g) => set.add(g.category));
    return ['all', ...Array.from(set)];
  }, [guides]);

  const filteredGuides = React.useMemo(() => {
    if (selectedCategory === 'all') return guides;
    return guides.filter((g) => g.category === selectedCategory);
  }, [guides, selectedCategory]);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl p-5 border border-stone-200 shadow-sm text-center py-8">
        <div className="inline-block animate-spin text-stone-400 text-xl mb-2">⏳</div>
        <p className="text-xs text-stone-500 font-medium">Загрузка проверенных руководств...</p>
      </div>
    );
  }

  if (error && guides.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-5 border border-red-200 shadow-sm text-center py-6">
        <p className="text-xs text-red-600 font-semibold mb-1">Не удалось загрузить руководства</p>
        <p className="text-[11px] text-stone-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl p-4 sm:p-5 border border-stone-200 shadow-sm space-y-4" data-testid="education-guides-container">
      <div className="flex items-center justify-between border-b border-stone-100 pb-3">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
            Экспертная база
          </span>
          <h3 className="text-base font-bold text-stone-900 mt-0.5">
            📚 Обучение и микро-гайды
          </h3>
        </div>
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
          {guides.length} руководств
        </span>
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
                : 'bg-stone-100 hover:bg-stone-200 text-stone-700'
            }`}
          >
            {cat === 'all' ? 'Все темы' : cat}
          </button>
        ))}
      </div>

      {/* Guide Cards */}
      <div className="space-y-3">
        {filteredGuides.map((guide) => {
          const isExpanded = expandedId === guide.id;
          return (
            <div
              key={guide.id}
              data-testid={`guide-card-${guide.id}`}
              className="rounded-xl border border-stone-200 overflow-hidden transition-all bg-stone-50/50 hover:bg-stone-50"
            >
              <button
                type="button"
                onClick={() => toggleExpand(guide.id)}
                className="w-full text-left p-3.5 flex items-start justify-between gap-3 cursor-pointer"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-stone-200/70 text-stone-700">
                      {guide.category}
                    </span>
                    <span className="text-[11px] text-stone-500">
                      ⏱️ {guide.read_time_minutes} мин
                    </span>
                  </div>
                  <h4 className="text-xs sm:text-sm font-bold text-stone-900 leading-snug">
                    {guide.title}
                  </h4>
                  <p className="text-[11px] text-stone-600 line-clamp-2">
                    {guide.summary}
                  </p>
                </div>
                <span className="text-stone-400 font-bold text-sm shrink-0 mt-1">
                  {isExpanded ? '▲' : '▼'}
                </span>
              </button>

              {isExpanded && (
                <div className="px-3.5 pb-4 pt-2 border-t border-stone-200/80 bg-white space-y-3 text-xs text-stone-700 leading-relaxed">
                  <div className="whitespace-pre-line text-stone-800">
                    {guide.content}
                  </div>

                  {guide.sources && guide.sources.length > 0 && (
                    <div className="p-2.5 bg-stone-50 rounded-lg border border-stone-200/70 text-[11px] space-y-1">
                      <div className="font-semibold text-stone-700">Источники и клинические стандарты:</div>
                      <ul className="list-disc pl-4 space-y-0.5 text-stone-600">
                        {guide.sources.map((src, i) => (
                          <li key={i}>{src}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between text-[10px] text-stone-500 pt-1 border-t border-stone-100">
                    <span>Редактор: <b>{guide.editorial_review}</b></span>
                    <span>Проверено: {guide.verified_date}</span>
                  </div>

                  {guide.disclaimer && (
                    <div className="p-2 rounded bg-amber-50 border border-amber-200 text-[10px] text-amber-900 leading-tight">
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
