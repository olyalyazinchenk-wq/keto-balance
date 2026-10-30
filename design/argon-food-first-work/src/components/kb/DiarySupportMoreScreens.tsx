import React, { useEffect, useState } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Calendar,
  MessageCircle,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Clock,
  BookOpen,
  Settings,
  ShieldCheck,
  Sparkles,
  Utensils,
  RotateCcw,
} from './Icons';
import type {
  ManualDiaryEntry,
  RecipeViewModel,
  SupportTransportState,
} from '../../types/ketoBalanceContract';
import { DEMO_MATERIALS } from '../../data/ketoBalanceFixtures';
import { RecipeArtwork } from './RecipeArtwork';
import { triggerDelicateHaptic } from '../../utils/telegramWebApp';

interface ManualDiaryScreenProps {
  selectedDate: string;
  onChangeDate: (date: string) => void;
  entries: ManualDiaryEntry[];
  onSaveEntry: (entry: Omit<ManualDiaryEntry, 'id'>, editingId?: string) => void;
  onDeleteEntry: (id: string) => void;
  onOpenMenu: () => void;
  prefillMealTitle?: string | null;
  onClearPrefill?: () => void;
}

const AVAILABLE_DATES = [
  { iso: '2026-10-28', label: 'Сегодня, 28 окт' },
  { iso: '2026-10-27', label: 'Вчера, 27 окт' },
  { iso: '2026-10-26', label: '26 окт' },
];

const MEAL_SLOTS: {
  mealLabel: ManualDiaryEntry['mealLabel'];
  timeLabel: string;
}[] = [
  { mealLabel: 'Завтрак', timeLabel: '09:00' },
  { mealLabel: 'Обед', timeLabel: '14:00' },
  { mealLabel: 'Ужин', timeLabel: '19:00' },
  { mealLabel: 'Перекус / Другое', timeLabel: '16:30' },
];

const WELLBEING_PRESETS = [
  'Сытно и спокойно, хватило на 5 часов',
  'Лёгкость после еды, без тяжести',
  'Готовила на всю семью',
  'Быстро собрала тарелку за 15 минут',
];

export const ManualDiaryScreen: React.FC<ManualDiaryScreenProps> = ({
  selectedDate,
  onChangeDate,
  entries,
  onSaveEntry,
  onDeleteEntry,
  onOpenMenu,
  prefillMealTitle,
  onClearPrefill,
}) => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [mealLabel, setMealLabel] =
    useState<ManualDiaryEntry['mealLabel']>('Завтрак');
  const [timeLabel, setTimeLabel] = useState('09:00');
  const [foodText, setFoodText] = useState('');
  const [wellbeingNote, setWellbeingNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (prefillMealTitle) {
      setEditingId(undefined);
      setFoodText(prefillMealTitle);
      setWellbeingNote('Сытно и спокойно');
      setFormError(null);
      setIsFormOpen(true);
      onClearPrefill?.();
    }
  }, [prefillMealTitle, onClearPrefill]);

  const dayEntries = entries.filter((e) => e.dateISO === selectedDate);

  const openNewForm = () => {
    triggerDelicateHaptic('selection');
    setEditingId(undefined);
    setMealLabel('Завтрак');
    setTimeLabel('09:00');
    setFoodText('');
    setWellbeingNote('');
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEditForm = (entry: ManualDiaryEntry) => {
    triggerDelicateHaptic('selection');
    setEditingId(entry.id);
    setMealLabel(entry.mealLabel);
    setTimeLabel(entry.timeLabel);
    setFoodText(entry.foodText);
    setWellbeingNote(entry.wellbeingNote || '');
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedFood = foodText.trim();
    if (!trimmedFood) {
      setFormError('Напиши коротко, что было на тарелке — в свободной форме.');
      return;
    }
    triggerDelicateHaptic('light');
    onSaveEntry(
      {
        dateISO: selectedDate,
        mealLabel,
        timeLabel: timeLabel.trim() || '12:00',
        foodText: trimmedFood,
        wellbeingNote: wellbeingNote.trim(),
      },
      editingId
    );
    setIsFormOpen(false);
    setEditingId(undefined);
    setFoodText('');
    setWellbeingNote('');
    setFormError(null);
  };

  return (
    <div className="space-y-8">
      <section className="border-b border-[var(--kb-border)] pb-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="space-y-2">
            <div className="kb-section-spine flex items-baseline gap-2.5">
              <span className="kb-display text-[22px] leading-none text-[var(--kb-text-1)] tabular-nums">
                01
              </span>
              <span className="kb-eyebrow text-[var(--kb-text-3)]">
                ЛИЧНЫЙ ДНЕВНИК ТАРЕЛКИ · БЕЗ ШТРАФОВ
              </span>
            </div>
            <h1 className="kb-cover-headline text-[28px] sm:text-[40px] text-[var(--kb-text-1)]">
              Спокойные записи без оценок
            </h1>
            <p className="text-[15px] text-[var(--kb-text-2)] max-w-2xl leading-relaxed">
              Записывай блюда своими словами. Если точная пищевая ценность блюда
              неизвестна (<strong>[УТОЧНИТЬ]</strong>), это не мешает вести
              дневник — здесь нет счётчиков вины и оценок «идеальности».
            </p>
          </div>

          <button
            type="button"
            onClick={openNewForm}
            data-testid="diary-open-form-btn"
            className="kb-btn-primary kb-focus-ring kb-transition-card"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>Записать приём пищи</span>
          </button>
        </div>

        {/* Переключатель даты */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Calendar
            className="w-4 h-4 text-[var(--kb-text-3)] shrink-0"
            aria-hidden="true"
          />
          {AVAILABLE_DATES.map((d) => {
            const active = selectedDate === d.iso;
            return (
              <button
                key={d.iso}
                type="button"
                onClick={() => {
                  triggerDelicateHaptic('selection');
                  onChangeDate(d.iso);
                }}
                data-testid={`diary-date-${d.iso}`}
                aria-pressed={active}
                className={active ? 'kb-btn-tonal kb-focus-ring' : 'kb-btn-outline kb-focus-ring'}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      </section>

      {isFormOpen && (
        <form
          onSubmit={handleSubmit}
          data-testid="diary-entry-form"
          className="kb-panel border-[var(--kb-rule-strong)] space-y-5"
        >
          <div className="kb-section-spine flex items-baseline justify-between gap-2 border-b border-[var(--kb-border)] pb-3">
            <div className="flex items-baseline gap-2.5">
              <span className="kb-display text-[20px] leading-none text-[var(--kb-text-1)] tabular-nums">
                02
              </span>
              <h2 className="kb-eyebrow text-[var(--kb-text-1)]">
                {editingId
                  ? 'РЕДАКТИРОВАТЬ ЗАПИСЬ'
                  : 'НОВАЯ ЗАПИСЬ О ПРИЁМЕ ПИЩИ'}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--kb-text-3)] hover:text-[var(--kb-text-1)]"
            >
              Закрыть
            </button>
          </div>

          <div className="space-y-2">
            <label className="kb-eyebrow text-[10px] text-[var(--kb-text-3)] block">
              ВРЕМЯ И ПРИЁМ ПИЩИ
            </label>
            <div className="flex flex-wrap gap-2">
              {MEAL_SLOTS.map((preset) => (
                <button
                  key={preset.mealLabel}
                  type="button"
                  onClick={() => {
                    setMealLabel(preset.mealLabel);
                    setTimeLabel(preset.timeLabel);
                  }}
                  aria-pressed={mealLabel === preset.mealLabel}
                  className={
                    mealLabel === preset.mealLabel
                      ? 'kb-btn-tonal kb-focus-ring'
                      : 'kb-btn-outline kb-focus-ring'
                  }
                >
                  {preset.mealLabel} · {preset.timeLabel}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="diary-meal-input"
              className="kb-eyebrow text-[10px] text-[var(--kb-text-3)] block"
            >
              ЧТО БЫЛО НА ТАРЕЛКЕ (В СВОБОДНОЙ ФОРМЕ)
            </label>
            <textarea
              id="diary-meal-input"
              data-testid="diary-meal-input"
              rows={3}
              value={foodText}
              onChange={(e) => {
                setFoodText(e.target.value);
                if (formError) setFormError(null);
              }}
              placeholder="Например: Глазунья из двух яиц на топлёном масле и половинка авокадо"
              className="w-full border border-[var(--kb-border)] bg-[var(--kb-bg)] p-3 text-[15px] text-[var(--kb-text-1)] kb-focus-ring"
            />
            {formError && (
              <p
                role="alert"
                className="text-[13px] font-medium text-[var(--kb-danger-ink)] bg-[var(--kb-danger-bg)] px-3 py-2 border border-[var(--kb-danger-border)]"
              >
                {formError}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label
              htmlFor="diary-note-input"
              className="kb-eyebrow text-[10px] text-[var(--kb-text-3)] block"
            >
              ЗАМЕТКА О СЫТОСТИ ИЛИ САМОЧУВСТВИИ (НЕОБЯЗАТЕЛЬНО)
            </label>
            <input
              id="diary-note-input"
              data-testid="diary-note-input"
              type="text"
              value={wellbeingNote}
              onChange={(e) => setWellbeingNote(e.target.value)}
              placeholder="Например: Сытно и спокойно, хватило до обеда"
              className="w-full min-h-[44px] border border-[var(--kb-border)] bg-[var(--kb-bg)] px-3 text-[15px] text-[var(--kb-text-1)] kb-focus-ring"
            />
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {WELLBEING_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setWellbeingNote(preset)}
                  className="min-h-[32px] px-2.5 py-1 border border-[var(--kb-border)] bg-[var(--kb-bg)] hover:bg-[var(--kb-day-active-bg)] text-[11px] text-[var(--kb-text-2)] kb-focus-ring"
                >
                  + {preset}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2 border-t border-[var(--kb-border)]">
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="kb-btn-outline kb-focus-ring"
            >
              Отменить
            </button>
            <button
              type="submit"
              data-testid="diary-submit-btn"
              className="kb-btn-primary kb-focus-ring"
            >
              {editingId ? 'Сохранить изменения' : 'Записать приём пищи'}
            </button>
          </div>
        </form>
      )}

      {dayEntries.length === 0 ? (
        <section
          data-testid="diary-empty-state"
          className="kb-panel sm:p-10 space-y-4"
        >
          <div className="kb-section-spine flex items-baseline gap-2.5">
            <span className="kb-display text-[20px] leading-none text-[var(--kb-text-1)] tabular-nums">
              02
            </span>
            <span className="kb-eyebrow text-[var(--kb-text-3)]">
              ЛИСТ ДНЕВНИКА СВОБОДЕН
            </span>
          </div>
          <div className="space-y-2 max-w-xl">
            <h2 className="kb-display text-[22px] sm:text-[26px] text-[var(--kb-text-1)]">
              За этот день пока нет записей
            </h2>
            <p className="text-[15px] text-[var(--kb-text-2)] leading-relaxed">
              Пустой день остаётся по-настоящему пустым — мы не подставляем за
              тебя демонстрационные приёмы пищи. Добавь первую запись вручную
              или открой блюдо в меню.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={openNewForm}
              data-testid="diary-empty-add-btn"
              className="kb-btn-tonal kb-focus-ring"
            >
              <Utensils className="w-4 h-4" aria-hidden="true" />
              <span>Записать приём пищи</span>
            </button>
            <button
              type="button"
              onClick={onOpenMenu}
              className="kb-btn-outline kb-focus-ring"
            >
              Посмотреть меню
            </button>
          </div>
        </section>
      ) : (
        <div className="space-y-4" data-testid="diary-entries-list">
          {dayEntries.map((entry, idx) => (
            <article key={entry.id} className="kb-panel space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1.5 min-w-0">
                  <div className="kb-section-spine flex items-baseline gap-2.5">
                    <span className="kb-display text-[18px] leading-none text-[var(--kb-text-1)] tabular-nums">
                      0{idx + 2}
                    </span>
                    <span className="kb-eyebrow text-[var(--kb-text-3)] tabular-nums">
                      {entry.mealLabel} · {entry.timeLabel}
                    </span>
                  </div>
                  <p className="text-[17px] font-medium text-[var(--kb-text-1)] leading-snug break-words">
                    {entry.foodText}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEditForm(entry)}
                    data-testid={`diary-edit-${entry.id}`}
                    aria-label="Редактировать запись"
                    className="min-h-[42px] min-w-[42px] border border-[var(--kb-border)] bg-[var(--kb-bg)] flex items-center justify-center text-[var(--kb-text-3)] hover:text-[var(--kb-text-1)] kb-focus-ring"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      triggerDelicateHaptic('selection');
                      onDeleteEntry(entry.id);
                    }}
                    data-testid={`diary-delete-${entry.id}`}
                    aria-label="Удалить запись"
                    className="min-h-[42px] min-w-[42px] border border-[var(--kb-border)] bg-[var(--kb-bg)] flex items-center justify-center text-[var(--kb-danger-ink)] hover:bg-[var(--kb-danger-bg)] kb-focus-ring"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {entry.wellbeingNote && (
                <div className="border-t border-[var(--kb-border)] pt-2.5 text-[13px] text-[var(--kb-text-3)]">
                  Самочувствие и сытость:{' '}
                  <span className="text-[var(--kb-text-1)] font-medium">
                    {entry.wellbeingNote}
                  </span>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
};

interface SupportScreenProps {
  transportState: SupportTransportState;
  onChangeTransportState: (state: SupportTransportState) => void;
  onOpenSupportAction: (topic: string, userNote: string) => void;
  onReturnBack: () => void;
  returnContextLabel: string;
}

const SUPPORT_TOPICS = [
  'Помочь с выбором между кето и карнивор',
  'Вопрос по замене ингредиентов или аллергии',
  'Как спокойно совмещать меню с готовкой на семью',
  'Личное сопровождение Ольги на марафоне',
];

const TRANSPORT_STATES: Array<{
  id: SupportTransportState;
  label: string;
  badge: string;
  description: string;
}> = [
  {
    id: 'idle',
    label: 'Готово к обращению',
    badge: 'Ожидание действия',
    description:
      'Выбери тему и при желании напиши пару строк. В рабочем приложении кнопка откроет личный диалог с Ольгой через бот.',
  },
  {
    id: 'pending',
    label: 'Переход к диалогу…',
    badge: 'Проверяем переход',
    description:
      'Запрос передаётся в защищённый обработчик бота. Успех не отображается заранее до ответа.',
  },
  {
    id: 'confirmed',
    label: 'Переход подтверждён',
    badge: 'Подтверждено в макете',
    description:
      'В рабочей связке открывается личный чат с Ольгой с уже подготовленной темой вопроса.',
  },
  {
    id: 'failed',
    label: 'Ошибка соединения',
    badge: 'Не отправлено',
    description:
      'Сетевой переход не удался. Текст твоего вопроса сохранён на экране — мы никогда не показываем ложную галочку успеха при ошибке API.',
  },
  {
    id: 'unknown',
    label: 'Статус неизвестен',
    badge: 'Нужна проверка',
    description:
      'Ответ от окружения Telegram WebApp не получен. Ты можешь повторить переход или скопировать текст вопроса.',
  },
];

export const SupportScreen: React.FC<SupportScreenProps> = ({
  transportState,
  onChangeTransportState,
  onOpenSupportAction,
  onReturnBack,
  returnContextLabel,
}) => {
  const [selectedTopic, setSelectedTopic] = useState(SUPPORT_TOPICS[0]);
  const [userNote, setUserNote] = useState('');
  const [demoClickNotice, setDemoClickNotice] = useState(false);

  const currentTransportMeta =
    TRANSPORT_STATES.find((s) => s.id === transportState) || TRANSPORT_STATES[0];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div
        data-testid="support-demo-banner"
        className="border border-[var(--kb-warn-border)] bg-[var(--kb-warn-bg)] p-4 flex items-start gap-3"
      >
        <AlertTriangle
          className="w-5 h-5 text-[var(--kb-warn-ink)] shrink-0 mt-0.5"
          aria-hidden="true"
        />
        <div className="space-y-1 text-[13px] leading-relaxed">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold text-[var(--kb-warn-ink)]">
              Демонстрация: сообщения не отправляются
            </p>
            <span className="px-2 py-0.5 bg-[var(--kb-surface)] border border-[var(--kb-warn-border)] text-[11px] font-semibold text-[var(--kb-warn-ink)]">
              Статус: демо · транспорт отключён
            </span>
          </div>
          <p className="text-[var(--kb-text-1)]">
            Токен бота не используется: сетевой транспорт отключён, зашитых
            получателей и обходов проверки нет.
          </p>
        </div>
      </div>

      <section className="kb-panel sm:p-7 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--kb-border)] pb-4">
          <div className="space-y-1.5">
            <div className="kb-section-spine flex items-baseline gap-2.5">
              <span className="kb-display text-[20px] leading-none text-[var(--kb-text-1)] tabular-nums">
                01
              </span>
              <span className="kb-eyebrow text-[var(--kb-text-3)]">
                ЛИЧНАЯ СВЯЗЬ · ОЛЬГА · РЕЖИМ: ДЕМО
              </span>
            </div>
            <h1 className="kb-cover-headline text-[26px] sm:text-[34px] text-[var(--kb-text-1)]">
              Написать Ольге лично
            </h1>
          </div>
          <button
            type="button"
            onClick={onReturnBack}
            data-testid="support-return-btn"
            className="kb-btn-outline kb-focus-ring"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span>{returnContextLabel}</span>
          </button>
        </div>

        <p className="text-[15px] leading-relaxed text-[var(--kb-text-2)]">
          Обращение идёт лично Ольге через бот-переход — не в общий канал и не к
          вымышленному дежурному специалисту. Если ты перешла сюда из анкеты
          настроек, твой шаг и черновик бережно сохранены.
        </p>

        <div className="space-y-2">
          <span className="kb-eyebrow text-[10px] text-[var(--kb-text-3)] block">
            О ЧЁМ ХОЧЕТСЯ СПРОСИТЬ?
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {SUPPORT_TOPICS.map((topic) => {
              const active = selectedTopic === topic;
              return (
                <button
                  key={topic}
                  type="button"
                  onClick={() => {
                    triggerDelicateHaptic('selection');
                    setSelectedTopic(topic);
                  }}
                  aria-pressed={active}
                  className={`min-h-[48px] p-3.5 border text-left text-[13px] leading-snug kb-focus-ring kb-transition-day ${
                    active
                      ? 'border-[var(--kb-rule-strong)] bg-[var(--kb-day-active-bg)] font-semibold text-[var(--kb-text-1)]'
                      : 'border-[var(--kb-border)] bg-[var(--kb-bg)] text-[var(--kb-text-2)] hover:text-[var(--kb-text-1)]'
                  }`}
                >
                  {topic}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="support-note-input"
            className="kb-eyebrow text-[10px] text-[var(--kb-text-3)] block"
          >
            КОРОТКО ОПИШИ ВОПРОС (СОХРАНИТСЯ НА ЭКРАНЕ ПРИ ЛЮБОЙ ОШИБКЕ СЕТИ)
          </label>
          <textarea
            id="support-note-input"
            data-testid="support-note-input"
            rows={3}
            value={userNote}
            onChange={(e) => setUserNote(e.target.value)}
            placeholder="Например: Исключаю молочные продукты и яйца, хочу понять, подойдёт ли мне стартовое меню"
            className="w-full border border-[var(--kb-border)] bg-[var(--kb-bg)] p-3 text-[15px] text-[var(--kb-text-1)] kb-focus-ring"
          />
        </div>

        <div className="bg-[var(--kb-bg)] border border-[var(--kb-border)] p-4 space-y-1.5 text-[13px] text-[var(--kb-text-3)]">
          <div className="font-semibold text-[var(--kb-text-1)]">
            Что происходит при нажатии кнопки в рабочем приложении:
          </div>
          <p>
            1. Вызывается интеграционный колбэк <code>onOpenSupport</code> с
            выбранной темой и флагом сохранённого черновика.
          </p>
          <p>
            2. Открывается личный диалог с Ольгой в Telegram-боте. Твой дневник
            питания никогда не пересылается автоматически.
          </p>
        </div>

        {demoClickNotice && (
          <div
            role="status"
            data-testid="support-demo-click-notice"
            className="border border-[var(--kb-warn-border)] bg-[var(--kb-warn-bg)] px-4 py-3 text-[13px] font-semibold text-[var(--kb-warn-ink)]"
          >
            Демонстрация: сообщения не отправляются (транспорт отключён, статус
            «демо»).
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <button
            type="button"
            onClick={() => {
              triggerDelicateHaptic('selection');
              setDemoClickNotice(true);
              onOpenSupportAction(selectedTopic, userNote);
            }}
            data-testid="support-primary-cta"
            className="kb-btn-primary kb-focus-ring kb-transition-card"
          >
            <MessageCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Демонстрация: сообщения не отправляются</span>
          </button>

          <button
            type="button"
            onClick={onReturnBack}
            className="kb-btn-outline kb-focus-ring"
          >
            Вернуться без отправки
          </button>
        </div>
      </section>

      <section className="kb-panel space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="kb-section-spine">
            <h2 className="text-[15px] font-bold text-[var(--kb-text-1)]">
              Проверка состояний перехода (<code>SupportTransportState</code>)
            </h2>
            <p className="text-[12px] text-[var(--kb-text-3)]">
              Переключи состояние, чтобы убедиться, что сбой API не выдаётся за
              успешную доставку
            </p>
          </div>
          <span
            data-testid="support-transport-badge"
            className="px-2.5 py-1 bg-[var(--kb-day-active-bg)] border border-[var(--kb-border)] text-[11px] font-semibold text-[var(--kb-text-1)]"
          >
            {currentTransportMeta.badge}
          </span>
        </div>

        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Состояния транспорта поддержки"
        >
          {TRANSPORT_STATES.map((st) => {
            const active = transportState === st.id;
            return (
              <button
                key={st.id}
                type="button"
                onClick={() => {
                  triggerDelicateHaptic('selection');
                  onChangeTransportState(st.id);
                }}
                data-testid={`support-state-${st.id}`}
                aria-pressed={active}
                className={active ? 'kb-btn-tonal kb-focus-ring' : 'kb-btn-outline kb-focus-ring'}
              >
                {st.id}
              </button>
            );
          })}
        </div>

        <div
          data-testid="support-state-details"
          className={`p-4 border text-[13px] leading-relaxed flex items-start gap-3 ${
            transportState === 'confirmed'
              ? 'border-[var(--kb-rule-strong)] bg-[var(--kb-day-active-bg)] text-[var(--kb-text-1)]'
              : transportState === 'failed'
              ? 'border-[var(--kb-danger-border)] bg-[var(--kb-danger-bg)] text-[var(--kb-danger-ink)]'
              : transportState === 'unknown' || transportState === 'pending'
              ? 'border-[var(--kb-warn-border)] bg-[var(--kb-warn-bg)] text-[var(--kb-warn-ink)]'
              : 'border-[var(--kb-border)] bg-[var(--kb-bg)] text-[var(--kb-text-2)]'
          }`}
        >
          {transportState === 'confirmed' && (
            <CheckCircle2 className="w-5 h-5 text-[var(--kb-text-1)] shrink-0 mt-0.5" />
          )}
          {transportState === 'failed' && (
            <AlertTriangle className="w-5 h-5 text-[var(--kb-danger-ink)] shrink-0 mt-0.5" />
          )}
          {(transportState === 'pending' || transportState === 'unknown') && (
            <Clock className="w-5 h-5 text-[var(--kb-warn-ink)] shrink-0 mt-0.5" />
          )}
          {transportState === 'idle' && (
            <HelpCircle className="w-5 h-5 text-[var(--kb-text-3)] shrink-0 mt-0.5" />
          )}
          <div className="space-y-1">
            <div className="font-bold">
              {currentTransportMeta.label} (<code>{currentTransportMeta.id}</code>)
            </div>
            <p>{currentTransportMeta.description}</p>
          </div>
        </div>
      </section>
    </div>
  );
};

interface MoreScreenProps {
  recipes: RecipeViewModel[];
  onOpenRecipe: (recipeId: string) => void;
  onOpenSettings: () => void;
  onOpenSupport: () => void;
  onOpenAccess: () => void;
  onClearLocalData: () => void;
}

export const MoreScreen: React.FC<MoreScreenProps> = ({
  recipes,
  onOpenRecipe,
  onOpenSettings,
  onOpenSupport,
  onOpenAccess,
  onClearLocalData,
}) => {
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearedNotice, setClearedNotice] = useState(false);
  const [catalogFilter, setCatalogFilter] = useState<
    'all' | 'quick' | 'carnivore'
  >('all');

  const filteredRecipes = recipes.filter((r) => {
    if (catalogFilter === 'quick') return r.prepMinutes <= 20;
    if (catalogFilter === 'carnivore')
      return r.suitableFor.includes('carnivore');
    return true;
  });

  return (
    <div className="space-y-8">
      <section className="border-b border-[var(--kb-border)] pb-6 space-y-5">
        <div className="space-y-2">
          <div className="kb-section-spine flex items-baseline gap-2.5">
            <span className="kb-display text-[22px] leading-none text-[var(--kb-text-1)] tabular-nums">
              01
            </span>
            <span className="kb-eyebrow text-[var(--kb-text-3)]">
              СПРАВОЧНИК И АРХИВ РЕЦЕПТОВ
            </span>
          </div>
          <h1 className="kb-cover-headline text-[28px] sm:text-[40px] text-[var(--kb-text-1)]">
            Каталог блюд, памятки и настройки
          </h1>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(
            [
              {
                testId: 'more-open-settings',
                onClick: onOpenSettings,
                Icon: Settings,
                title: 'Настройки и анкета',
                desc: 'Изменить ограничения, время готовки или число приёмов пищи',
              },
              {
                testId: 'more-open-support',
                onClick: onOpenSupport,
                Icon: MessageCircle,
                title: 'Связь с Ольгой',
                desc: 'Спокойно обсудить замены или личное сопровождение',
              },
              {
                testId: 'more-open-access',
                onClick: onOpenAccess,
                Icon: Sparkles,
                title: 'Предложение доступа',
                desc: 'Сравнение бесплатного примера, старта и подписки',
              },
            ] as const
          ).map(({ testId, onClick, Icon, title, desc }) => (
            <button
              key={testId}
              type="button"
              onClick={onClick}
              data-testid={testId}
              className="min-h-[68px] p-4 border border-[var(--kb-border)] bg-[var(--kb-surface)] hover:bg-[var(--kb-day-active-bg)] text-left space-y-1.5 kb-focus-ring kb-transition-day"
            >
              <div className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.06em] text-[var(--kb-text-1)]">
                <Icon className="w-4 h-4 text-[var(--kb-text-3)]" aria-hidden="true" />
                <span>{title}</span>
              </div>
              <p className="text-[12px] text-[var(--kb-text-3)]">{desc}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--kb-border)] pb-3">
          <div className="kb-section-spine flex items-baseline gap-2.5">
            <span className="kb-display text-[22px] leading-none text-[var(--kb-text-1)] tabular-nums">
              02
            </span>
            <div>
              <h2 className="kb-eyebrow text-[var(--kb-text-3)]">
                КАТАЛОГ РЕЦЕПТОВ «КЕТО БАЛАНС»
              </h2>
              <p className="text-[13px] text-[var(--kb-text-2)] mt-0.5">
                Открой любое блюдо для просмотра шагов, таймера и подачи
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'all', label: `Все блюда (${recipes.length})` },
                { id: 'quick', label: 'До 20 мин' },
                { id: 'carnivore', label: 'Карнивор' },
              ] as const
            ).map((f) => {
              const active = catalogFilter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setCatalogFilter(f.id)}
                  aria-pressed={active}
                  className={`min-h-[36px] px-3 py-1 border text-[11px] font-semibold uppercase tracking-[0.08em] tabular-nums kb-focus-ring ${
                    active
                      ? 'bg-[var(--kb-day-active-bg)] border-[var(--kb-rule-strong)] text-[var(--kb-text-1)]'
                      : 'bg-[var(--kb-surface)] border-[var(--kb-border)] text-[var(--kb-text-3)]'
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {filteredRecipes.map((recipe) => (
            <div
              key={recipe.id}
              className="kb-panel flex flex-col justify-between gap-4"
            >
              <div className="space-y-3.5">
                <RecipeArtwork
                  artworkKey={recipe.artworkKey}
                  caption={recipe.artworkCaption}
                  prepMinutes={recipe.prepMinutes}
                  slotLabel={recipe.slotLabel}
                  size="compact"
                />
                <div className="space-y-1">
                  <div className="kb-eyebrow text-[10px] text-[var(--kb-text-3)] tabular-nums">
                    {recipe.slotLabel} · {recipe.prepMinutes} МИН
                  </div>
                  <h3 className="kb-display text-[20px] leading-snug text-[var(--kb-text-1)] break-words">
                    {recipe.title}
                  </h3>
                  <p className="text-[14px] text-[var(--kb-text-2)] leading-snug">
                    {recipe.subtitle}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onOpenRecipe(recipe.id)}
                data-testid={`more-recipe-${recipe.id}`}
                className="kb-btn-outline w-full kb-focus-ring kb-transition-day"
              >
                Открыть рецепт →
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="kb-panel space-y-4">
        <div className="kb-section-spine flex items-baseline gap-2.5 border-b border-[var(--kb-border)] pb-3">
          <span className="kb-display text-[20px] leading-none text-[var(--kb-text-1)] tabular-nums">
            03
          </span>
          <BookOpen className="w-4 h-4 text-[var(--kb-text-3)]" aria-hidden="true" />
          <h2 className="kb-eyebrow text-[var(--kb-text-3)]">
            СПОКОЙНЫЕ ПАМЯТКИ ПО КУХНЕ И ПРОДУКТАМ
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {DEMO_MATERIALS.map((mat) => (
            <article
              key={mat.id}
              className="border border-[var(--kb-border)] bg-[var(--kb-bg)] p-4 space-y-2.5"
            >
              <h3 className="kb-display text-[18px] text-[var(--kb-text-1)]">
                {mat.title}
              </h3>
              <p className="text-[13px] text-[var(--kb-text-2)] leading-relaxed">
                {mat.summary}
              </p>
              <ul className="space-y-1 text-[13px] text-[var(--kb-text-2)]">
                {mat.contentPoints.map((pt, i) => (
                  <li key={i}>— {pt}</li>
                ))}
              </ul>
              <div className="pt-2 border-t border-[var(--kb-border)] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--kb-text-4)]">
                <span>Источник: {mat.sourceLabel}</span>
                <span>Статус проверки: {mat.verificationStatus}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="kb-panel space-y-3">
        <div className="kb-section-spine flex items-baseline gap-2.5">
          <span className="kb-display text-[20px] leading-none text-[var(--kb-text-1)] tabular-nums">
            04
          </span>
          <ShieldCheck className="w-4 h-4 text-[var(--kb-text-3)]" aria-hidden="true" />
          <h2 className="kb-eyebrow text-[var(--kb-text-3)]">
            ПРИВАТНОСТЬ И ЛОКАЛЬНЫЕ ДАННЫЕ НА УСТРОЙСТВЕ
          </h2>
        </div>
        <p className="text-[13px] text-[var(--kb-text-2)] leading-relaxed">
          Твои черновики настроек, отмеченные покупки и записи дневника хранятся
          только локально в браузере этого устройства (<code>localStorage</code>
          ). Дневники никогда не отправляются в облачные хранилища или внешние
          языковые модели.
        </p>
        {clearedNotice && (
          <p className="text-[13px] font-semibold text-[var(--kb-text-1)]">
            Локальные черновики и записи дневника очищены.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          {!confirmClear ? (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              data-testid="more-clear-data-btn"
              className="kb-btn-outline kb-focus-ring"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Очистить локальные данные прототипа</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  onClearLocalData();
                  setConfirmClear(false);
                  setClearedNotice(true);
                }}
                data-testid="more-confirm-clear-btn"
                className="min-h-[42px] px-4 py-2 bg-[var(--kb-danger-ink)] text-[var(--kb-on-primary)] text-[11px] font-semibold uppercase tracking-[0.1em] kb-focus-ring"
              >
                Подтвердить сброс данных
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="kb-btn-outline kb-focus-ring"
              >
                Отмена
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
};

interface AccessOfferScreenProps {
  onRequestAccess: (
    tier: 'free' | 'starter' | 'subscription' | 'personal_support'
  ) => void;
  onOpenSupport: () => void;
  onReturnBack: () => void;
}

const ACCESS_TIERS = [
  {
    id: 'free' as const,
    tag: '01 · ЗНАКОМСТВО',
    title: 'Бесплатный пример',
    price: '0 ₽ · открыто сейчас',
    cta: 'Продолжить с бесплатным примером',
    featured: false,
    points: [
      'Пример спокойного меню на 3 дня',
      'Список покупок по отделам магазина',
      'Ручной дневник питания без ограничений',
    ],
  },
  {
    id: 'starter' as const,
    tag: '02 · СПОКОЙНЫЙ СТАРТ',
    title: 'Разовый стартовый продукт',
    price: 'Стоимость: [УТОЧНИТЬ]',
    cta: 'Узнать условия старта',
    featured: true,
    points: [
      'Полная база проверенных кето и карнивор блюд',
      'Готовые замены продуктов под твои фильтры',
      'Памятки по заготовкам и хранению от Ольги',
    ],
  },
  {
    id: 'subscription' as const,
    tag: '03 · РЕГУЛЯРНЫЕ МЕНЮ',
    title: 'Подписка «Кето Баланс»',
    price: 'Стоимость: [УТОЧНИТЬ] / мес',
    cta: 'Запросить условия подписки',
    featured: false,
    points: [
      'Сезонные подборки меню каждую неделю',
      'Связанные списки покупок под твой ритм',
      'Понятная отмена без потери личного дневника',
    ],
  },
];

export const AccessOfferScreen: React.FC<AccessOfferScreenProps> = ({
  onRequestAccess,
  onOpenSupport,
  onReturnBack,
}) => {
  const [selectedTier, setSelectedTier] = useState<
    'free' | 'starter' | 'subscription' | 'personal_support' | null
  >(null);

  return (
    <div className="space-y-6">
      <section className="border-b border-[var(--kb-border)] pb-6 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <div className="kb-section-spine flex items-baseline gap-2.5">
              <span className="kb-display text-[20px] leading-none text-[var(--kb-text-1)] tabular-nums">
                01
              </span>
              <span className="kb-eyebrow text-[var(--kb-text-3)]">
                ПРЕДЛОЖЕНИЕ ДОСТУПА · ФОРМАТЫ УЧАСТИЯ
              </span>
            </div>
            <h1 className="kb-cover-headline text-[28px] sm:text-[38px] text-[var(--kb-text-1)]">
              Форматы участия в «Кето Баланс»
            </h1>
          </div>
          <button
            type="button"
            onClick={onReturnBack}
            className="kb-btn-outline kb-focus-ring"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span>Назад</span>
          </button>
        </div>

        <p className="text-[15px] text-[var(--kb-text-2)] leading-relaxed max-w-2xl">
          Выбирай комфортный темп: познакомься с бесплатным примером меню,
          возьми разовый стартовый набор или подключи обновление рационов.
          Точные цены помечены как{' '}
          <strong className="text-[var(--kb-text-1)]">[УТОЧНИТЬ]</strong> до
          утверждения владельцем.
        </p>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {ACCESS_TIERS.map((t) => (
          <article
            key={t.id}
            className={`kb-panel flex flex-col justify-between gap-4 ${
              t.featured ? 'border-2 border-[var(--kb-rule-strong)]' : ''
            }`}
          >
            <div className="space-y-2.5">
              <span className="kb-eyebrow text-[10px] text-[var(--kb-text-3)]">
                {t.tag}
              </span>
              <h2 className="kb-display text-[22px] text-[var(--kb-text-1)]">
                {t.title}
              </h2>
              <div className="text-[15px] font-semibold text-[var(--kb-text-1)] tabular-nums">
                {t.price}
              </div>
              <ul className="space-y-1.5 text-[13px] text-[var(--kb-text-2)] leading-relaxed">
                {t.points.map((p, i) => (
                  <li key={i}>— {p}</li>
                ))}
              </ul>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedTier(t.id);
                onRequestAccess(t.id);
              }}
              data-testid={`access-tier-${t.id}`}
              className={`w-full kb-focus-ring ${
                t.featured ? 'kb-btn-primary' : 'kb-btn-outline'
              }`}
            >
              {t.cta}
            </button>
          </article>
        ))}
      </div>

      <section className="kb-panel space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="kb-eyebrow text-[10px] text-[var(--kb-text-3)]">
            04 · ОТДЕЛЬНАЯ ОГРАНИЧНАЯ УСЛУГА
          </span>
          <span className="text-[12px] font-semibold text-[var(--kb-text-1)] tabular-nums">
            Стоимость и места: [УТОЧНИТЬ]
          </span>
        </div>
        <h2 className="kb-display text-[22px] text-[var(--kb-text-1)]">
          Личное сопровождение Ольги на марафоне
        </h2>
        <p className="text-[14px] text-[var(--kb-text-2)] leading-relaxed">
          Индивидуальный разбор твоей продуктовой корзины, спокойная адаптация
          меню под график семьи и личная обратная связь Ольги в боте.
        </p>
        <div className="pt-1">
          <button
            type="button"
            onClick={() => {
              setSelectedTier('personal_support');
              onRequestAccess('personal_support');
              onOpenSupport();
            }}
            data-testid="access-tier-mentorship"
            className="kb-btn-tonal kb-focus-ring"
          >
            <MessageCircle className="w-4 h-4" aria-hidden="true" />
            <span>Спросить Ольгу о личном сопровождении</span>
          </button>
        </div>
      </section>

      {selectedTier && (
        <div
          data-testid="access-demo-feedback"
          className="border border-[var(--kb-rule-strong)] bg-[var(--kb-day-active-bg)] p-4 text-[13px] text-[var(--kb-text-1)]"
        >
          Выбран уровень: <strong>{selectedTier}</strong>. В демонстрационном
          прототипе оплата не подключена (вызван локальный шов{' '}
          <code>onRequestAccess</code>).
        </div>
      )}

      <section className="kb-panel text-[13px] text-[var(--kb-text-2)] leading-relaxed flex items-start gap-2.5">
        <ShieldCheck
          className="w-5 h-5 text-[var(--kb-text-3)] shrink-0 mt-0.5"
          aria-hidden="true"
        />
        <p>
          <strong className="text-[var(--kb-text-1)]">
            Честные правила доступа:
          </strong>{' '}
          твой ручной дневник питания, настройки приватности и отмена подписки
          никогда не блокируются и остаются доступными вне зависимости от
          выбранного тарифа.
        </p>
      </section>
    </div>
  );
};
