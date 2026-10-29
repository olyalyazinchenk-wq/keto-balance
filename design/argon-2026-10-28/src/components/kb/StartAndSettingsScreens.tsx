import { useState } from 'react';
import {
  Check,
  MessageCircle,
  ArrowRight,
  ArrowLeft,
  Info,
} from 'lucide-react';
import type {
  DietApproach,
  PrepTimeLimit,
  RestrictionTag,
  UserSettingsDraft,
} from '../../types/ketoBalanceContract';
import { RESTRICTION_LABELS } from '../../utils/ketoBalanceState';

interface StartScreenProps {
  draft: UserSettingsDraft;
  onUpdateDraft: (patch: Partial<UserSettingsDraft>) => void;
  onStartQuestionnaire: (approach: DietApproach) => void;
  onExploreWithoutQuestionnaire: () => void;
  onOpenSupportBeforeQuestionnaire: () => void;
}

export function StartScreen({
  draft,
  onUpdateDraft,
  onStartQuestionnaire,
  onExploreWithoutQuestionnaire,
  onOpenSupportBeforeQuestionnaire,
}: StartScreenProps) {
  const [ageError, setAgeError] = useState<string | null>(null);

  const handleChooseApproach = (approach: DietApproach) => {
    if (!draft.confirmed18Plus) {
      setAgeError(
        'Пожалуйста, отметь подтверждение возраста 18+, чтобы продолжить.'
      );
      return;
    }
    setAgeError(null);
    if (approach === 'explore') {
      onExploreWithoutQuestionnaire();
    } else {
      onStartQuestionnaire(approach);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <section
        aria-labelledby="start-hero-heading"
        className="bg-[var(--kb-surface)] rounded-2xl border border-[var(--kb-border)] p-5 sm:p-7 space-y-5"
      >
        <div className="space-y-2">
          <p className="text-sm font-medium text-[var(--kb-primary)]">
            Спокойный помощник по питанию · Проект Ольги
          </p>
          <h1
            id="start-hero-heading"
            className="text-2xl sm:text-3xl font-bold text-[var(--kb-ink)] leading-snug"
          >
            Меньше ежедневных решений у плиты и в магазине
          </h1>
          <p className="text-base text-[var(--kb-muted)] leading-relaxed">
            «Кето Баланс» помогает организовать повседневное питание в стиле кето
            или карнивор: выбрать понятное меню из обычных продуктов, собрать
            связанный список покупок, спокойно приготовить блюда и вести личные
            записи без сложных таблиц и давления.
          </p>
        </div>

        {/* Отметка 18+ без запроса веса, диагнозов и анализов */}
        <div className="p-4 rounded-xl bg-[var(--kb-bg)] border border-[var(--kb-border)] space-y-2">
          <label className="min-h-[44px] flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.confirmed18Plus}
              onChange={(e) => {
                onUpdateDraft({ confirmed18Plus: e.target.checked });
                if (e.target.checked) setAgeError(null);
              }}
              className="mt-1 w-5 h-5 accent-[var(--kb-primary)] rounded shrink-0"
            />
            <span className="text-sm text-[var(--kb-ink)] leading-relaxed">
              Мне исполнилось <strong>18 лет</strong>. Я понимаю, что «Кето
              Баланс» помогает организовать бытовое питание и рецепты, а не
              лечит заболевания и не заменяет врача.
            </span>
          </label>

          {ageError && (
            <p
              role="alert"
              className="text-sm font-medium text-[var(--kb-danger-ink)] bg-[var(--kb-danger-bg)] px-3 py-2 rounded-lg"
            >
              {ageError}
            </p>
          )}
        </div>

        {/* Выбор подхода */}
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-[var(--kb-ink)]">
            С чего тебе удобнее начать?
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => handleChooseApproach('keto')}
              className={`min-h-[56px] p-4 rounded-xl border text-left transition-colors kb-focus-ring ${
                draft.approach === 'keto'
                  ? 'border-[var(--kb-primary)] bg-[var(--kb-sage)]'
                  : 'border-[var(--kb-border)] bg-[var(--kb-surface)] hover:bg-[var(--kb-bg)]'
              }`}
            >
              <div className="font-bold text-base text-[var(--kb-ink)]">
                Кето-рацион
              </div>
              <div className="text-sm text-[var(--kb-muted)] mt-1">
                Мясо, рыба, птица, яйца, масла, некрахмалистые овощи и свежая зелень
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleChooseApproach('carnivore')}
              className={`min-h-[56px] p-4 rounded-xl border text-left transition-colors kb-focus-ring ${
                draft.approach === 'carnivore'
                  ? 'border-[var(--kb-primary)] bg-[var(--kb-sage)]'
                  : 'border-[var(--kb-border)] bg-[var(--kb-surface)] hover:bg-[var(--kb-bg)]'
              }`}
            >
              <div className="font-bold text-base text-[var(--kb-ink)]">
                Карнивор
              </div>
              <div className="text-sm text-[var(--kb-muted)] mt-1">
                Лаконичное меню с фокусом на животных продуктах без растительных гарниров
              </div>
            </button>
          </div>

          {/* Одна главная кнопка смыслового блока */}
          <div className="pt-2 flex flex-col sm:flex-row sm:items-center gap-3">
            <button
              type="button"
              onClick={() =>
                handleChooseApproach(
                  draft.approach === 'explore' ? 'keto' : draft.approach
                )
              }
              className="min-h-[48px] px-6 py-3 rounded-xl bg-[var(--kb-primary)] hover:bg-[var(--kb-primary-hover)] text-white font-semibold text-base inline-flex items-center justify-center gap-2 transition-colors kb-focus-ring"
            >
              <span>Выбрать меню под себя</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() => handleChooseApproach('explore')}
              className="min-h-[48px] px-4 py-3 rounded-xl border border-[var(--kb-border)] bg-[var(--kb-surface)] hover:bg-[var(--kb-bg)] text-sm font-medium text-[var(--kb-ink)] transition-colors kb-focus-ring"
            >
              Просто осмотреться без анкеты
            </button>
          </div>
        </div>
      </section>

      {/* Помощь Ольги до анкеты */}
      <section
        aria-label="Личная поддержка Ольги до начала анкеты"
        className="bg-[var(--kb-surface)] rounded-2xl border border-[var(--kb-border)] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div className="space-y-1">
          <h2 className="text-base font-bold text-[var(--kb-ink)]">
            Сомневаешься, какой формат подойдёт?
          </h2>
          <p className="text-sm text-[var(--kb-muted)]">
            Можно задать вопрос лично Ольге ещё до заполнения настроек. Мы не
            просим вес, анализы или медицинскую карту.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenSupportBeforeQuestionnaire}
          className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[var(--kb-sage)] text-[var(--kb-ink)] font-semibold text-sm inline-flex items-center justify-center gap-2 shrink-0 kb-focus-ring"
        >
          <MessageCircle className="w-4 h-4 text-[var(--kb-primary)]" aria-hidden="true" />
          <span>Написать Ольге</span>
        </button>
      </section>
    </div>
  );
}

interface SettingsScreenProps {
  draft: UserSettingsDraft;
  onUpdateDraft: (patch: Partial<UserSettingsDraft>) => void;
  onSaveAndOpenMenu: () => void;
  onOpenSupportFromSettings: () => void;
}

const ALL_RESTRICTIONS: RestrictionTag[] = [
  'no_dairy',
  'no_eggs',
  'no_fish',
  'no_nuts',
  'no_pork',
];

export function SettingsScreen({
  draft,
  onUpdateDraft,
  onSaveAndOpenMenu,
  onOpenSupportFromSettings,
}: SettingsScreenProps) {
  const toggleRestriction = (tag: RestrictionTag) => {
    const exists = draft.restrictions.includes(tag);
    const next = exists
      ? draft.restrictions.filter((t) => t !== tag)
      : [...draft.restrictions, tag];
    onUpdateDraft({ restrictions: next });
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="bg-[var(--kb-surface)] rounded-2xl border border-[var(--kb-border)] p-5 sm:p-7 space-y-6">
        {/* Заголовок и индикатор сохранения черновика */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--kb-border)] pb-4">
          <div>
            <p className="text-xs font-medium text-[var(--kb-muted)]">
              Шаг {draft.currentStep} из 3 · Черновик сохраняется автоматически
            </p>
            <h1 className="text-xl sm:text-2xl font-bold text-[var(--kb-ink)] mt-0.5">
              Настройки питания и ритма кухни
            </h1>
          </div>

          <div
            role="group"
            aria-label="Переключение шагов настроек"
            className="flex items-center gap-1"
          >
            {([1, 2, 3] as const).map((step) => (
              <button
                key={step}
                type="button"
                onClick={() => onUpdateDraft({ currentStep: step })}
                aria-current={draft.currentStep === step ? 'step' : undefined}
                className={`min-h-[44px] min-w-[44px] px-3 rounded-xl text-sm font-semibold transition-colors kb-focus-ring ${
                  draft.currentStep === step
                    ? 'bg-[var(--kb-primary)] text-white'
                    : 'bg-[var(--kb-bg)] text-[var(--kb-muted)] hover:text-[var(--kb-ink)]'
                }`}
              >
                {step}
              </button>
            ))}
          </div>
        </div>

        {draft.approach === 'explore' && (
          <div className="p-4 rounded-xl bg-[var(--kb-warn-bg)] border border-[var(--kb-warn-border)] text-sm text-[var(--kb-warn-ink)] flex items-start gap-2.5">
            <Info className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              Сейчас включён режим ознакомления: в нём показывается общий пример
              меню без обещания индивидуального подбора. Чтобы применить свои
              исключения, выбери «Кето» или «Карнивор» ниже.
            </span>
          </div>
        )}

        {/* Шаг 1: Направление и пищевые ограничения */}
        {draft.currentStep === 1 && (
          <div className="space-y-5">
            <div className="space-y-2">
              <span className="block text-sm font-semibold text-[var(--kb-ink)]">
                Базовый подход к тарелке
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {(
                  [
                    { id: 'keto', label: 'Кето (с зеленью и овощами)' },
                    { id: 'carnivore', label: 'Карнивор (животные продукты)' },
                    { id: 'explore', label: 'Ознакомление (общий пример)' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onUpdateDraft({ approach: opt.id })}
                    aria-pressed={draft.approach === opt.id}
                    className={`min-h-[48px] px-3.5 py-2.5 rounded-xl border text-sm font-medium text-left transition-colors kb-focus-ring ${
                      draft.approach === opt.id
                        ? 'border-[var(--kb-primary)] bg-[var(--kb-sage)] font-semibold text-[var(--kb-ink)]'
                        : 'border-[var(--kb-border)] bg-[var(--kb-surface)] text-[var(--kb-muted)] hover:text-[var(--kb-ink)]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-[var(--kb-ink)]">
                  Продукты, которые нужно исключить из подборки
                </span>
                {draft.restrictions.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onUpdateDraft({ restrictions: [] })}
                    className="min-h-[36px] px-2.5 text-xs font-medium text-[var(--kb-muted)] hover:text-[var(--kb-ink)] underline"
                  >
                    Сбросить исключения
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {ALL_RESTRICTIONS.map((tag) => {
                  const checked = draft.restrictions.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleRestriction(tag)}
                      aria-pressed={checked}
                      className={`min-h-[48px] px-4 py-2.5 rounded-xl border flex items-center justify-between gap-3 text-left text-sm transition-colors kb-focus-ring ${
                        checked
                          ? 'border-[var(--kb-primary)] bg-[var(--kb-sage)] font-semibold text-[var(--kb-ink)]'
                          : 'border-[var(--kb-border)] bg-[var(--kb-surface)] text-[var(--kb-ink)] hover:bg-[var(--kb-bg)]'
                      }`}
                    >
                      <span>{RESTRICTION_LABELS[tag]}</span>
                      <span
                        className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                          checked
                            ? 'bg-[var(--kb-primary)] border-[var(--kb-primary)] text-white'
                            : 'border-[var(--kb-muted)]'
                        }`}
                      >
                        {checked && <Check className="w-3.5 h-3.5" />}
                      </span>
                    </button>
                  );
                })}
              </div>

              <p className="text-xs text-[var(--kb-muted)] leading-relaxed pt-1">
                Честное предупреждение: фильтр убирает отмеченные категории из
                демонстрационного каталога рецептов, но не заменяет проверку
                состава конкретной упаковки при покупке.
              </p>
            </div>
          </div>
        )}

        {/* Шаг 2: Доступное время на готовку и число приёмов пищи */}
        {draft.currentStep === 2 && (
          <div className="space-y-5">
            <div className="space-y-2">
              <span className="block text-sm font-semibold text-[var(--kb-ink)]">
                Сколько времени комфортно тратить на одно блюдо?
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {(
                  [
                    { limit: 20 as PrepTimeLimit, label: 'До 20 минут (быстро)' },
                    { limit: 35 as PrepTimeLimit, label: 'До 35 минут (спокойно)' },
                    { limit: 60 as PrepTimeLimit, label: 'Любое время' },
                  ]
                ).map((item) => (
                  <button
                    key={item.limit}
                    type="button"
                    onClick={() => onUpdateDraft({ prepTimeMax: item.limit })}
                    aria-pressed={draft.prepTimeMax === item.limit}
                    className={`min-h-[48px] px-4 py-2.5 rounded-xl border text-sm text-left transition-colors kb-focus-ring ${
                      draft.prepTimeMax === item.limit
                        ? 'border-[var(--kb-primary)] bg-[var(--kb-sage)] font-semibold text-[var(--kb-ink)]'
                        : 'border-[var(--kb-border)] bg-[var(--kb-surface)] text-[var(--kb-ink)]'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <span className="block text-sm font-semibold text-[var(--kb-ink)]">
                Сколько основных приёмов пищи в день тебе удобнее?
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {(
                  [
                    {
                      count: 3 as const,
                      title: '3 приёма пищи',
                      desc: 'Привычный ритм: завтрак, обед и ужин',
                    },
                    {
                      count: 2 as const,
                      title: '2 приёма пищи',
                      desc: 'Плотный завтрак/бранч и спокойный ужин',
                    },
                  ]
                ).map((m) => (
                  <button
                    key={m.count}
                    type="button"
                    onClick={() => onUpdateDraft({ mealsPerDay: m.count })}
                    aria-pressed={draft.mealsPerDay === m.count}
                    className={`min-h-[56px] p-4 rounded-xl border text-left transition-colors kb-focus-ring ${
                      draft.mealsPerDay === m.count
                        ? 'border-[var(--kb-primary)] bg-[var(--kb-sage)]'
                        : 'border-[var(--kb-border)] bg-[var(--kb-surface)]'
                    }`}
                  >
                    <div className="text-sm font-bold text-[var(--kb-ink)]">
                      {m.title}
                    </div>
                    <div className="text-xs text-[var(--kb-muted)] mt-0.5">
                      {m.desc}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Шаг 3: Предпочтения по готовке и явный opt-in напоминаний */}
        {draft.currentStep === 3 && (
          <div className="space-y-5">
            <div className="space-y-2">
              <span className="block text-sm font-semibold text-[var(--kb-ink)]">
                Как удобнее организовать готовку?
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() =>
                    onUpdateDraft({ preferenceNote: 'simple_daily' })
                  }
                  aria-pressed={draft.preferenceNote === 'simple_daily'}
                  className={`min-h-[52px] p-3.5 rounded-xl border text-left text-sm transition-colors kb-focus-ring ${
                    draft.preferenceNote === 'simple_daily'
                      ? 'border-[var(--kb-primary)] bg-[var(--kb-sage)] font-semibold'
                      : 'border-[var(--kb-border)] bg-[var(--kb-surface)]'
                  }`}
                >
                  Простые свежие блюда на каждый день
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateDraft({ preferenceNote: 'cook_for_two_days' })
                  }
                  aria-pressed={draft.preferenceNote === 'cook_for_two_days'}
                  className={`min-h-[52px] p-3.5 rounded-xl border text-left text-sm transition-colors kb-focus-ring ${
                    draft.preferenceNote === 'cook_for_two_days'
                      ? 'border-[var(--kb-primary)] bg-[var(--kb-sage)] font-semibold'
                      : 'border-[var(--kb-border)] bg-[var(--kb-surface)]'
                  }`}
                >
                  Готовить горячее сразу на 2 дня
                </button>
              </div>
            </div>

            {/* Напоминания только по явному opt-in (по умолчанию false) */}
            <div className="p-4 rounded-xl bg-[var(--kb-bg)] border border-[var(--kb-border)]">
              <label className="min-h-[44px] flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.remindersOptIn}
                  onChange={(e) =>
                    onUpdateDraft({ remindersOptIn: e.target.checked })
                  }
                  className="mt-1 w-5 h-5 accent-[var(--kb-primary)] rounded shrink-0"
                />
                <span className="text-sm text-[var(--kb-ink)] leading-relaxed">
                  <strong>Напоминать о меню и списке покупок</strong> (по
                  желанию). Мы не присылаем медицинских уведомлений и не
                  включаем напоминания без твоего согласия.
                </span>
              </label>
            </div>
          </div>
        )}

        {/* Навигация по шагам анкеты */}
        <div className="pt-4 border-t border-[var(--kb-border)] flex flex-wrap items-center justify-between gap-3">
          {draft.currentStep > 1 ? (
            <button
              type="button"
              onClick={() =>
                onUpdateDraft({
                  currentStep: (draft.currentStep - 1) as 1 | 2 | 3,
                })
              }
              className="min-h-[44px] px-4 py-2.5 rounded-xl border border-[var(--kb-border)] text-sm font-medium text-[var(--kb-ink)] inline-flex items-center gap-1.5 kb-focus-ring"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              <span>Предыдущий шаг</span>
            </button>
          ) : (
            <span className="text-xs text-[var(--kb-muted)]">
              Можно изменить в любой момент
            </span>
          )}

          <div className="flex items-center gap-2.5">
            {draft.currentStep < 3 && (
              <button
                type="button"
                onClick={() =>
                  onUpdateDraft({
                    currentStep: (draft.currentStep + 1) as 1 | 2 | 3,
                  })
                }
                className="min-h-[44px] px-4 py-2.5 rounded-xl border border-[var(--kb-border)] bg-[var(--kb-bg)] text-sm font-semibold text-[var(--kb-ink)] kb-focus-ring"
              >
                Далее (Шаг {draft.currentStep + 1})
              </button>
            )}

            <button
              type="button"
              onClick={onSaveAndOpenMenu}
              className="min-h-[48px] px-5 py-2.5 rounded-xl bg-[var(--kb-primary)] hover:bg-[var(--kb-primary-hover)] text-white text-sm sm:text-base font-semibold inline-flex items-center gap-2 transition-colors kb-focus-ring"
            >
              <span>Выбрать меню</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* Переход к поддержке Ольги с сохранением черновика */}
      <div className="bg-[var(--kb-surface)] rounded-2xl border border-[var(--kb-border)] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm text-[var(--kb-muted)]">
          Не уверена, как отметить свои ограничения? Твой черновик анкеты
          сохранится при переходе в поддержку.
        </p>
        <button
          type="button"
          onClick={onOpenSupportFromSettings}
          className="min-h-[44px] px-4 py-2 rounded-xl bg-[var(--kb-sage)] text-[var(--kb-ink)] text-sm font-semibold inline-flex items-center justify-center gap-1.5 shrink-0 kb-focus-ring"
        >
          <MessageCircle className="w-4 h-4 text-[var(--kb-primary)]" aria-hidden="true" />
          <span>Написать Ольге</span>
        </button>
      </div>
    </div>
  );
}
