import { useState, useEffect } from 'react';
import { Check, Sparkles, X, ArrowRight, Clock } from './Icons';
import {
  calculateSilhouetteForecast,
  calculateDopamineMomentum,
  type TransformationGoalId,
} from '../../utils/ketoBalanceState';

export interface ShortStoryItem {
  id: string;
  title: string;
  subtitle: string;
  duration: string;
  metricBadge: string;
  themeColor: 'emerald' | 'amber' | 'rose' | 'teal';
  ctaLabel: string;
  actionType: 'menu' | 'recipe' | 'shopping';
  recipeId?: string;
  slides: {
    kicker: string;
    headline: string;
    body: string;
    statBig: string;
    statSub: string;
  }[];
}

export const KETO_SHORTS_STORIES: ShortStoryItem[] = [
  {
    id: 'short-waist-7d',
    title: 'Как уходит талия за первые 7 дней',
    subtitle: 'Почему живот становится плоским без голода',
    duration: '0:15',
    metricBadge: '−2,5…4 см',
    themeColor: 'emerald',
    ctaLabel: 'Смотреть меню для тонкой талии',
    actionType: 'menu',
    slides: [
      {
        kicker: 'ДЕНЬ 1–3 · СПАД ИНСУЛИНА',
        headline: 'Сначала уходит лишняя вода и вечерний отёк',
        body: 'Когда в тарелке сытные белки, полезные жиры и зелень без скрытого сахара, организм перестаёт задерживать лишнюю жидкость в области живота и лица.',
        statBig: '−1,5…2 л',
        statSub: 'скрытых отёков уходит мягко в первые дни',
      },
      {
        kicker: 'ДЕНЬ 4–7 · ТОНКАЯ ТАЛИЯ',
        headline: 'Пояс юбки и джинсов садится свободно',
        body: 'Уходит вздутие после обеда, а линия талии уменьшается на 2–4 см уже к концу первой недели — без срывов и чувства голода.',
        statBig: '−3,5 см',
        statSub: 'средняя динамика талии за 7–10 дней',
      },
    ],
  },
  {
    id: 'short-plate-secret',
    title: 'Секрет сытой тарелки: 5 часов без перекусов',
    subtitle: 'Глазунья на топлёном масле с авокадо за 10 минут',
    duration: '0:18',
    metricBadge: '5 ч сытости',
    themeColor: 'amber',
    ctaLabel: 'Открыть этот рецепт',
    actionType: 'recipe',
    recipeId: 'kb-rec-eggs-avocado',
    slides: [
      {
        kicker: 'ФОРМУЛА УТРА · 10 МИНУТ',
        headline: 'Желток + спелое авокадо = ровная энергия до обеда',
        body: 'Вместо овсянки или тоста, после которых хочется сладкого уже через час, правильный жировой завтрак включает сжигание собственных запасов.',
        statBig: '0 скачков',
        statSub: 'сахара и полное спокойствие к сладкому',
      },
      {
        kicker: 'ВКУСНО КАК В РЕСТОРАНЕ',
        headline: 'Обычные продукты из магазина у дома',
        body: 'Два яйца, половинка авокадо, ложка топлёного масла и пучок свежей зелени — завтрак готов за 10 минут на одной сковороде.',
        statBig: '10 мин',
        statSub: 'у плиты — и тарелка стройности готова',
      },
    ],
  },
  {
    id: 'short-dress-size',
    title: 'Минус 1 размер в любимом платье',
    subtitle: 'Как меняется силуэт за 14–30 дней на Кето Баланс',
    duration: '0:20',
    metricBadge: '−1 размер',
    themeColor: 'rose',
    ctaLabel: 'Собрать покупки на 3 дня',
    actionType: 'shopping',
    slides: [
      {
        kicker: 'НЕДЕЛЯ 2–3 · СИЛУЭТ И ТОНУС',
        headline: 'Уходит объём с боков и нижней части живота',
        body: 'Достаточное количество белка сохраняет упругость кожи и мышц, а дефицит быстрых углеводов точечно убирает запасы в области талии.',
        statBig: '−4,5 см',
        statSub: 'в талии к середине курса без подсчёта калорий',
      },
      {
        kicker: 'ДЕНЬ 30 · НОВОЕ ОЩУЩЕНИЕ ТЕЛА',
        headline: 'Лёгкость с утра и удовольствие от зеркала',
        body: 'Любимые вещи сидят свободно, лицо свежеет, а вечер проходит спокойно без походов к холодильнику.',
        statBig: '−7,5 см',
        statSub: 'реальная цель за 4 недели спокойного режима',
      },
    ],
  },
  {
    id: 'short-dinner-15m',
    title: 'Ужин за 20 минут, от которого тает живот',
    subtitle: 'Сочные бифштексы с молодым кабачком и маслом',
    duration: '0:16',
    metricBadge: '20 мин',
    themeColor: 'teal',
    ctaLabel: 'Приготовить сегодня вечером',
    actionType: 'recipe',
    recipeId: 'kb-rec-beef-patties-butter',
    slides: [
      {
        kicker: 'ВЕЧЕР БЕЗ ТЯЖЕСТИ',
        headline: 'Сытный горячий ужин, который работает на фигуру ночью',
        body: 'Сочная говядина и томлёный кабачок дают глубокое насыщение без задержки воды наутро.',
        statBig: '−400 г',
        statSub: 'отёчного веса уже на следующее утро',
      },
    ],
  },
];

const DAILY_DOPAMINE_HABITS = [
  {
    id: 'water',
    title: 'Стакан тёплой воды утром',
    benefit: 'Запускает лимфодренаж и убирает утренние отёки',
    points: '+60 ✨',
  },
  {
    id: 'breakfast',
    title: 'Сытный кето-завтрак без сладкого',
    benefit: '5 часов ровной энергии без инсулиновых качелей',
    points: '+60 ✨',
  },
  {
    id: 'clean_gap',
    title: 'Чистый интервал 4 часа без перекусов',
    benefit: 'Организм переключается на сжигание запасов на талии',
    points: '+60 ✨',
  },
  {
    id: 'light_evening',
    title: 'Ужин за 3 часа до сна',
    benefit: 'Плоский живот и свежее лицо на следующее утро',
    points: '+60 ✨',
  },
];

interface TransformationAndShortsStudioProps {
  cookedTodayCount: number;
  onNavigateToMenu: () => void;
  onNavigateToShopping: () => void;
  onOpenRecipe: (recipeId: string) => void;
}

export function TransformationAndShortsStudio({
  cookedTodayCount,
  onNavigateToMenu,
  onNavigateToShopping,
  onOpenRecipe,
}: TransformationAndShortsStudioProps) {
  const [stageIndex, setStageIndex] = useState<0 | 1 | 2 | 3>(2);
  const [goalId, setGoalId] = useState<TransformationGoalId>('waist');
  const [completedHabits, setCompletedHabits] = useState<string[]>([
    'water',
    'breakfast',
  ]);
  const [activeShort, setActiveShort] = useState<ShortStoryItem | null>(null);
  const [slideIdx, setSlideIdx] = useState(0);
  const [watchedIds, setWatchedIds] = useState<Record<string, boolean>>({});
  const [likedShorts, setLikedShorts] = useState<Record<string, number>>({
    'short-waist-7d': 148,
    'short-plate-secret': 112,
    'short-dress-size': 194,
    'short-dinner-15m': 97,
  });

  const forecast = calculateSilhouetteForecast(stageIndex, goalId);
  const momentum = calculateDopamineMomentum(completedHabits, cookedTodayCount);

  useEffect(() => {
    if (!activeShort) return;
    const timer = window.setInterval(() => {
      setSlideIdx((prev) => {
        if (prev + 1 < activeShort.slides.length) {
          return prev + 1;
        }
        return 0;
      });
    }, 5500);
    return () => window.clearInterval(timer);
  }, [activeShort]);

  const toggleHabit = (id: string) => {
    setCompletedHabits((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const openShortStory = (story: ShortStoryItem) => {
    setActiveShort(story);
    setSlideIdx(0);
    setWatchedIds((prev) => ({ ...prev, [story.id]: true }));
  };

  // Координаты талии и бёдер для изящного женского силуэта (плавно сужаются от Дня 1 к 30 дням)
  const waistHalf = Math.round(18 + forecast.waistScale * 15); // от 33px (старт) до 27px (стройная талия)
  const bellyHalf = Math.round(24 + forecast.waistScale * 18); // от 42px (вздутие/отёк) до 35px (плоский живот)
  const hipHalf = Math.round(38 + forecast.hipScale * 8); // женственный изгиб бёдер
  const startWaistHalf = 33;
  const startBellyHalf = 42;
  const startHipHalf = 46;

  return (
    <div className="space-y-6">
      {/* 1. КАРУСЕЛЬ КОРОТКИХ ВИДЕО-ШОРТСОВ (REELS / STORIES) */}
      <section
        aria-label="Короткие видео-истории о результатах и тарелке"
        className="space-y-3"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-600 text-white text-[11px] font-bold shrink-0">
              ▶
            </span>
            <h2 className="text-[15px] sm:text-[17px] font-bold tracking-tight text-[var(--kb-text-1)]">
              Кето-Шортс: смотри, как уходит талия и работает меню
            </h2>
          </div>
          <span className="text-[12px] font-medium text-[var(--kb-text-3)] hidden sm:inline whitespace-nowrap">
            Нажми на историю · 15 сек
          </span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {KETO_SHORTS_STORIES.map((story) => {
            const isWatched = Boolean(watchedIds[story.id]);
            const gradientMap = {
              emerald:
                'from-[#064E3B] via-[#047857] to-[#10B981] text-white',
              amber:
                'from-[#78350F] via-[#B45309] to-[#F59E0B] text-white',
              rose:
                'from-[#881337] via-[#BE123C] to-[#F43F5E] text-white',
              teal:
                'from-[#134E4A] via-[#0F766E] to-[#14B8A6] text-white',
            }[story.themeColor];

            return (
              <button
                key={story.id}
                type="button"
                data-testid={`open-short-${story.id}`}
                onClick={() => openShortStory(story)}
                className={`group relative overflow-hidden rounded-2xl p-3.5 sm:p-4 text-left min-h-[192px] sm:min-h-[210px] flex flex-col justify-between bg-gradient-to-br ${gradientMap} shadow-md hover:shadow-xl transition-all duration-200 hover:-translate-y-0.5 kb-focus-ring`}
              >
                {/* Декоративный женский силуэт на фоне карточки шортса */}
                <svg
                  viewBox="0 0 160 220"
                  aria-hidden="true"
                  className="absolute right-[-6px] bottom-[-8px] w-28 h-40 opacity-25 group-hover:scale-105 transition-transform duration-300 pointer-events-none"
                >
                  <circle cx="105" cy="28" r="14" fill="white" fillOpacity="0.4" />
                  <path
                    d="M72 58 C 84 48, 126 48, 138 58 C 134 82, 122 98, 122 114 C 122 130, 142 152, 138 182 L 126 218 L 84 218 L 72 182 C 68 152, 88 130, 88 114 C 88 98, 76 82, 72 58 Z"
                    fill="white"
                    fillOpacity="0.32"
                  />
                </svg>

                {/* Верхняя строка карточки шортса (строго в 1 строку) */}
                <div className="relative z-10 flex items-center justify-between gap-1.5 w-full">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold tracking-tight whitespace-nowrap shrink-0 ${
                      isWatched
                        ? 'bg-black/25 text-white/90'
                        : 'bg-white text-slate-900 shadow-xs'
                    }`}
                  >
                    <span className="text-emerald-600" aria-hidden="true">
                      ▶
                    </span>
                    <span>{story.metricBadge}</span>
                  </span>

                  <span className="text-[10.5px] font-semibold bg-black/30 px-2 py-0.5 rounded-full tabular-nums whitespace-nowrap shrink-0">
                    {story.duration}
                  </span>
                </div>

                {/* Нижняя часть карточки шортса */}
                <div className="relative z-10 space-y-1.5 pt-5">
                  <div className="text-[14.5px] sm:text-[16px] font-bold leading-snug drop-shadow-xs">
                    {story.title}
                  </div>
                  <p className="text-[11.5px] text-white/85 leading-snug line-clamp-2">
                    {story.subtitle}
                  </p>
                  <div className="pt-1 flex items-center justify-between gap-2 text-[11px] font-bold text-white/95 whitespace-nowrap">
                    <span>Смотреть →</span>
                    <span className="tabular-nums">
                      🔥 {likedShorts[story.id] || 120}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* 2. ВИЗУАЛЬНАЯ СТУДИЯ ТРАНСФОРМАЦИИ СИЛУЭТА + ДОФАМИНОВЫЙ ТРЕКЕР ДНЯ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Левая главная карточка (7 колонок): Визуальный прогноз фигуры и талии */}
        <section
          aria-labelledby="silhouette-studio-heading"
          data-testid="silhouette-studio-card"
          className="lg:col-span-7 rounded-3xl bg-[var(--kb-surface)] border border-[var(--kb-border)] p-5 sm:p-7 shadow-sm flex flex-col justify-between space-y-5"
        >
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                <Sparkles className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Наглядный результат · Зачем тебе Кето Баланс</span>
              </div>
              <span className="text-[12px] font-semibold text-[var(--kb-text-3)] tabular-nums">
                Этап: {forecast.daysLabel} ({forecast.stageBadge})
              </span>
            </div>

            <h2
              id="silhouette-studio-heading"
              className="kb-display text-[23px] sm:text-[29px] leading-[1.15] text-[var(--kb-text-1)]"
            >
              {forecast.headline}
            </h2>

            {/* Переключатель личной цели */}
            <div
              role="group"
              aria-label="Выбери свой главный фокус"
              className="flex flex-wrap items-center gap-1.5 pt-1"
            >
              {(
                [
                  { id: 'waist', label: 'Тонкая талия и плоский живот' },
                  { id: 'dress', label: 'Любимое платье −1 размер' },
                  { id: 'energy', label: 'Лёгкость и лицо без отёков' },
                ] as const
              ).map((g) => {
                const active = goalId === g.id;
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setGoalId(g.id)}
                    aria-pressed={active}
                    className={`min-h-[36px] px-3.5 py-1.5 rounded-xl text-[12px] font-semibold transition-all kb-focus-ring whitespace-nowrap ${
                      active
                        ? 'bg-emerald-700 text-white shadow-xs'
                        : 'bg-[var(--kb-bg)] text-[var(--kb-text-2)] hover:text-[var(--kb-text-1)] border border-[var(--kb-border)]'
                    }`}
                  >
                    {g.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Центральная сцена: Изящный женский силуэт + вехи изменений */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-center bg-gradient-to-br from-[#064E3B] via-[#065F46] to-[#047857] text-white rounded-2xl p-4 sm:p-5 shadow-inner">
            {/* Графический силуэт женской фигуры с динамической линией талии */}
            <div className="sm:col-span-5 flex flex-col items-center justify-center relative">
              <svg
                viewBox="0 0 220 280"
                data-testid="silhouette-svg"
                role="img"
                aria-label={`Силуэт фигуры на этапе ${forecast.daysLabel}: изменение талии ${forecast.waistDeltaCm}`}
                className="w-44 h-56 sm:w-48 sm:h-60 overflow-visible"
              >
                <defs>
                  <linearGradient
                    id="kbSculptBody"
                    x1="0%"
                    y1="0%"
                    x2="0%"
                    y2="100%"
                  >
                    <stop offset="0%" stopColor="#6EE7B7" stopOpacity="0.95" />
                    <stop offset="50%" stopColor="#34D399" stopOpacity="0.95" />
                    <stop offset="100%" stopColor="#10B981" stopOpacity="0.9" />
                  </linearGradient>
                  <radialGradient id="kbGoldenAura" cx="50%" cy="48%" r="50%">
                    <stop offset="0%" stopColor="#FDE68A" stopOpacity="0.35" />
                    <stop offset="70%" stopColor="#10B981" stopOpacity="0.1" />
                    <stop offset="100%" stopColor="#064E3B" stopOpacity="0" />
                  </radialGradient>
                </defs>

                {/* Мягкое золотистое свечение вокруг силуэта */}
                <circle cx="110" cy="140" r="92" fill="url(#kbGoldenAura)" />

                {/* Контур ДО (пунктирный силуэт исходного объёма талии и живота) */}
                <path
                  d={`M 98 42
                      C 82 46, 68 56, 66 72
                      C 66 88, 76 102, ${110 - startWaistHalf} 122
                      C ${110 - startBellyHalf} 138, ${110 - startHipHalf} 156, ${110 - startHipHalf} 182
                      C ${110 - startHipHalf + 4} 214, ${110 - 28} 244, ${110 - 24} 268
                      L ${110 + 24} 268
                      C ${110 + 28} 244, ${110 + startHipHalf - 4} 214, ${110 + startHipHalf} 182
                      C ${110 + startHipHalf} 156, ${110 + startBellyHalf} 138, ${110 + startWaistHalf} 122
                      C 144 102, 154 88, 154 72
                      C 152 56, 138 46, 122 42 Z`}
                  fill="none"
                  stroke="#FCD34D"
                  strokeWidth="1.8"
                  strokeDasharray="4 4"
                  opacity={stageIndex === 0 ? 0.3 : 0.85}
                />

                {/* Голова и изящная шея */}
                <ellipse cx="110" cy="20" rx="12" ry="14" fill="url(#kbSculptBody)" />
                <rect x="104" y="31" width="12" height="12" rx="4" fill="url(#kbSculptBody)" />

                {/* Стройный женский силуэт (плавно сужается в талии и животе) */}
                <path
                  d={`M 98 41
                      C 82 45, 70 55, 68 70
                      C 68 86, 78 100, ${110 - waistHalf} 122
                      C ${110 - bellyHalf} 138, ${110 - hipHalf} 156, ${110 - hipHalf} 182
                      C ${110 - hipHalf + 5} 214, ${110 - 25} 244, ${110 - 21} 268
                      L 106 268 L 108 196 L 112 196 L 114 268
                      L ${110 + 21} 268
                      C ${110 + 25} 244, ${110 + hipHalf - 5} 214, ${110 + hipHalf} 182
                      C ${110 + hipHalf} 156, ${110 + bellyHalf} 138, ${110 + waistHalf} 122
                      C 142 100, 152 86, 152 70
                      C 150 55, 138 45, 122 41 Z`}
                  fill="url(#kbSculptBody)"
                  className="transition-all duration-300"
                />

                {/* Ключицы и вертикальная ось грации */}
                <path
                  d="M 88 54 Q 110 62 132 54"
                  fill="none"
                  stroke="#064E3B"
                  strokeWidth="1.5"
                  strokeOpacity="0.35"
                  strokeLinecap="round"
                />
                <path
                  d={`M ${110 - waistHalf + 5} 118 Q 110 126 ${110 + waistHalf - 5} 118`}
                  fill="none"
                  stroke="#FFFFFF"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />

                {/* Стрелки сужения талии слева и справа */}
                <path
                  d={`M 42 122 L ${110 - waistHalf - 6} 122`}
                  stroke="#FDE68A"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <polygon
                  points={`${110 - waistHalf - 3},122 ${110 - waistHalf - 10},118 ${110 - waistHalf - 10},126`}
                  fill="#FDE68A"
                />
                <path
                  d={`M 178 122 L ${110 + waistHalf + 6} 122`}
                  stroke="#FDE68A"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <polygon
                  points={`${110 + waistHalf + 3},122 ${110 + waistHalf + 10},118 ${110 + waistHalf + 10},126`}
                  fill="#FDE68A"
                />

                {/* Бейдж с сантиметрами на линии талии */}
                <rect
                  x="62"
                  y="110"
                  width="96"
                  height="22"
                  rx="11"
                  fill="#022C22"
                  stroke="#FCD34D"
                  strokeWidth="1.4"
                />
                <text
                  x="110"
                  y="125"
                  textAnchor="middle"
                  fill="#FEF08A"
                  fontSize="11"
                  fontWeight="700"
                >
                  Талия: {forecast.waistDeltaCm}
                </text>
              </svg>

              <div className="text-[11px] font-medium text-emerald-100/90 text-center mt-1">
                Пунктир — старт · Силуэт — {forecast.daysLabel}
              </div>
            </div>

            {/* Правая колонка внутри сцены: что именно происходит с телом */}
            <div className="sm:col-span-7 space-y-3.5">
              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3 rounded-xl bg-white/10 backdrop-blur-xs border border-white/15">
                  <div className="text-[11px] font-medium text-emerald-100">
                    Линия талии
                  </div>
                  <div
                    data-testid="silhouette-waist-Readout"
                    className="text-[22px] font-extrabold text-amber-300 tabular-nums mt-0.5"
                  >
                    {forecast.waistDeltaCm}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-white/10 backdrop-blur-xs border border-white/15">
                  <div className="text-[11px] font-medium text-emerald-100">
                    Тонус и лёгкость
                  </div>
                  <div className="text-[22px] font-extrabold text-emerald-300 tabular-nums mt-0.5">
                    {forecast.energyPercent}%
                  </div>
                </div>
              </div>

              <p className="text-[13.5px] text-emerald-50 leading-snug">
                {forecast.feelingSummary}
              </p>

              <ul className="space-y-2">
                {forecast.milestones.map((m, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2 text-[13px] text-white leading-snug"
                  >
                    <span className="mt-0.5 w-4 h-4 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center shrink-0 text-[10px] font-extrabold">
                      ✓
                    </span>
                    <span>{m}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Интерактивная шкала времени: переключай недели и смотри, как тает талия */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[12px] font-semibold text-[var(--kb-text-2)]">
              <span>Переключай срок, чтобы увидеть динамику силуэта:</span>
              <span className="text-emerald-700 dark:text-emerald-400 font-bold tabular-nums">
                {forecast.daysLabel}
              </span>
            </div>
            <div
              role="group"
              aria-label="Этапы трансформации фигуры"
              className="grid grid-cols-4 gap-2"
            >
              {(
                [
                  { idx: 0 as const, label: 'День 1', sub: 'Старт' },
                  { idx: 1 as const, label: '7 дней', sub: '−2,5 см' },
                  { idx: 2 as const, label: '14 дней', sub: '−4,5 см' },
                  { idx: 3 as const, label: '30 дней', sub: '−7,5 см' },
                ]
              ).map((step) => {
                const active = stageIndex === step.idx;
                return (
                  <button
                    key={step.idx}
                    type="button"
                    data-testid={`silhouette-stage-${step.idx}`}
                    onClick={() => setStageIndex(step.idx)}
                    aria-pressed={active}
                    className={`min-h-[52px] px-2 py-2 rounded-xl border text-center transition-all tabular-nums kb-focus-ring ${
                      active
                        ? 'bg-emerald-700 text-white border-emerald-700 shadow-sm'
                        : 'bg-[var(--kb-bg)] text-[var(--kb-text-2)] border-[var(--kb-border)] hover:border-emerald-600/50'
                    }`}
                  >
                    <div className="text-[12.5px] sm:text-[13px] font-bold whitespace-nowrap">
                      {step.label}
                    </div>
                    <div
                      className={`text-[11px] font-medium whitespace-nowrap ${
                        active ? 'text-emerald-100' : 'text-[var(--kb-text-3)]'
                      }`}
                    >
                      {step.sub}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Правая карточка (5 колонок): Дофаминовый трекер лёгкости и микро-побед дня */}
        <section
          aria-labelledby="dopamine-tracker-heading"
          data-testid="dopamine-tracker-card"
          className="lg:col-span-5 rounded-3xl bg-[var(--kb-surface)] border border-[var(--kb-border)] p-5 sm:p-7 shadow-sm flex flex-col justify-between space-y-5"
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                🔥 Дофамин и импульс дня
              </span>
              <span
                data-testid="dopamine-points-badge"
                className="text-[13px] font-bold text-emerald-700 dark:text-emerald-300 tabular-nums whitespace-nowrap"
              >
                {momentum.points} ✨ · Серия {momentum.streakDays} дн.
              </span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <h2
                  id="dopamine-tracker-heading"
                  className="kb-display text-[22px] sm:text-[26px] leading-tight text-[var(--kb-text-1)]"
                >
                  {momentum.badgeTitle}
                </h2>
                <p className="text-[13px] text-[var(--kb-text-2)] mt-1">
                  {momentum.nextRewardText}
                </p>
              </div>

              {/* Круговой индикатор прогресса дня */}
              <div className="relative w-16 h-16 shrink-0 flex items-center justify-center">
                <svg viewBox="0 0 64 64" className="w-16 h-16 -rotate-90">
                  <circle
                    cx="32"
                    cy="32"
                    r="26"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="6"
                    className="text-emerald-900/10 dark:text-white/10"
                  />
                  <circle
                    cx="32"
                    cy="32"
                    r="26"
                    fill="none"
                    stroke="#10B981"
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={163.36}
                    strokeDashoffset={
                      163.36 - (163.36 * momentum.percent) / 100
                    }
                    className="transition-all duration-300"
                  />
                </svg>
                <span className="absolute text-[13px] font-bold text-[var(--kb-text-1)] tabular-nums">
                  {momentum.percent}%
                </span>
              </div>
            </div>
          </div>

          {/* Интерактивный чеклист быстрых дофаминовых побед */}
          <div className="space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--kb-text-3)]">
              Отмечай простые шаги и забирай бонусы лёгкости:
            </div>

            <div className="space-y-2">
              {DAILY_DOPAMINE_HABITS.map((habit) => {
                const done = completedHabits.includes(habit.id);
                return (
                  <button
                    key={habit.id}
                    type="button"
                    data-testid={`dopamine-habit-${habit.id}`}
                    onClick={() => toggleHabit(habit.id)}
                    aria-pressed={done}
                    className={`w-full p-3 rounded-2xl border text-left flex items-center justify-between gap-3 transition-all kb-focus-ring ${
                      done
                        ? 'bg-emerald-600/10 border-emerald-600/40 text-[var(--kb-text-1)]'
                        : 'bg-[var(--kb-bg)] border-[var(--kb-border)] hover:border-emerald-600/40 text-[var(--kb-text-2)]'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                          done
                            ? 'bg-emerald-600 text-white'
                            : 'border-2 border-[var(--kb-border)] bg-[var(--kb-surface)]'
                        }`}
                      >
                        {done && <Check className="w-3.5 h-3.5" />}
                      </span>
                      <div className="min-w-0">
                        <div className="text-[13.5px] font-semibold text-[var(--kb-text-1)] truncate">
                          {habit.title}
                        </div>
                        <div className="text-[11.5px] text-[var(--kb-text-3)] truncate">
                          {habit.benefit}
                        </div>
                      </div>
                    </div>

                    <span
                      className={`text-[11.5px] font-bold tabular-nums whitespace-nowrap shrink-0 ${
                        done
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {done ? 'В копилке ✓' : habit.points}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-1 flex items-center justify-between gap-3 border-t border-[var(--kb-border)]">
            <span className="text-[12px] text-[var(--kb-text-3)]">
              Каждое блюдо из меню даёт +80 ✨ к результату
            </span>
            <button
              type="button"
              onClick={onNavigateToMenu}
              className="text-[12px] font-bold text-emerald-700 dark:text-emerald-400 hover:underline inline-flex items-center gap-1 whitespace-nowrap shrink-0 kb-focus-ring"
            >
              <span>К меню на 3 дня</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </section>
      </div>

      {/* 3. ПОЛНОЭКРАННЫЙ ВЕРТИКАЛЬНЫЙ ПЛЕЕР КЕТО-ШОРТСОВ (9:16 REELS MODAL) */}
      {activeShort && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Кето-Шортс: ${activeShort.title}`}
          data-testid="shorts-player-modal"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6"
        >
          <div className="relative w-full max-w-[390px] rounded-3xl overflow-hidden bg-gradient-to-b from-[#064E3B] via-[#065F46] to-[#022C22] text-white shadow-2xl border border-white/15 flex flex-col justify-between min-h-[580px] max-h-[90dvh]">
            {/* Полоски прогресса слайдов в стиле Stories / Reels */}
            <div className="p-4 space-y-3 relative z-10">
              <div className="flex items-center gap-1.5">
                {activeShort.slides.map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSlideIdx(idx)}
                    aria-label={`Слайд ${idx + 1}`}
                    className="h-1.5 flex-1 rounded-full bg-white/25 overflow-hidden"
                  >
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        idx <= slideIdx ? 'w-full bg-amber-400' : 'w-0'
                      }`}
                    />
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-full bg-emerald-500/30 border border-emerald-300/40 flex items-center justify-center font-bold text-[12px]">
                    КБ
                  </span>
                  <div>
                    <div className="text-[12px] font-bold leading-tight">
                      Кето Баланс · Ольга
                    </div>
                    <div className="text-[10.5px] text-emerald-200 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>Наглядный разбор · {activeShort.duration}</span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  data-testid="close-shorts-modal"
                  onClick={() => setActiveShort(null)}
                  aria-label="Закрыть видео-историю"
                  className="w-10 h-10 rounded-full bg-black/30 hover:bg-black/50 flex items-center justify-center text-white kb-focus-ring"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Центральная анимированная визуализация внутри 9:16 плеера */}
            <div className="px-5 py-2 flex-1 flex flex-col justify-center items-center text-center space-y-4 relative">
              <div className="flex items-center justify-center gap-4 w-full">
                {/* Мини-силуэт сужения талии прямо внутри видео-истории */}
                <svg
                  viewBox="0 0 120 150"
                  aria-hidden="true"
                  className="w-24 h-28 shrink-0"
                >
                  <circle cx="60" cy="16" r="9" fill="#6EE7B7" />
                  <path
                    d="M42 32 C 50 28, 70 28, 78 32 C 76 50, 68 62, 68 74 C 68 86, 82 102, 78 124 L 42 124 C 38 102, 52 86, 52 74 C 52 62, 44 50, 42 32 Z"
                    fill="#34D399"
                    fillOpacity="0.9"
                  />
                  <path
                    d="M36 32 C 48 28, 72 28, 84 32 C 82 52, 76 62, 76 74 C 76 86, 88 102, 84 124 L 36 124 C 32 102, 44 86, 44 74 C 44 62, 38 52, 36 32 Z"
                    fill="none"
                    stroke="#FDE68A"
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                  />
                  <line x1="24" y1="74" x2="96" y2="74" stroke="#FCD34D" strokeWidth="1.8" />
                </svg>

                <div className="p-4 rounded-2xl bg-white/10 border border-white/20 flex flex-col items-start text-left shadow-inner">
                  <div className="text-[28px] font-extrabold text-amber-300 tabular-nums leading-none">
                    {activeShort.slides[slideIdx]?.statBig}
                  </div>
                  <div className="text-[11.5px] text-emerald-100 leading-snug mt-1.5">
                    {activeShort.slides[slideIdx]?.statSub}
                  </div>
                </div>
              </div>

              <div className="space-y-2 text-left w-full bg-black/25 backdrop-blur-xs p-4 rounded-2xl border border-white/10">
                <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                  {activeShort.slides[slideIdx]?.kicker}
                </div>
                <h3 className="text-[19px] font-bold leading-snug text-white">
                  {activeShort.slides[slideIdx]?.headline}
                </h3>
                <p className="text-[13px] text-emerald-50/90 leading-relaxed">
                  {activeShort.slides[slideIdx]?.body}
                </p>
              </div>
            </div>

            {/* Нижняя панель действий шортса (однострочные кнопки без переносов) */}
            <div className="p-4 bg-black/35 backdrop-blur-md border-t border-white/10 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setLikedShorts((prev) => ({
                      ...prev,
                      [activeShort.id]: (prev[activeShort.id] || 120) + 1,
                    }))
                  }
                  className="min-h-[42px] px-3.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-[12.5px] font-bold text-white inline-flex items-center gap-1.5 tabular-nums whitespace-nowrap shrink-0 kb-focus-ring"
                >
                  <span>🔥 Вдохновляет · {likedShorts[activeShort.id] || 120}</span>
                </button>

                {activeShort.slides.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setSlideIdx((prev) =>
                        prev + 1 < activeShort.slides.length ? prev + 1 : 0
                      )
                    }
                    className="min-h-[42px] px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-[12px] font-semibold text-emerald-100 tabular-nums whitespace-nowrap shrink-0 kb-focus-ring"
                  >
                    Кадр {slideIdx + 1}/{activeShort.slides.length} →
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  const target = activeShort;
                  setActiveShort(null);
                  if (target.actionType === 'recipe' && target.recipeId) {
                    onOpenRecipe(target.recipeId);
                  } else if (target.actionType === 'shopping') {
                    onNavigateToShopping();
                  } else {
                    onNavigateToMenu();
                  }
                }}
                className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-[12.5px] uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg whitespace-nowrap kb-focus-ring"
              >
                <span>{activeShort.ctaLabel}</span>
                <ArrowRight className="w-4 h-4 shrink-0" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
