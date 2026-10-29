import React, { useState } from 'react';
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
} from 'lucide-react';
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

export const ManualDiaryScreen: React.FC<ManualDiaryScreenProps> = ({
  selectedDate,
  onChangeDate,
  entries,
  onSaveEntry,
  onDeleteEntry,
  onOpenMenu,
}) => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [mealLabel, setMealLabel] =
    useState<ManualDiaryEntry['mealLabel']>('Завтрак');
  const [timeLabel, setTimeLabel] = useState('09:00');
  const [foodText, setFoodText] = useState('');
  const [wellbeingNote, setWellbeingNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

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
    <div className="space-y-5">
      <section className="bg-[var(--kb-surface)] rounded-2xl border border-[var(--kb-border)] p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-[var(--kb-primary)]">
              Ручной дневник питания
            </span>
            <h1 className="text-xl sm:text-2xl font-bold text-[var(--kb-ink)]">
              Спокойные записи без оценок
            </h1>
          </div>
          <button
            type="button"
            onClick={openNewForm}
            data-testid="diary-open-form-btn"
            className="min-h-[48px] px-5 py-2.5 rounded-xl bg-[var(--kb-primary)] hover:bg-[var(--kb-primary-hover)] text-white font-semibold text-sm inline-flex items-center gap-2 transition-colors kb-focus-ring"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>Записать приём пищи</span>
          </button>
        </div>

        <p className="text-sm leading-relaxed text-[var(--kb-muted)]">
          Записывай блюда своими словами. Если точная пищевая ценность блюда неизвестна (<strong>[УТОЧНИТЬ]</strong>), это не мешает вести дневник — здесь нет штрафов и оценок «идеальности».
        </p>

        {/* Переключатель даты */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Calendar className="w-4 h-4 text-[var(--kb-muted)] shrink-0" aria-hidden="true" />
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
                className={`min-h-[44px] px-3.5 py-1.5 rounded-xl border text-xs sm:text-sm font-semibold transition-colors kb-focus-ring ${
                  active
                    ? 'border-[var(--kb-primary)] bg-[var(--kb-sage)] text-[var(--kb-ink)]'
                    : 'border-[var(--kb-border)] bg-[var(--kb-surface)] text-[var(--kb-muted)] hover:text-[var(--kb-ink)]'
                }`}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Форма создания / редактирования записи */}
      {isFormOpen && (
        <form
          onSubmit={handleSubmit}
          data-testid="diary-entry-form"
          className="bg-[var(--kb-surface)] rounded-2xl border-2 border-[var(--kb-primary)] p-5 space-y-4"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base sm:text-lg font-bold text-[var(--kb-ink)]">
              {editingId ? 'Редактировать запись' : 'Новая запись о приёме пищи'}
            </h2>
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="min-h-[44px] px-2 text-xs font-medium text-[var(--kb-muted)] underline"
            >
              Закрыть
            </button>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[var(--kb-muted)] block">
              Приём пищи
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
                  className={`min-h-[44px] px-3.5 py-1.5 rounded-xl border text-xs sm:text-sm font-medium transition-colors kb-focus-ring ${
                    mealLabel === preset.mealLabel
                      ? 'border-[var(--kb-primary)] bg-[var(--kb-sage)] text-[var(--kb-ink)] font-semibold'
                      : 'border-[var(--kb-border)] bg-[var(--kb-surface)] text-[var(--kb-muted)]'
                  }`}
                >
                  {preset.mealLabel} · {preset.timeLabel}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="diary-meal-input"
              className="text-xs font-semibold text-[var(--kb-muted)] block"
            >
              Что было на тарелке (в свободной форме)
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
              className="w-full rounded-xl border border-[var(--kb-border)] bg-[var(--kb-bg)] p-3 text-sm sm:text-base text-[var(--kb-ink)] kb-focus-ring"
            />
            {formError && (
              <p
                role="alert"
                className="text-xs font-medium text-[var(--kb-danger-ink)] bg-[var(--kb-danger-bg)] px-3 py-2 rounded-lg"
              >
                {formError}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="diary-note-input"
              className="text-xs font-semibold text-[var(--kb-muted)] block"
            >
              Заметка о сытости или самочувствии (необязательно, без медицинских оценок)
            </label>
            <input
              id="diary-note-input"
              data-testid="diary-note-input"
              type="text"
              value={wellbeingNote}
              onChange={(e) => setWellbeingNote(e.target.value)}
              placeholder="Например: Сытно и спокойно, хватило до обеда"
              className="w-full min-h-[44px] rounded-xl border border-[var(--kb-border)] bg-[var(--kb-bg)] px-3 text-sm sm:text-base text-[var(--kb-ink)] kb-focus-ring"
            />
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-[var(--kb-border)] text-sm font-medium text-[var(--kb-ink)] kb-focus-ring"
            >
              Отменить
            </button>
            <button
              type="submit"
              data-testid="diary-submit-btn"
              className="min-h-[48px] px-5 py-2.5 rounded-xl bg-[var(--kb-primary)] text-white text-sm font-semibold kb-focus-ring"
            >
              {editingId ? 'Сохранить изменения' : 'Записать приём пищи'}
            </button>
          </div>
        </form>
      )}

      {/* Список записей за выбранный день или честное пустое состояние */}
      {dayEntries.length === 0 ? (
        <section
          data-testid="diary-empty-state"
          className="bg-[var(--kb-surface)] rounded-2xl border border-[var(--kb-border)] p-6 sm:p-8 text-center space-y-3"
        >
          <div className="w-11 h-11 rounded-2xl bg-[var(--kb-sage)] text-[var(--kb-primary)] mx-auto flex items-center justify-center">
            <Utensils className="w-5 h-5" aria-hidden="true" />
          </div>
          <div className="space-y-1 max-w-md mx-auto">
            <h2 className="text-lg font-bold text-[var(--kb-ink)]">
              За этот день пока нет записей
            </h2>
            <p className="text-sm text-[var(--kb-muted)] leading-relaxed">
              Пустой день остаётся по-настоящему пустым — мы не подставляем за тебя демонстрационные приёмы пищи. Добавь первую запись вручную или загляни в меню.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
            <button
              type="button"
              onClick={openNewForm}
              data-testid="diary-empty-add-btn"
              className="min-h-[48px] px-5 py-2.5 rounded-xl bg-[var(--kb-primary)] text-white text-sm font-semibold inline-flex items-center gap-2 kb-focus-ring"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>Записать приём пищи</span>
            </button>
            <button
              type="button"
              onClick={onOpenMenu}
              className="min-h-[48px] px-4 py-2.5 rounded-xl border border-[var(--kb-border)] bg-[var(--kb-bg)] text-sm font-medium text-[var(--kb-ink)] kb-focus-ring"
            >
              Посмотреть меню
            </button>
          </div>
        </section>
      ) : (
        <div className="space-y-3" data-testid="diary-entries-list">
          {dayEntries.map((entry) => (
            <article
              key={entry.id}
              className="bg-[var(--kb-surface)] rounded-2xl border border-[var(--kb-border)] p-4 sm:p-5 space-y-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1 min-w-0">
                  <span className="inline-block px-2.5 py-0.5 rounded-lg bg-[var(--kb-sage)] text-xs font-semibold text-[var(--kb-ink)]">
                    {entry.mealLabel} · {entry.timeLabel}
                  </span>
                  <p className="text-base font-medium text-[var(--kb-ink)] leading-relaxed break-words">
                    {entry.foodText}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEditForm(entry)}
                    data-testid={`diary-edit-${entry.id}`}
                    aria-label="Редактировать запись"
                    className="min-h-[44px] min-w-[44px] rounded-xl border border-[var(--kb-border)] bg-[var(--kb-bg)] flex items-center justify-center text-[var(--kb-muted)] hover:text-[var(--kb-ink)] kb-focus-ring"
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
                    className="min-h-[44px] min-w-[44px] rounded-xl border border-[var(--kb-border)] bg-[var(--kb-bg)] flex items-center justify-center text-[var(--kb-danger-ink)] hover:bg-[var(--kb-danger-bg)] kb-focus-ring"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {entry.wellbeingNote && (
                <div className="rounded-xl bg-[var(--kb-bg)] px-3.5 py-2 text-xs sm:text-sm text-[var(--kb-muted)]">
                  Самочувствие и сытость:{' '}
                  <span className="text-[var(--kb-ink)] font-medium">
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
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Недвусмысленная демо-плашка: отсутствие токена = транспорт отключён, статус «демо» */}
      <div
        data-testid="support-demo-banner"
        className="rounded-2xl border border-[var(--kb-warn-border)] bg-[var(--kb-warn-bg)] p-4 flex items-start gap-3"
      >
        <AlertTriangle
          className="w-5 h-5 text-[var(--kb-warn-ink)] shrink-0 mt-0.5"
          aria-hidden="true"
        />
        <div className="space-y-1 text-xs sm:text-sm leading-relaxed">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold text-[var(--kb-warn-ink)]">
              Демонстрация: сообщения не отправляются
            </p>
            <span className="px-2 py-0.5 rounded bg-[var(--kb-surface)] border border-[var(--kb-warn-border)] text-[11px] font-semibold text-[var(--kb-warn-ink)]">
              Статус: демо · транспорт отключён
            </span>
          </div>
          <p className="text-[var(--kb-ink)]">
            Токен бота не используется: сетевой транспорт отключён, зашитых получателей и обходов проверки нет.
          </p>
        </div>
      </div>

      <section className="bg-[var(--kb-surface)] rounded-2xl border border-[var(--kb-border)] p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-[var(--kb-primary)]">
              Личная связь · Ольга · Режим: демо
            </span>
            <h1 className="text-xl sm:text-2xl font-bold text-[var(--kb-ink)]">
              Написать Ольге лично
            </h1>
          </div>
          <button
            type="button"
            onClick={onReturnBack}
            data-testid="support-return-btn"
            className="min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--kb-border)] bg-[var(--kb-bg)] text-xs sm:text-sm font-medium text-[var(--kb-ink)] inline-flex items-center gap-1.5 kb-focus-ring"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span>{returnContextLabel}</span>
          </button>
        </div>

        <p className="text-sm sm:text-base leading-relaxed text-[var(--kb-muted)]">
          Обращение идёт лично Ольге через бот-переход — не в общий канал и не к вымышленному дежурному специалисту. Если ты перешла сюда из анкеты настроек, твой шаг и черновик бережно сохранены.
        </p>

        {/* Выбор темы вопроса */}
        <div className="space-y-2">
          <span className="text-xs sm:text-sm font-semibold text-[var(--kb-ink)] block">
            О чём хочется спросить?
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
                  className={`min-h-[48px] p-3.5 rounded-xl border text-left text-xs sm:text-sm leading-snug transition-colors kb-focus-ring ${
                    active
                      ? 'border-[var(--kb-primary)] bg-[var(--kb-sage)] font-semibold text-[var(--kb-ink)]'
                      : 'border-[var(--kb-border)] bg-[var(--kb-surface)] text-[var(--kb-muted)] hover:text-[var(--kb-ink)]'
                  }`}
                >
                  {topic}
                </button>
              );
            })}
          </div>
        </div>

        {/* Текст заметки к вопросу */}
        <div className="space-y-1.5">
          <label
            htmlFor="support-note-input"
            className="text-xs sm:text-sm font-semibold text-[var(--kb-ink)] block"
          >
            Коротко опиши вопрос (текст сохранится на экране при любой ошибке сети)
          </label>
          <textarea
            id="support-note-input"
            data-testid="support-note-input"
            rows={3}
            value={userNote}
            onChange={(e) => setUserNote(e.target.value)}
            placeholder="Например: Исключаю молочные продукты и яйца, хочу понять, подойдёт ли мне стартовое меню"
            className="w-full rounded-xl border border-[var(--kb-border)] bg-[var(--kb-bg)] p-3 text-sm sm:text-base text-[var(--kb-ink)] kb-focus-ring"
          />
        </div>

        {/* Пояснение того, что произойдёт при переходе */}
        <div className="rounded-xl bg-[var(--kb-bg)] border border-[var(--kb-border)] p-4 space-y-1.5 text-xs sm:text-sm text-[var(--kb-muted)]">
          <div className="font-bold text-[var(--kb-ink)]">
            Что происходит при нажатии кнопки в рабочем приложении:
          </div>
          <p>
            1. Вызывается интеграционный колбэк <code>onOpenSupport</code> с выбранной темой и флагом сохранённого черновика.
          </p>
          <p>
            2. Открывается личный диалог с Ольгой в Telegram-боте. Твой дневник питания никогда не пересылается автоматически.
          </p>
        </div>

        {demoClickNotice && (
          <div
            role="status"
            data-testid="support-demo-click-notice"
            className="rounded-xl border border-[var(--kb-warn-border)] bg-[var(--kb-warn-bg)] px-4 py-3 text-xs sm:text-sm font-semibold text-[var(--kb-warn-ink)]"
          >
            Демонстрация: сообщения не отправляются (транспорт отключён, статус «демо»).
          </div>
        )}

        {/* Единственная главная кнопка блока */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <button
            type="button"
            onClick={() => {
              triggerDelicateHaptic('selection');
              setDemoClickNotice(true);
              onOpenSupportAction(selectedTopic, userNote);
            }}
            data-testid="support-primary-cta"
            className="min-h-[48px] px-6 py-3 rounded-xl bg-[var(--kb-primary)] hover:bg-[var(--kb-primary-hover)] text-white font-semibold text-sm sm:text-base inline-flex items-center gap-2 transition-colors kb-focus-ring"
          >
            <MessageCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Демонстрация: сообщения не отправляются</span>
          </button>

          <button
            type="button"
            onClick={onReturnBack}
            className="min-h-[44px] px-4 py-2.5 rounded-xl border border-[var(--kb-border)] text-sm font-medium text-[var(--kb-ink)] kb-focus-ring"
          >
            Вернуться без отправки
          </button>
        </div>
      </section>

      {/* Интерактивная проверка состояний транспорта (idle / pending / confirmed / failed / unknown) */}
      <section className="bg-[var(--kb-surface)] rounded-2xl border border-[var(--kb-border)] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-[var(--kb-ink)]">
              Проверка состояний перехода (<code>SupportTransportState</code>)
            </h2>
            <p className="text-xs sm:text-sm text-[var(--kb-muted)]">
              Переключи состояние, чтобы убедиться, что сбой API не выдаётся за успешную доставку
            </p>
          </div>
          <span
            data-testid="support-transport-badge"
            className="px-2.5 py-1 rounded-lg bg-[var(--kb-sage)] text-xs font-bold text-[var(--kb-ink)]"
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
                className={`min-h-[44px] px-3.5 py-1.5 rounded-xl border text-xs sm:text-sm font-semibold transition-colors kb-focus-ring ${
                  active
                    ? 'border-[var(--kb-primary)] bg-[var(--kb-primary)] text-white'
                    : 'border-[var(--kb-border)] bg-[var(--kb-bg)] text-[var(--kb-ink)] hover:bg-[var(--kb-sage)]'
                }`}
              >
                {st.id}
              </button>
            );
          })}
        </div>

        <div
          data-testid="support-state-details"
          className={`rounded-xl p-4 border text-xs sm:text-sm leading-relaxed flex items-start gap-3 ${
            transportState === 'confirmed'
              ? 'border-[var(--kb-primary)] bg-[var(--kb-sage)] text-[var(--kb-ink)]'
              : transportState === 'failed'
              ? 'border-[var(--kb-danger-border)] bg-[var(--kb-danger-bg)] text-[var(--kb-danger-ink)]'
              : transportState === 'unknown' || transportState === 'pending'
              ? 'border-[var(--kb-warn-border)] bg-[var(--kb-warn-bg)] text-[var(--kb-warn-ink)]'
              : 'border-[var(--kb-border)] bg-[var(--kb-bg)] text-[var(--kb-muted)]'
          }`}
        >
          {transportState === 'confirmed' && (
            <CheckCircle2 className="w-5 h-5 text-[var(--kb-primary)] shrink-0 mt-0.5" />
          )}
          {transportState === 'failed' && (
            <AlertTriangle className="w-5 h-5 text-[var(--kb-danger-ink)] shrink-0 mt-0.5" />
          )}
          {(transportState === 'pending' || transportState === 'unknown') && (
            <Clock className="w-5 h-5 text-[var(--kb-warn-ink)] shrink-0 mt-0.5" />
          )}
          {transportState === 'idle' && (
            <HelpCircle className="w-5 h-5 text-[var(--kb-muted)] shrink-0 mt-0.5" />
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

  return (
    <div className="space-y-6">
      {/* Быстрые переходы: Настройки, Поддержка, Предложение доступа */}
      <section className="bg-[var(--kb-surface)] rounded-2xl border border-[var(--kb-border)] p-5 space-y-4">
        <div className="space-y-1">
          <span className="text-xs font-semibold text-[var(--kb-primary)]">
            Ещё и материалы
          </span>
          <h1 className="text-xl sm:text-2xl font-bold text-[var(--kb-ink)]">
            Каталог рецептов, памятки и настройки
          </h1>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            type="button"
            onClick={onOpenSettings}
            data-testid="more-open-settings"
            className="min-h-[64px] p-4 rounded-xl border border-[var(--kb-border)] bg-[var(--kb-bg)] hover:bg-[var(--kb-sage)] text-left space-y-1 transition-colors kb-focus-ring"
          >
            <div className="flex items-center gap-2 text-sm font-bold text-[var(--kb-ink)]">
              <Settings className="w-4 h-4 text-[var(--kb-primary)]" aria-hidden="true" />
              <span>Настройки и анкета</span>
            </div>
            <p className="text-xs text-[var(--kb-muted)]">
              Изменить ограничения, время готовки или число приёмов пищи
            </p>
          </button>

          <button
            type="button"
            onClick={onOpenSupport}
            data-testid="more-open-support"
            className="min-h-[64px] p-4 rounded-xl border border-[var(--kb-border)] bg-[var(--kb-bg)] hover:bg-[var(--kb-sage)] text-left space-y-1 transition-colors kb-focus-ring"
          >
            <div className="flex items-center gap-2 text-sm font-bold text-[var(--kb-ink)]">
              <MessageCircle className="w-4 h-4 text-[var(--kb-primary)]" aria-hidden="true" />
              <span>Связь с Ольгой</span>
            </div>
            <p className="text-xs text-[var(--kb-muted)]">
              Спокойно обсудить замены или личное сопровождение
            </p>
          </button>

          <button
            type="button"
            onClick={onOpenAccess}
            data-testid="more-open-access"
            className="min-h-[64px] p-4 rounded-xl border border-[var(--kb-border)] bg-[var(--kb-bg)] hover:bg-[var(--kb-sage)] text-left space-y-1 transition-colors kb-focus-ring"
          >
            <div className="flex items-center gap-2 text-sm font-bold text-[var(--kb-ink)]">
              <Sparkles className="w-4 h-4 text-[var(--kb-primary)]" aria-hidden="true" />
              <span>Предложение доступа</span>
            </div>
            <p className="text-xs text-[var(--kb-muted)]">
              Сравнение бесплатного примера, старта и подписки
            </p>
          </button>
        </div>
      </section>

      {/* Полный каталог рецептов */}
      <section className="bg-[var(--kb-surface)] rounded-2xl border border-[var(--kb-border)] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-[var(--kb-ink)]">
              Каталог рецептов «Кето Баланс»
            </h2>
            <p className="text-xs sm:text-sm text-[var(--kb-muted)]">
              Любое блюдо можно открыть для просмотра шагов и вариантов на 1 или 2 порции
            </p>
          </div>
          <span className="px-2.5 py-1 rounded-lg bg-[var(--kb-sage)] text-xs font-bold text-[var(--kb-ink)]">
            {recipes.length} блюд
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {recipes.map((recipe) => (
            <div
              key={recipe.id}
              className="rounded-2xl border border-[var(--kb-border)] bg-[var(--kb-bg)] p-4 flex flex-col justify-between gap-3"
            >
              <div className="space-y-3">
                <RecipeArtwork
                  artworkKey={recipe.artworkKey}
                  caption={recipe.artworkCaption}
                  size="compact"
                />
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-[var(--kb-primary)]">
                    {recipe.slotLabel} · {recipe.prepMinutes} мин
                  </div>
                  <h3 className="text-base font-bold text-[var(--kb-ink)] leading-snug break-words">
                    {recipe.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-[var(--kb-muted)]">
                    {recipe.subtitle}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onOpenRecipe(recipe.id)}
                data-testid={`more-recipe-${recipe.id}`}
                className="min-h-[44px] w-full px-4 py-2 rounded-xl bg-[var(--kb-surface)] border border-[var(--kb-border)] hover:bg-[var(--kb-sage)] text-sm font-semibold text-[var(--kb-ink)] transition-colors kb-focus-ring"
              >
                Открыть рецепт
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Справочные материалы с источником и статусом проверки */}
      <section className="bg-[var(--kb-surface)] rounded-2xl border border-[var(--kb-border)] p-5 space-y-4">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-[var(--kb-primary)]" aria-hidden="true" />
          <h2 className="text-lg font-bold text-[var(--kb-ink)]">
            Спокойные памятки по кухне и продуктам
          </h2>
        </div>
        <div className="space-y-3">
          {DEMO_MATERIALS.map((mat) => (
            <article
              key={mat.id}
              className="rounded-xl border border-[var(--kb-border)] bg-[var(--kb-bg)] p-4 space-y-2"
            >
              <h3 className="text-base font-bold text-[var(--kb-ink)]">
                {mat.title}
              </h3>
              <p className="text-xs sm:text-sm text-[var(--kb-muted)] leading-relaxed">
                {mat.summary}
              </p>
              <ul className="list-disc pl-4 space-y-1 text-xs sm:text-sm text-[var(--kb-ink)]">
                {mat.contentPoints.map((pt, i) => (
                  <li key={i}>{pt}</li>
                ))}
              </ul>
              <div className="pt-2 border-t border-[var(--kb-border)] flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--kb-muted)]">
                <span>Источник: {mat.sourceLabel}</span>
                <span className="font-semibold text-[var(--kb-primary)]">
                  Статус проверки: {mat.verificationStatus}
                </span>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Приватность и очистка локальных данных */}
      <section className="bg-[var(--kb-surface)] rounded-2xl border border-[var(--kb-border)] p-5 space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-[var(--kb-primary)]" aria-hidden="true" />
          <h2 className="text-base font-bold text-[var(--kb-ink)]">
            Приватность и локальные данные на устройстве
          </h2>
        </div>
        <p className="text-xs sm:text-sm text-[var(--kb-muted)] leading-relaxed">
          Твои черновики настроек, отмеченные покупки и записи дневника хранятся только локально в браузере этого устройства (<code>localStorage</code>). Дневники никогда не отправляются в облачные хранилища или внешние языковые модели.
        </p>
        {clearedNotice && (
          <p className="text-xs sm:text-sm font-semibold text-[var(--kb-primary)]">
            Локальные черновики и записи дневника очищены.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          {!confirmClear ? (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              data-testid="more-clear-data-btn"
              className="min-h-[44px] px-4 py-2 rounded-xl border border-[var(--kb-border)] bg-[var(--kb-bg)] text-xs sm:text-sm font-medium text-[var(--kb-ink)] inline-flex items-center gap-2 kb-focus-ring"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
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
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[var(--kb-danger-ink)] text-white text-xs sm:text-sm font-semibold kb-focus-ring"
              >
                Подтвердить сброс данных
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-[var(--kb-border)] text-xs sm:text-sm font-medium text-[var(--kb-ink)] kb-focus-ring"
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

export const AccessOfferScreen: React.FC<AccessOfferScreenProps> = ({
  onRequestAccess,
  onOpenSupport,
  onReturnBack,
}) => {
  const [selectedTier, setSelectedTier] = useState<
    'free' | 'starter' | 'subscription' | 'personal_support' | null
  >(null);

  return (
    <div className="space-y-5">
      <section className="bg-[var(--kb-surface)] rounded-2xl border border-[var(--kb-border)] p-5 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-[var(--kb-primary)]">
              Предложение доступа
            </span>
            <h1 className="text-xl sm:text-2xl font-bold text-[var(--kb-ink)]">
              Форматы участия в «Кето Баланс»
            </h1>
          </div>
          <button
            type="button"
            onClick={onReturnBack}
            className="min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--kb-border)] bg-[var(--kb-bg)] text-xs sm:text-sm font-medium text-[var(--kb-ink)] inline-flex items-center gap-1.5 kb-focus-ring"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span>Назад</span>
          </button>
        </div>

        <p className="text-sm sm:text-base text-[var(--kb-muted)] leading-relaxed">
          Выбирай комфортный темп: познакомься с бесплатным примером меню, возьми разовый стартовый набор или подключи обновление рационов. Точные цены помечены как <strong className="text-[var(--kb-ink)]">[УТОЧНИТЬ]</strong> до утверждения владельцем.
        </p>
      </section>

      {/* Сравнение 3 основных уровней */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 1. Бесплатный пример */}
        <article className="bg-[var(--kb-surface)] rounded-2xl border border-[var(--kb-border)] p-5 flex flex-col justify-between gap-4">
          <div className="space-y-2.5">
            <span className="inline-block px-2.5 py-0.5 rounded-lg bg-[var(--kb-bg)] text-xs font-semibold text-[var(--kb-muted)]">
              Знакомство
            </span>
            <h2 className="text-lg font-bold text-[var(--kb-ink)]">
              Бесплатный пример
            </h2>
            <div className="text-base font-bold text-[var(--kb-primary)]">
              0 ₽ · открыто сейчас
            </div>
            <ul className="space-y-1.5 text-xs sm:text-sm text-[var(--kb-muted)] leading-relaxed list-disc pl-4">
              <li>Пример спокойного меню на 3 дня</li>
              <li>Список покупок по отделам магазина</li>
              <li>Ручной дневник питания без ограничений</li>
            </ul>
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectedTier('free');
              onRequestAccess('free');
            }}
            data-testid="access-tier-free"
            className="min-h-[44px] w-full px-4 py-2 rounded-xl border border-[var(--kb-border)] bg-[var(--kb-bg)] hover:bg-[var(--kb-sage)] text-xs sm:text-sm font-semibold text-[var(--kb-ink)] kb-focus-ring"
          >
            Продолжить с бесплатным примером
          </button>
        </article>

        {/* 2. Разовый стартовый продукт */}
        <article className="bg-[var(--kb-surface)] rounded-2xl border-2 border-[var(--kb-primary)] p-5 flex flex-col justify-between gap-4">
          <div className="space-y-2.5">
            <span className="inline-block px-2.5 py-0.5 rounded-lg bg-[var(--kb-sage)] text-xs font-bold text-[var(--kb-ink)]">
              Спокойный старт
            </span>
            <h2 className="text-lg font-bold text-[var(--kb-ink)]">
              Разовый стартовый продукт
            </h2>
            <div className="text-base font-bold text-[var(--kb-ink)]">
              Стоимость: [УТОЧНИТЬ]
            </div>
            <ul className="space-y-1.5 text-xs sm:text-sm text-[var(--kb-muted)] leading-relaxed list-disc pl-4">
              <li>Полная база проверенных кето и карнивор блюд</li>
              <li>Готовые замены продуктов под твои фильтры</li>
              <li>Памятки по заготовкам и хранению от Ольги</li>
            </ul>
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectedTier('starter');
              onRequestAccess('starter');
            }}
            data-testid="access-tier-starter"
            className="min-h-[48px] w-full px-4 py-2.5 rounded-xl bg-[var(--kb-primary)] hover:bg-[var(--kb-primary-hover)] text-white text-xs sm:text-sm font-semibold kb-focus-ring"
          >
            Узнать условия старта
          </button>
        </article>

        {/* 3. Подписка на обновления меню */}
        <article className="bg-[var(--kb-surface)] rounded-2xl border border-[var(--kb-border)] p-5 flex flex-col justify-between gap-4">
          <div className="space-y-2.5">
            <span className="inline-block px-2.5 py-0.5 rounded-lg bg-[var(--kb-bg)] text-xs font-semibold text-[var(--kb-muted)]">
              Регулярные меню
            </span>
            <h2 className="text-lg font-bold text-[var(--kb-ink)]">
              Подписка «Кето Баланс»
            </h2>
            <div className="text-base font-bold text-[var(--kb-ink)]">
              Стоимость: [УТОЧНИТЬ] / мес
            </div>
            <ul className="space-y-1.5 text-xs sm:text-sm text-[var(--kb-muted)] leading-relaxed list-disc pl-4">
              <li>Сезонные подборки меню каждую неделю</li>
              <li>Связанные списки покупок под твой ритм</li>
              <li>Понятная отмена без потери личного дневника</li>
            </ul>
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectedTier('subscription');
              onRequestAccess('subscription');
            }}
            data-testid="access-tier-subscription"
            className="min-h-[44px] w-full px-4 py-2 rounded-xl border border-[var(--kb-border)] bg-[var(--kb-bg)] hover:bg-[var(--kb-sage)] text-xs sm:text-sm font-semibold text-[var(--kb-ink)] kb-focus-ring"
          >
            Запросить условия подписки
          </button>
        </article>
      </div>

      {/* Отдельная ограниченная услуга: личное сопровождение Ольги */}
      <section className="bg-[var(--kb-surface)] rounded-2xl border border-[var(--kb-border)] p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="px-2.5 py-0.5 rounded-lg bg-[var(--kb-sage)] text-xs font-bold text-[var(--kb-ink)]">
            Отдельная ограниченная услуга
          </span>
          <span className="text-xs sm:text-sm font-bold text-[var(--kb-ink)]">
            Стоимость и места: [УТОЧНИТЬ]
          </span>
        </div>
        <h2 className="text-lg font-bold text-[var(--kb-ink)]">
          Личное сопровождение Ольги на марафоне
        </h2>
        <p className="text-xs sm:text-sm text-[var(--kb-muted)] leading-relaxed">
          Индивидуальный разбор твоей продуктовой корзины, спокойная адаптация меню под график семьи и личная обратная связь Ольги в боте.
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
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[var(--kb-sage)] text-[var(--kb-ink)] font-semibold text-xs sm:text-sm inline-flex items-center gap-2 kb-focus-ring"
          >
            <MessageCircle className="w-4 h-4 text-[var(--kb-primary)]" aria-hidden="true" />
            <span>Спросить Ольгу о личном сопровождении</span>
          </button>
        </div>
      </section>

      {selectedTier && (
        <div
          data-testid="access-demo-feedback"
          className="rounded-2xl border border-[var(--kb-primary)] bg-[var(--kb-sage)] p-4 text-xs sm:text-sm text-[var(--kb-ink)]"
        >
          Выбран уровень: <strong>{selectedTier}</strong>. В демонстрационном прототипе оплата не подключена (вызван локальный шов <code>onRequestAccess</code>).
        </div>
      )}

      {/* Гарантия того, что дневник, приватность и отмена не заложники подписки */}
      <section className="bg-[var(--kb-surface)] rounded-2xl border border-[var(--kb-border)] p-4 text-xs sm:text-sm text-[var(--kb-muted)] leading-relaxed flex items-start gap-2.5">
        <ShieldCheck
          className="w-5 h-5 text-[var(--kb-primary)] shrink-0 mt-0.5"
          aria-hidden="true"
        />
        <p>
          <strong className="text-[var(--kb-ink)]">Честные правила доступа:</strong> твой ручной дневник питания, настройки приватности и отмена подписки никогда не блокируются и остаются доступными вне зависимости от выбранного тарифа.
        </p>
      </section>
    </div>
  );
};
