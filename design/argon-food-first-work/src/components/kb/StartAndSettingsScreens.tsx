import { useState } from 'react';
import {
  Check,
  MessageCircle,
  ArrowRight,
  ArrowLeft,
  Info,
} from './Icons';
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
    <div className="max-w-3xl mx-auto space-y-6">
      <section
        aria-labelledby="start-hero-heading"
        className="kb-panel space-y-6"
      >
        <div className="space-y-2.5 border-b border-[var(--kb-border)] pb-5">
          <div className="kb-section-spine flex items-baseline gap-2.5">
            <span className="kb-display text-[22px] leading-none text-[var(--kb-text-1)] tabular-nums">
              01
            </span>
            <span className="kb-eyebrow text-[var(--kb-text-3)]">
              СПОКОЙНЫЙ ПОМОЩНИК ПО ПИТАНИЮ · ПРОЕКТ ОЛЬГИ
            </span>
          </div>
          <h1
            id="start-hero-heading"
            className="kb-cover-headline text-[28px] sm:text-[40px] text-[var(--kb-text-1)]"
          >
            Меньше ежедневных решений у плиты и в магазине
          </h1>
          <p className="text-[15px] sm:text-[17px] text-[var(--kb-text-2)] leading-relaxed">
            «Кето Баланс» помогает организовать повседневное питание в стиле кето
            или карнивор: выбрать понятное меню из обычных продуктов, собрать
            связанный список покупок, спокойно приготовить блюда и вести личные
            записи без сложных таблиц и давления.
          </p>
        </div>

        <div className="p-4 bg-[var(--kb-bg)] border border-[var(--kb-border)] space-y-2">
          <label className="min-h-[44px] flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.confirmed18Plus}
              onChange={(e) => {
                onUpdateDraft({ confirmed18Plus: e.target.checked });
                if (e.target.checked) setAgeError(null);
              }}
              className="mt-1 w-5 h-5 accent-[var(--kb-primary)] shrink-0"
            />
            <span className="text-[14px] text-[var(--kb-text-1)] leading-relaxed">
              Мне исполнилось <strong>18 лет</strong>. Я понимаю, что «Кето
              Баланс» помогает организовать бытовое питание и рецепты, а не
              лечит заболевания и не заменяет врача.
            </span>
          </label>

          {ageError && (
            <p
              role="alert"
              className="text-[13px] font-medium text-[var(--kb-danger-ink)] bg-[var(--kb-danger-bg)] px-3 py-2 border border-[var(--kb-danger-border)]"
            >
              {ageError}
            </p>
          )}
        </div>

        <div className="space-y-3">
          <div className="kb-section-spine flex items-baseline gap-2.5">
            <span className="kb-display text-[18px] leading-none text-[var(--kb-text-1)] tabular-nums">
              02
            </span>
            <h2 className="kb-eyebrow text-[var(--kb-text-3)]">
              ВЫБЕРИ ПОДХОД К ТАРЕЛКЕ
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => handleChooseApproach('keto')}
              className={`min-h-[64px] p-4 border text-left kb-focus-ring kb-transition-day ${
                draft.approach === 'keto'
                  ? 'border-[var(--kb-rule-strong)] bg-[var(--kb-day-active-bg)]'
                  : 'border-[var(--kb-border)] bg-[var(--kb-bg)]'
              }`}
            >
              <div className="kb-display text-[19px] text-[var(--kb-text-1)]">
                Кето-рацион
              </div>
              <div className="text-[13px] text-[var(--kb-text-2)] mt-1">
                Мясо, рыба, птица, яйца, масла, некрахмалистые овощи и свежая
                зелень
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleChooseApproach('carnivore')}
              className={`min-h-[64px] p-4 border text-left kb-focus-ring kb-transition-day ${
                draft.approach === 'carnivore'
                  ? 'border-[var(--kb-rule-strong)] bg-[var(--kb-day-active-bg)]'
                  : 'border-[var(--kb-border)] bg-[var(--kb-bg)]'
              }`}
            >
              <div className="kb-display text-[19px] text-[var(--kb-text-1)]">
                Карнивор
              </div>
              <div className="text-[13px] text-[var(--kb-text-2)] mt-1">
                Лаконичное меню с фокусом на животных продуктах без растительных
                гарниров
              </div>
            </button>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row sm:items-center gap-3">
            <button
              type="button"
              onClick={() =>
                handleChooseApproach(
                  draft.approach === 'explore' ? 'keto' : draft.approach
                )
              }
              className="kb-btn-primary kb-focus-ring kb-transition-card"
            >
              <span>Выбрать меню под себя</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() => handleChooseApproach('explore')}
              className="kb-btn-outline kb-focus-ring"
            >
              Просто осмотреться без анкеты
            </button>
          </div>
        </div>
      </section>

      <section
        aria-label="Личная поддержка Ольги до начала анкеты"
        className="kb-panel flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div className="space-y-1">
          <h2 className="kb-display text-[19px] text-[var(--kb-text-1)]">
            Сомневаешься, какой формат подойдёт?
          </h2>
          <p className="text-[13px] text-[var(--kb-text-2)]">
            Можно задать вопрос лично Ольге ещё до заполнения настроек. Мы не
            просим вес, анализы или медицинскую карту.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenSupportBeforeQuestionnaire}
          className="kb-btn-tonal shrink-0 kb-focus-ring"
        >
          <MessageCircle className="w-4 h-4" aria-hidden="true" />
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
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="kb-panel space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--kb-border)] pb-4">
          <div className="space-y-1">
            <div className="kb-section-spine flex items-baseline gap-2.5">
              <span className="kb-display text-[20px] leading-none text-[var(--kb-text-1)] tabular-nums">
                0{draft.currentStep}
              </span>
              <span className="kb-eyebrow text-[var(--kb-text-3)] tabular-nums">
                ШАГ {draft.currentStep} ИЗ 3 · АВТОСОХРАНЕНИЕ ЧЕРНОВИКА
              </span>
            </div>
            <h1 className="kb-cover-headline text-[26px] sm:text-[34px] text-[var(--kb-text-1)]">
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
                className={`min-h-[42px] min-w-[42px] px-3 border text-[13px] font-semibold tabular-nums kb-focus-ring ${
                  draft.currentStep === step
                    ? 'bg-[var(--kb-day-active-bg)] border-[var(--kb-rule-strong)] text-[var(--kb-text-1)]'
                    : 'bg-[var(--kb-bg)] border-[var(--kb-border)] text-[var(--kb-text-3)]'
                }`}
              >
                0{step}
              </button>
            ))}
          </div>
        </div>

        {draft.approach === 'explore' && (
          <div className="p-4 bg-[var(--kb-warn-bg)] border border-[var(--kb-warn-border)] text-[13px] text-[var(--kb-warn-ink)] flex items-start gap-2.5">
            <Info className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              Сейчас включён режим ознакомления: показывается общий пример меню.
              Чтобы применить свои исключения, выбери «Кето» или «Карнивор».
            </span>
          </div>
        )}

        {draft.currentStep === 1 && (
          <div className="space-y-5">
            <div className="space-y-2">
              <span className="kb-eyebrow text-[10px] text-[var(--kb-text-3)] block">
                БАЗОВЫЙ ПОДХОД К ТАРЕЛКЕ
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
                    className={`min-h-[48px] px-3.5 py-2.5 border text-[13px] text-left kb-focus-ring kb-transition-day ${
                      draft.approach === opt.id
                        ? 'border-[var(--kb-rule-strong)] bg-[var(--kb-day-active-bg)] font-semibold text-[var(--kb-text-1)]'
                        : 'border-[var(--kb-border)] bg-[var(--kb-bg)] text-[var(--kb-text-2)]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="kb-eyebrow text-[10px] text-[var(--kb-text-3)]">
                  ПРОДУКТЫ, КОТОРЫЕ НУЖНО ИСКЛЮЧИТЬ ИЗ ПОДБОРКИ
                </span>
                {draft.restrictions.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onUpdateDraft({ restrictions: [] })}
                    className="min-h-[34px] px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--kb-text-3)] hover:text-[var(--kb-text-1)] underline"
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
                      className={`min-h-[48px] px-4 py-2.5 border flex items-center justify-between gap-3 text-left text-[14px] kb-focus-ring kb-transition-day ${
                        checked
                          ? 'border-[var(--kb-rule-strong)] bg-[var(--kb-day-active-bg)] font-semibold text-[var(--kb-text-1)]'
                          : 'border-[var(--kb-border)] bg-[var(--kb-bg)] text-[var(--kb-text-2)]'
                      }`}
                    >
                      <span>{RESTRICTION_LABELS[tag]}</span>
                      <span
                        className={`w-5 h-5 border flex items-center justify-center shrink-0 ${
                          checked
                            ? 'bg-[var(--kb-text-1)] border-[var(--kb-text-1)] text-[var(--kb-bg)]'
                            : 'border-[var(--kb-border)]'
                        }`}
                      >
                        {checked && <Check className="w-3.5 h-3.5" />}
                      </span>
                    </button>
                  );
                })}
              </div>

              <p className="text-[12px] text-[var(--kb-text-3)] leading-relaxed pt-1">
                Фильтр убирает отмеченные категории из демонстрационного
                каталога, но не заменяет проверку состава упаковки при покупке.
              </p>
            </div>
          </div>
        )}

        {draft.currentStep === 2 && (
          <div className="space-y-5">
            <div className="space-y-2">
              <span className="kb-eyebrow text-[10px] text-[var(--kb-text-3)] block">
                ВРЕМЯ НА ОДНО БЛЮДО У ПЛИТЫ
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
                    className={`min-h-[48px] px-4 py-2.5 border text-[13px] text-left tabular-nums kb-focus-ring ${
                      draft.prepTimeMax === item.limit
                        ? 'border-[var(--kb-rule-strong)] bg-[var(--kb-day-active-bg)] font-semibold text-[var(--kb-text-1)]'
                        : 'border-[var(--kb-border)] bg-[var(--kb-bg)] text-[var(--kb-text-2)]'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <span className="kb-eyebrow text-[10px] text-[var(--kb-text-3)] block">
                ЧИСЛО ОСНОВНЫХ ПРИЁМОВ ПИЩИ В ДЕНЬ
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
                    className={`min-h-[56px] p-4 border text-left tabular-nums kb-focus-ring ${
                      draft.mealsPerDay === m.count
                        ? 'border-[var(--kb-rule-strong)] bg-[var(--kb-day-active-bg)]'
                        : 'border-[var(--kb-border)] bg-[var(--kb-bg)]'
                    }`}
                  >
                    <div className="text-[15px] font-bold text-[var(--kb-text-1)]">
                      {m.title}
                    </div>
                    <div className="text-[12px] text-[var(--kb-text-3)] mt-0.5">
                      {m.desc}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {draft.currentStep === 3 && (
          <div className="space-y-5">
            <div className="space-y-2">
              <span className="kb-eyebrow text-[10px] text-[var(--kb-text-3)] block">
                КАК УДОБНЕЕ ОРГАНИЗОВАТЬ ГОТОВКУ?
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() =>
                    onUpdateDraft({ preferenceNote: 'simple_daily' })
                  }
                  aria-pressed={draft.preferenceNote === 'simple_daily'}
                  className={`min-h-[52px] p-3.5 border text-left text-[13px] kb-focus-ring ${
                    draft.preferenceNote === 'simple_daily'
                      ? 'border-[var(--kb-rule-strong)] bg-[var(--kb-day-active-bg)] font-semibold text-[var(--kb-text-1)]'
                      : 'border-[var(--kb-border)] bg-[var(--kb-bg)] text-[var(--kb-text-2)]'
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
                  className={`min-h-[52px] p-3.5 border text-left text-[13px] kb-focus-ring ${
                    draft.preferenceNote === 'cook_for_two_days'
                      ? 'border-[var(--kb-rule-strong)] bg-[var(--kb-day-active-bg)] font-semibold text-[var(--kb-text-1)]'
                      : 'border-[var(--kb-border)] bg-[var(--kb-bg)] text-[var(--kb-text-2)]'
                  }`}
                >
                  Готовить горячее сразу на 2 дня
                </button>
              </div>
            </div>

            <div className="p-4 bg-[var(--kb-bg)] border border-[var(--kb-border)]">
              <label className="min-h-[44px] flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.remindersOptIn}
                  onChange={(e) =>
                    onUpdateDraft({ remindersOptIn: e.target.checked })
                  }
                  className="mt-1 w-5 h-5 accent-[var(--kb-primary)] shrink-0"
                />
                <span className="text-[13px] text-[var(--kb-text-1)] leading-relaxed">
                  <strong>Напоминать о меню и списке покупок</strong> (по
                  желанию). Мы не присылаем медицинских уведомлений.
                </span>
              </label>
            </div>
          </div>
        )}

        <div className="pt-4 border-t border-[var(--kb-border)] flex flex-wrap items-center justify-between gap-3">
          {draft.currentStep > 1 ? (
            <button
              type="button"
              onClick={() =>
                onUpdateDraft({
                  currentStep: (draft.currentStep - 1) as 1 | 2 | 3,
                })
              }
              className="kb-btn-outline kb-focus-ring"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              <span>Предыдущий шаг</span>
            </button>
          ) : (
            <span className="text-[12px] text-[var(--kb-text-3)]">
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
                className="kb-btn-outline tabular-nums kb-focus-ring"
              >
                Далее (Шаг 0{draft.currentStep + 1})
              </button>
            )}

            <button
              type="button"
              onClick={onSaveAndOpenMenu}
              className="kb-btn-primary kb-focus-ring"
            >
              <span>Выбрать меню</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <div className="kb-panel flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-[13px] text-[var(--kb-text-2)]">
          Не уверена, как отметить свои ограничения? Твой черновик анкеты
          сохранится при переходе в поддержку.
        </p>
        <button
          type="button"
          onClick={onOpenSupportFromSettings}
          className="kb-btn-tonal shrink-0 kb-focus-ring"
        >
          <MessageCircle className="w-4 h-4" aria-hidden="true" />
          <span>Написать Ольге</span>
        </button>
      </div>
    </div>
  );
}
