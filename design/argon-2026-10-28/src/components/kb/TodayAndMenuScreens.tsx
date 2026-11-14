import { useState } from 'react';
import {
  Clock,
  RefreshCw,
  ShoppingBag,
  Utensils,
  SlidersHorizontal,
  BookOpen,
  AlertCircle,
  Check,
  X,
} from 'lucide-react';
import type {
  GeneratedMenu,
  RecipeViewModel,
  UserSettingsDraft,
  VisualDirection,
} from '../../types/ketoBalanceContract';
import {
  filterRecipesBySettings,
  formatAppliedConditionsSummary,
  resolveDayMenuSlots,
} from '../../utils/ketoBalanceState';
import { RecipeArtwork } from './RecipeArtwork';

interface TodayScreenProps {
  visualDirection: VisualDirection;
  isMenuChosen: boolean;
  onToggleFirstVisitState: (chosen: boolean) => void;
  menu: GeneratedMenu;
  selectedDayIndex: number;
  recipesById: Record<string, RecipeViewModel>;
  settings: UserSettingsDraft;
  onNavigateToMenu: () => void;
  onNavigateToSettings: () => void;
  onOpenRecipe: (recipeId: string) => void;
  onNavigateToShopping: () => void;
  onNavigateToDiary: () => void;
}

export function TodayScreen({
  visualDirection,
  isMenuChosen,
  onToggleFirstVisitState,
  menu,
  selectedDayIndex,
  recipesById,
  settings,
  onNavigateToMenu,
  onNavigateToSettings,
  onOpenRecipe,
  onNavigateToShopping,
  onNavigateToDiary,
}: TodayScreenProps) {
  const currentDay =
    menu.days.find((d) => d.dayIndex === selectedDayIndex) || menu.days[0];
  const resolvedSlots = resolveDayMenuSlots(
    currentDay,
    recipesById,
    settings.mealsPerDay
  );
  const leadSlot = resolvedSlots[0];
  const remainingSlots = resolvedSlots.slice(1);

  return (
    <div className="space-y-6">
      {/* Переключатель состояния первого визита для проверки критериев приёмки */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-[var(--kb-surface)] border border-[var(--kb-border)] rounded-xl px-3.5 py-2 text-xs">
        <span className="text-[var(--kb-muted)]">
          Состояние экрана «Сегодня»:
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onToggleFirstVisitState(false)}
            aria-pressed={!isMenuChosen}
            className={`min-h-[32px] px-2.5 py-1 rounded-lg font-medium transition-colors kb-focus-ring ${
              !isMenuChosen
                ? 'bg-[var(--kb-sage)] text-[var(--kb-ink)] font-semibold'
                : 'text-[var(--kb-muted)] hover:text-[var(--kb-ink)]'
            }`}
          >
            Первый визит (до выбора меню)
          </button>
          <button
            type="button"
            onClick={() => onToggleFirstVisitState(true)}
            aria-pressed={isMenuChosen}
            className={`min-h-[32px] px-2.5 py-1 rounded-lg font-medium transition-colors kb-focus-ring ${
              isMenuChosen
                ? 'bg-[var(--kb-sage)] text-[var(--kb-ink)] font-semibold'
                : 'text-[var(--kb-muted)] hover:text-[var(--kb-ink)]'
            }`}
          >
            Меню на день выбрано
          </button>
        </div>
      </div>

      {/* Сценарий 1: Первый визит — путь к выбору меню без навязанной статистики */}
      {!isMenuChosen ? (
        <section
          aria-labelledby="today-first-visit-heading"
          className="bg-[var(--kb-surface)] rounded-2xl border border-[var(--kb-border)] p-6 sm:p-8 space-y-5"
        >
          <div className="space-y-2 max-w-2xl">
            <p className="text-sm font-medium text-[var(--kb-primary)]">
              Сегодня · Спокойное начало
            </p>
            <h1
              id="today-first-visit-heading"
              className="text-2xl sm:text-3xl font-bold text-[var(--kb-ink)] leading-snug"
            >
              Давай выберем твоё первое меню на ближайшие дни
            </h1>
            <p className="text-base text-[var(--kb-muted)] leading-relaxed">
              Здесь не будет сложных графиков и счётчиков углеводов. Когда ты
              выберешь подходящий план блюд, на этом экране появится ближайший
              приём пищи, рецепт для готовки и быстрый переход к списку покупок.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1">
            <button
              type="button"
              onClick={onNavigateToMenu}
              className="min-h-[48px] px-6 py-3 rounded-xl bg-[var(--kb-primary)] hover:bg-[var(--kb-primary-hover)] text-white font-semibold text-base inline-flex items-center justify-center gap-2 transition-colors kb-focus-ring"
            >
              <Utensils className="w-4 h-4" aria-hidden="true" />
              <span>Выбрать меню</span>
            </button>

            <button
              type="button"
              onClick={onNavigateToSettings}
              className="min-h-[48px] px-4 py-3 rounded-xl border border-[var(--kb-border)] bg-[var(--kb-surface)] hover:bg-[var(--kb-bg)] text-sm font-medium text-[var(--kb-ink)] inline-flex items-center justify-center gap-2 transition-colors kb-focus-ring"
            >
              <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
              <span>Настроить ограничения</span>
            </button>
          </div>
        </section>
      ) : visualDirection === 'A' ? (
        /* НАПРАВЛЕНИЕ A: «Спокойная кухня» — помощь с ближайшим действием */
        <div className="space-y-6">
          {/* Фокус на ближайшем блюде дня */}
          <section
            aria-labelledby="today-main-action-heading"
            className="bg-[var(--kb-surface)] rounded-2xl border border-[var(--kb-border)] p-5 sm:p-6 space-y-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-[var(--kb-primary)]">
                  {currentDay.label} · Ближайшее блюдо по плану
                </p>
                <h1
                  id="today-main-action-heading"
                  className="text-xl sm:text-2xl font-bold text-[var(--kb-ink)] mt-0.5"
                >
                  Что готовим сегодня
                </h1>
              </div>

              <button
                type="button"
                onClick={onNavigateToMenu}
                className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[var(--kb-bg)] text-sm font-medium text-[var(--kb-ink)] hover:bg-[var(--kb-sage)] transition-colors kb-focus-ring"
              >
                Посмотреть всё меню
              </button>
            </div>

            {leadSlot && leadSlot.recipe && (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center pt-1">
                <div className="md:col-span-5">
                  <RecipeArtwork
                    artworkKey={leadSlot.recipe.artworkKey}
                    caption={leadSlot.recipe.artworkCaption}
                    size="regular"
                  />
                </div>

                <div className="md:col-span-7 space-y-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--kb-muted)]">
                    <span className="font-semibold text-[var(--kb-primary)]">
                      {leadSlot.slotLabel}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-4 h-4" aria-hidden="true" />
                      {leadSlot.recipe.prepMinutes} мин
                    </span>
                  </div>

                  <h2 className="text-lg sm:text-xl font-bold text-[var(--kb-ink)] leading-snug">
                    {leadSlot.recipe.title}
                  </h2>

                  <p className="text-sm sm:text-base text-[var(--kb-muted)] leading-relaxed">
                    {leadSlot.recipe.subtitle}
                  </p>

                  {/* Единственная главная кнопка смыслового блока */}
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => onOpenRecipe(leadSlot.recipe!.id)}
                      className="min-h-[48px] w-full sm:w-auto px-6 py-3 rounded-xl bg-[var(--kb-primary)] hover:bg-[var(--kb-primary-hover)] text-white font-semibold text-base inline-flex items-center justify-center gap-2 transition-colors kb-focus-ring"
                    >
                      <Utensils className="w-4 h-4" aria-hidden="true" />
                      <span>Начать готовить</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Остальные приёмы пищи на сегодня + быстрые спокойные переходы */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <section
              aria-label="Остальные блюда сегодняшнего дня"
              className="lg:col-span-7 bg-[var(--kb-surface)] rounded-2xl border border-[var(--kb-border)] p-5 space-y-4"
            >
              <h2 className="text-base font-bold text-[var(--kb-ink)]">
                Далее по плану на сегодня
              </h2>

              <div className="divide-y divide-[var(--kb-border)]">
                {remainingSlots.map(({ slotKey, slotLabel, recipe }) =>
                  recipe ? (
                    <div
                      key={slotKey}
                      className="py-3.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="text-xs font-semibold text-[var(--kb-primary)]">
                          {slotLabel} · {recipe.prepMinutes} мин
                        </div>
                        <div className="text-base font-semibold text-[var(--kb-ink)] leading-snug">
                          {recipe.title}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onOpenRecipe(recipe.id)}
                        className="min-h-[44px] px-4 py-2 rounded-xl border border-[var(--kb-border)] bg-[var(--kb-bg)] hover:bg-[var(--kb-sage)] text-sm font-medium text-[var(--kb-ink)] shrink-0 kb-focus-ring"
                      >
                        Открыть рецепт
                      </button>
                    </div>
                  ) : null
                )}
              </div>
            </section>

            <div className="lg:col-span-5 space-y-4">
              <section
                aria-label="Переход к покупкам"
                className="bg-[var(--kb-surface)] rounded-2xl border border-[var(--kb-border)] p-5 space-y-3"
              >
                <h2 className="text-base font-bold text-[var(--kb-ink)]">
                  Продукты для меню
                </h2>
                <p className="text-sm text-[var(--kb-muted)]">
                  Отметь то, что уже есть дома, чтобы купить только недостающее.
                </p>
                <button
                  type="button"
                  onClick={onNavigateToShopping}
                  className="min-h-[44px] w-full px-4 py-2.5 rounded-xl bg-[var(--kb-sage)] text-[var(--kb-ink)] font-semibold text-sm inline-flex items-center justify-center gap-2 kb-focus-ring"
                >
                  <ShoppingBag className="w-4 h-4 text-[var(--kb-primary)]" aria-hidden="true" />
                  <span>Собрать покупки</span>
                </button>
              </section>

              <section
                aria-label="Переход к ручному дневнику"
                className="bg-[var(--kb-surface)] rounded-2xl border border-[var(--kb-border)] p-5 space-y-3"
              >
                <h2 className="text-base font-bold text-[var(--kb-ink)]">
                  Личные записи за день
                </h2>
                <p className="text-sm text-[var(--kb-muted)]">
                  Спокойный ручной дневник еды и самочувствия без оценок и
                  подсчёта калорий.
                </p>
                <button
                  type="button"
                  onClick={onNavigateToDiary}
                  className="min-h-[44px] w-full px-4 py-2.5 rounded-xl border border-[var(--kb-border)] bg-[var(--kb-surface)] hover:bg-[var(--kb-bg)] text-[var(--kb-ink)] font-semibold text-sm inline-flex items-center justify-center gap-2 kb-focus-ring"
                >
                  <BookOpen className="w-4 h-4 text-[var(--kb-primary)]" aria-hidden="true" />
                  <span>Записать приём пищи</span>
                </button>
              </section>
            </div>
          </div>
        </div>
      ) : (
        /* АЛЬТЕРНАТИВА B: «Кулинарный журнал» — редакционная композиция, крупнее еда, меньше контейнеров */
        <div className="space-y-8 py-2">
          <header className="border-b border-[var(--kb-border)] pb-4">
            <p className="text-sm tracking-wide text-[var(--kb-primary)] font-semibold">
              Альтернатива B «Кулинарный журнал» · {currentDay.label}
            </p>
            <h1 className="text-2xl sm:text-4xl font-bold text-[var(--kb-ink)] mt-1 leading-tight">
              Тарелка сегодняшнего дня
            </h1>
          </header>

          {leadSlot && leadSlot.recipe && (
            <article className="space-y-4">
              <RecipeArtwork
                artworkKey={leadSlot.recipe.artworkKey}
                caption={leadSlot.recipe.artworkCaption}
                size="editorial"
              />
              <div className="max-w-2xl space-y-3">
                <div className="text-sm text-[var(--kb-muted)]">
                  <strong className="text-[var(--kb-ink)]">
                    {leadSlot.slotLabel}
                  </strong>{' '}
                  · {leadSlot.recipe.prepMinutes} минут на кухне
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-[var(--kb-ink)] leading-snug">
                  {leadSlot.recipe.title}
                </h2>
                <p className="text-base text-[var(--kb-muted)]">
                  {leadSlot.recipe.subtitle}
                </p>
                <button
                  type="button"
                  onClick={() => onOpenRecipe(leadSlot.recipe!.id)}
                  className="min-h-[48px] px-6 py-3 rounded-xl bg-[var(--kb-primary)] text-white font-semibold text-base inline-flex items-center gap-2 kb-focus-ring"
                >
                  <span>Начать готовить</span>
                </button>
              </div>
            </article>
          )}

          <div className="border-t border-[var(--kb-border)] pt-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
            {remainingSlots.map(({ slotKey, slotLabel, recipe }) =>
              recipe ? (
                <div key={slotKey} className="space-y-2">
                  <div className="text-xs font-semibold text-[var(--kb-primary)]">
                    {slotLabel} · {recipe.prepMinutes} мин
                  </div>
                  <h3 className="text-lg font-bold text-[var(--kb-ink)]">
                    {recipe.title}
                  </h3>
                  <button
                    type="button"
                    onClick={() => onOpenRecipe(recipe.id)}
                    className="min-h-[44px] text-sm font-semibold text-[var(--kb-primary)] underline kb-focus-ring rounded"
                  >
                    Открыть рецепт →
                  </button>
                </div>
              ) : null
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface MenuScreenProps {
  visualDirection: VisualDirection;
  menu: GeneratedMenu;
  selectedDayIndex: number;
  onSelectDayIndex: (day: number) => void;
  recipes: RecipeViewModel[];
  recipesById: Record<string, RecipeViewModel>;
  settings: UserSettingsDraft;
  onReplaceRecipe: (
    dayIndex: number,
    slotKey: string,
    nextRecipeId: string
  ) => void;
  onOpenRecipe: (recipeId: string) => void;
  onChooseMenuAndGoToShopping: () => void;
  onEditSettings: () => void;
}

export function MenuScreen({
  visualDirection,
  menu,
  selectedDayIndex,
  onSelectDayIndex,
  recipes,
  recipesById,
  settings,
  onReplaceRecipe,
  onOpenRecipe,
  onChooseMenuAndGoToShopping,
  onEditSettings,
}: MenuScreenProps) {
  const [replacingSlot, setReplacingSlot] = useState<{
    slotKey: string;
    slotLabel: string;
    currentRecipeId: string;
  } | null>(null);
  const [simulateEmptyConflict, setSimulateEmptyConflict] = useState(false);

  const matchingRecipes = simulateEmptyConflict
    ? []
    : filterRecipesBySettings(recipes, settings);

  const currentDay =
    menu.days.find((d) => d.dayIndex === selectedDayIndex) || menu.days[0];
  const resolvedSlots = resolveDayMenuSlots(
    currentDay,
    recipesById,
    settings.mealsPerDay
  );
  const appliedConditionsText = formatAppliedConditionsSummary(settings);

  return (
    <div className="space-y-6">
      {/* Шапка экрана Меню с условиями фильтра и проверкой пустого состояния */}
      <section
        aria-labelledby="menu-screen-heading"
        className="bg-[var(--kb-surface)] rounded-2xl border border-[var(--kb-border)] p-5 space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="space-y-1">
            <h1
              id="menu-screen-heading"
              className="text-xl sm:text-2xl font-bold text-[var(--kb-ink)]"
            >
              {menu.title}
            </h1>
            <p className="text-sm text-[var(--kb-muted)]">
              {appliedConditionsText}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onEditSettings}
              className="min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--kb-border)] bg-[var(--kb-bg)] hover:bg-[var(--kb-sage)] text-xs sm:text-sm font-medium text-[var(--kb-ink)] inline-flex items-center gap-1.5 kb-focus-ring"
            >
              <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
              <span>Изменить настройки</span>
            </button>

            <button
              type="button"
              onClick={() => setSimulateEmptyConflict((v) => !v)}
              aria-pressed={simulateEmptyConflict}
              className="min-h-[44px] px-3 py-2 rounded-xl border border-[var(--kb-border)] text-xs font-medium text-[var(--kb-muted)] hover:text-[var(--kb-ink)] kb-focus-ring"
            >
              {simulateEmptyConflict
                ? 'Вернуть список блюд'
                : 'Проверить пустой результат'}
            </button>
          </div>
        </div>

        {/* Переключение дней плана */}
        <div
          role="group"
          aria-label="Выбор дня меню"
          className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1"
        >
          {menu.days.map((d) => {
            const active = d.dayIndex === selectedDayIndex;
            return (
              <button
                key={d.dayIndex}
                type="button"
                onClick={() => onSelectDayIndex(d.dayIndex)}
                aria-pressed={active}
                className={`min-h-[44px] px-3.5 py-2 rounded-xl text-sm font-semibold text-left transition-colors kb-focus-ring ${
                  active
                    ? 'bg-[var(--kb-primary)] text-white'
                    : 'bg-[var(--kb-bg)] text-[var(--kb-ink)] hover:bg-[var(--kb-sage)]'
                }`}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Честное пустое состояние при отсутствии подходящих рецептов (без тихого снятия ограничений) */}
      {matchingRecipes.length === 0 ? (
        <section
          role="region"
          aria-labelledby="empty-menu-reason-heading"
          className="bg-[var(--kb-surface)] rounded-2xl border border-[var(--kb-warn-border)] p-6 space-y-4"
        >
          <div className="flex items-start gap-3">
            <AlertCircle
              className="w-6 h-6 text-[var(--kb-warn-ink)] shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <div className="space-y-2">
              <h2
                id="empty-menu-reason-heading"
                className="text-lg font-bold text-[var(--kb-ink)]"
              >
                Для выбранного сочетания условий не нашлось блюд в стартовом наборе
              </h2>
              <p className="text-sm sm:text-base text-[var(--kb-muted)] leading-relaxed">
                Применены условия: <strong>{appliedConditionsText}</strong>. Мы
                никогда не отключаем твои пищевые ограничения или аллергии
                автоматически, чтобы заполнить экран. Ослабь ограничение по
                времени готовки или измени список исключений.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => {
                setSimulateEmptyConflict(false);
                onEditSettings();
              }}
              className="min-h-[48px] px-5 py-2.5 rounded-xl bg-[var(--kb-primary)] text-white text-sm font-semibold kb-focus-ring"
            >
              Изменить настройки ограничений
            </button>
            {simulateEmptyConflict && (
              <button
                type="button"
                onClick={() => setSimulateEmptyConflict(false)}
                className="min-h-[48px] px-4 py-2.5 rounded-xl border border-[var(--kb-border)] text-sm font-medium text-[var(--kb-ink)] kb-focus-ring"
              >
                Отменить тестовый конфликт
              </button>
            )}
          </div>
        </section>
      ) : visualDirection === 'A' ? (
        /* НАПРАВЛЕНИЕ A: «Спокойная кухня» — карточки приёмов пищи с заменой и переходом к покупкам */
        <div className="space-y-4">
          {resolvedSlots.map(({ slotKey, slotLabel, recipe }) => {
            if (!recipe) return null;
            return (
              <article
                key={slotKey}
                className="bg-[var(--kb-surface)] rounded-2xl border border-[var(--kb-border)] p-4 sm:p-5 grid grid-cols-1 md:grid-cols-12 gap-4 items-center"
              >
                <div className="md:col-span-4">
                  <RecipeArtwork
                    artworkKey={recipe.artworkKey}
                    caption={recipe.artworkCaption}
                    size="compact"
                  />
                </div>

                <div className="md:col-span-8 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs sm:text-sm font-semibold text-[var(--kb-primary)]">
                      {slotLabel} · {recipe.prepMinutes} мин
                    </span>
                    <span className="text-xs text-[var(--kb-muted)]">
                      БЖУ: {recipe.portionsVariants[1].nutritionStatus}
                    </span>
                  </div>

                  {/* Полное русское название без обрезки многоточием */}
                  <h2 className="text-base sm:text-lg font-bold text-[var(--kb-ink)] leading-snug break-words">
                    {recipe.title}
                  </h2>

                  <p className="text-sm text-[var(--kb-muted)]">
                    {recipe.subtitle}
                  </p>

                  <div className="flex flex-wrap items-center gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => onOpenRecipe(recipe.id)}
                      className="min-h-[44px] px-4 py-2 rounded-xl bg-[var(--kb-sage)] text-[var(--kb-ink)] text-sm font-semibold hover:opacity-90 transition-opacity kb-focus-ring"
                    >
                      Рецепт и готовка
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setReplacingSlot({
                          slotKey,
                          slotLabel,
                          currentRecipeId: recipe.id,
                        })
                      }
                      className="min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--kb-border)] bg-[var(--kb-surface)] hover:bg-[var(--kb-bg)] text-sm font-medium text-[var(--kb-ink)] inline-flex items-center gap-1.5 kb-focus-ring"
                    >
                      <RefreshCw className="w-4 h-4 text-[var(--kb-muted)]" aria-hidden="true" />
                      <span>Заменить блюдо</span>
                    </button>
                  </div>
                </div>
              </article>
            );
          })}

          {/* Единственная главная кнопка смыслового блока Меню */}
          <div className="bg-[var(--kb-surface)] rounded-2xl border border-[var(--kb-border)] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-base font-bold text-[var(--kb-ink)]">
                Меню подходит?
              </h2>
              <p className="text-sm text-[var(--kb-muted)]">
                Перейди к связанному списку покупок, чтобы отметить продукты,
                которые уже есть дома.
              </p>
            </div>

            <button
              type="button"
              onClick={onChooseMenuAndGoToShopping}
              className="min-h-[48px] px-6 py-3 rounded-xl bg-[var(--kb-primary)] hover:bg-[var(--kb-primary-hover)] text-white font-semibold text-base inline-flex items-center justify-center gap-2 shrink-0 transition-colors kb-focus-ring"
            >
              <ShoppingBag className="w-4 h-4" aria-hidden="true" />
              <span>Собрать покупки</span>
            </button>
          </div>
        </div>
      ) : (
        /* АЛЬТЕРНАТИВА B: «Кулинарный журнал» для экрана Меню */
        <div className="space-y-8">
          {resolvedSlots.map(({ slotKey, slotLabel, recipe }) => {
            if (!recipe) return null;
            return (
              <article
                key={slotKey}
                className="border-b border-[var(--kb-border)] pb-7 space-y-4"
              >
                <div className="text-xs font-bold uppercase tracking-wider text-[var(--kb-primary)]">
                  {slotLabel} · {recipe.prepMinutes} минут
                </div>
                <RecipeArtwork
                  artworkKey={recipe.artworkKey}
                  caption={recipe.artworkCaption}
                  size="editorial"
                />
                <h2 className="text-xl sm:text-2xl font-bold text-[var(--kb-ink)] leading-snug">
                  {recipe.title}
                </h2>
                <p className="text-base text-[var(--kb-muted)]">
                  {recipe.subtitle}
                </p>
                <div className="flex flex-wrap items-center gap-4 pt-1">
                  <button
                    type="button"
                    onClick={() => onOpenRecipe(recipe.id)}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-[var(--kb-primary)] text-white text-sm font-semibold kb-focus-ring"
                  >
                    Открыть рецепт
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setReplacingSlot({
                        slotKey,
                        slotLabel,
                        currentRecipeId: recipe.id,
                      })
                    }
                    className="min-h-[44px] px-3 py-2 text-sm font-medium text-[var(--kb-ink)] underline kb-focus-ring"
                  >
                    Выбрать замену
                  </button>
                </div>
              </article>
            );
          })}

          <div className="pt-2">
            <button
              type="button"
              onClick={onChooseMenuAndGoToShopping}
              className="min-h-[48px] w-full sm:w-auto px-6 py-3 rounded-xl bg-[var(--kb-primary)] text-white font-semibold text-base inline-flex items-center justify-center gap-2 kb-focus-ring"
            >
              <ShoppingBag className="w-4 h-4" aria-hidden="true" />
              <span>Собрать покупки</span>
            </button>
          </div>
        </div>
      )}

      {/* Пояснение выбора направления A перед B */}
      <aside
        aria-label="Обоснование выбора композиции A"
        className="bg-[var(--kb-sage)] rounded-2xl border border-[var(--kb-border)] p-4 text-xs sm:text-sm text-[var(--kb-ink)] space-y-1.5"
      >
        <div className="font-bold">
          Сравнение A/B: почему направление A («Спокойная кухня») выбрано основным
        </div>
        <p className="text-[var(--kb-muted)] leading-relaxed">
          Альтернатива B («Кулинарный журнал») эффектно подаёт крупные иллюстрации,
          но на экранах смартфонов 320–390px требует долгой прокрутки между
          приёмами пищи. Направление A сохраняет ту же тёплую палитру и воздух,
          но позволяет увидеть все блюда дня и кнопку замены без лишних скроллов.
        </p>
      </aside>

      {/* Bottom Sheet / Модальное окно замены блюда */}
      {replacingSlot && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="replace-recipe-dialog-title"
        >
          <div className="bg-[var(--kb-surface)] w-full max-w-xl rounded-t-2xl sm:rounded-2xl border border-[var(--kb-border)] max-h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--kb-border)]">
              <div>
                <p className="text-xs text-[var(--kb-muted)]">
                  {currentDay.label} · {replacingSlot.slotLabel}
                </p>
                <h2
                  id="replace-recipe-dialog-title"
                  className="text-base sm:text-lg font-bold text-[var(--kb-ink)]"
                >
                  Выбери блюдо на замену
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setReplacingSlot(null)}
                aria-label="Закрыть окно замены блюда"
                className="min-h-[44px] min-w-[44px] rounded-xl inline-flex items-center justify-center text-[var(--kb-muted)] hover:text-[var(--kb-ink)] kb-focus-ring"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-2.5">
              {matchingRecipes.map((candidate) => {
                const isCurrent = candidate.id === replacingSlot.currentRecipeId;
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => {
                      onReplaceRecipe(
                        currentDay.dayIndex,
                        replacingSlot.slotKey,
                        candidate.id
                      );
                      setReplacingSlot(null);
                    }}
                    className={`w-full min-h-[56px] p-3.5 rounded-xl border text-left flex items-start justify-between gap-3 transition-colors kb-focus-ring ${
                      isCurrent
                        ? 'border-[var(--kb-primary)] bg-[var(--kb-sage)]'
                        : 'border-[var(--kb-border)] bg-[var(--kb-surface)] hover:bg-[var(--kb-bg)]'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-[var(--kb-primary)]">
                        {candidate.slotLabel} · {candidate.prepMinutes} мин
                      </div>
                      <div className="text-sm font-bold text-[var(--kb-ink)] leading-snug">
                        {candidate.title}
                      </div>
                      <div className="text-xs text-[var(--kb-muted)]">
                        {candidate.subtitle}
                      </div>
                    </div>
                    {isCurrent && (
                      <Check
                        className="w-5 h-5 text-[var(--kb-primary)] shrink-0 mt-1"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
