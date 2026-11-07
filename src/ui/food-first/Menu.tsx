import { useState, useEffect, useRef } from 'react';
import {
  RefreshCw,
  ShoppingBag,
  SlidersHorizontal,
  AlertCircle,
  Check,
  X,
} from './Icons';
import type {
  GeneratedMenu,
  RecipeViewModel,
  UserSettingsDraft,
} from './contract';
import {
  filterRecipesBySettings,
  evaluateSevenDayDiversity,
  formatAppliedConditionsSummary,
  resolveDayMenuSlots,
} from './state';
import './menu-food.css';
import { photoForRecipe } from './model';
import { triggerHaptic, bindBackButton } from '../../tma/telegram';

export interface MenuScreenProps {
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
  onEditSettings?: () => void;
  onRebuildMenu?: () => void;
  catalogRecipes?: any[];
  admittedRecipeIds: readonly string[];
}

const SLOT_TIMESTAMPS: Record<number, string> = {
  0: '08:30',
  1: '13:30',
  2: '19:00',
};

export function MenuScreen({
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
  onRebuildMenu,
  catalogRecipes,
  admittedRecipeIds,
}: MenuScreenProps) {
  const [replacingSlot, setReplacingSlot] = useState<{
    slotKey: string;
    slotLabel: string;
    currentRecipeId: string;
  } | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!replacingSlot) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => previousFocus?.focus();
  }, [replacingSlot]);

  useEffect(() => {
    if (!replacingSlot) return;
    const cleanup = bindBackButton(() => {
      triggerHaptic('selection');
      setReplacingSlot(null);
    });
    return cleanup;
  }, [replacingSlot]);

  const matchingRecipes = filterRecipesBySettings(
    recipes,
    settings,
    catalogRecipes,
    admittedRecipeIds
  );
  const currentDay =
    menu.days.find((day) => day.dayIndex === selectedDayIndex) || menu.days[0];
  const resolvedSlots = currentDay
    ? resolveDayMenuSlots(currentDay, recipesById, settings.mealsPerDay)
    : [];
  const appliedConditionsText = formatAppliedConditionsSummary(settings);
  const diversity = evaluateSevenDayDiversity(matchingRecipes, menu.days.length);

  const isMonthView = menu.days.length > 7;
  const [selectedWeek, setSelectedWeek] = useState<number>(() =>
    isMonthView ? Math.floor(selectedDayIndex / 7) : 0
  );

  useEffect(() => {
    if (isMonthView) {
      setSelectedWeek(Math.floor(selectedDayIndex / 7));
    }
  }, [isMonthView, selectedDayIndex]);

  return (
    <div className="fm-menu" data-testid="food-menu-screen">
      <header className="fm-heading">
        <h1 id="menu-screen-heading">{menu.title}</h1>
        <p>{appliedConditionsText}</p>
        <div className="fm-tools">
          {onEditSettings && (
            <button
              type="button"
              className="fm-secondary"
              onClick={() => {
                triggerHaptic('selection');
                onEditSettings();
              }}
            >
              <SlidersHorizontal aria-hidden="true" /> Параметры
            </button>
          )}
          {onRebuildMenu && (
            <button
              type="button"
              className="fm-secondary"
              data-testid="menu-rebuild-button"
              onClick={() => {
                triggerHaptic('impact_medium');
                onRebuildMenu();
              }}
            >
              <RefreshCw aria-hidden="true" /> Пересобрать
            </button>
          )}
        </div>
      </header>

      {isMonthView && (
        <div className="fm-week-selector" role="tablist" aria-label="Недели месяца" data-testid="menu-week-selector">
          {Array.from({ length: Math.ceil(menu.days.length / 7) }).map((_, wIdx) => {
            const startDay = wIdx * 7 + 1;
            const endDay = Math.min((wIdx + 1) * 7, menu.days.length);
            const isSelected = selectedWeek === wIdx;
            const startDayObj = menu.days[wIdx * 7];
            const endDayObj = menu.days[endDay - 1];
            const dateSpan = startDayObj?.date && endDayObj?.date
              ? ` (${new Date(startDayObj.date).getDate()}–${new Date(endDayObj.date).getDate()} ${new Date(endDayObj.date).toLocaleString('ru-RU', { month: 'short' })})`
              : ` (дни ${startDay}–${endDay})`;
            return (
              <button
                key={wIdx}
                type="button"
                role="tab"
                data-testid={`menu-week-tab-${wIdx}`}
                aria-selected={isSelected}
                className={`fm-week-tab ${isSelected ? 'fm-week-tab--active' : ''}`}
                onClick={() => {
                  triggerHaptic('selection');
                  setSelectedWeek(wIdx);
                  onSelectDayIndex(wIdx * 7);
                }}
              >
                <strong>Неделя {wIdx + 1}</strong>
                <span>{dateSpan}</span>
              </button>
            );
          })}
        </div>
      )}

      {menu.days.length > 0 && (
        <div className="fm-days" role="tablist" aria-label="Дни меню">
          {(isMonthView
            ? menu.days.slice(selectedWeek * 7, Math.min((selectedWeek + 1) * 7, menu.days.length))
            : menu.days
          ).map((day) => {
            const minutes = resolveDayMenuSlots(
              day,
              recipesById,
              settings.mealsPerDay
            ).reduce((sum, slot) => sum + (slot.recipe?.prepMinutes || 0), 0);
            const dateStr = day.date
              ? ` (${new Date(day.date).getDate()} ${new Date(day.date).toLocaleString('ru-RU', { month: 'short' })})`
              : '';
            return (
              <button
                type="button"
                role="tab"
                data-testid={`menu-day-tab-${day.dayIndex}`}
                aria-selected={day.dayIndex === currentDay?.dayIndex}
                key={day.dayIndex}
                onClick={() => {
                  triggerHaptic('selection');
                  onSelectDayIndex(day.dayIndex);
                }}
              >
                <strong>{day.label}{dateStr}</strong>
                <span>{minutes} мин у плиты</span>
              </button>
            );
          })}
        </div>
      )}

      {diversity.warn && (
        <div className="fm-diversity-alert" role="note" data-testid="menu-diversity-notice">
          <AlertCircle aria-hidden="true" />
          <p>
            <strong>Внимание к разнообразию:</strong> с учётом ограничений доступно {diversity.totalCount} блюд, из них {diversity.breakfastCount} в категории «Завтрак». На неделе завтраки или другие блюда могут повторяться. Для большего выбора можно увеличить время приготовления. Если ограничения связаны с аллергией, не отменяйте их ради разнообразия.
          </p>
        </div>
      )}

      {!currentDay ? (
        <section className="fm-empty">
          <h2>Нет дней меню</h2>
          <p>Дни меню пока не добавлены.</p>
        </section>
      ) : matchingRecipes.length === 0 ? (
        <section className="fm-empty" role="alert">
          <AlertCircle aria-hidden="true" />
          <h2>По заданным исключениям не найдено проверенных блюд</h2>
          <p>
            Применено: {appliedConditionsText}. Скорректируйте ограничения или
            лимит времени в настройках.
          </p>
          {onEditSettings && (
            <button
              type="button"
              className="fm-primary"
              onClick={() => {
                triggerHaptic('selection');
                onEditSettings();
              }}
            >
              Изменить ограничения
            </button>
          )}
        </section>
      ) : (
        <section aria-label={`Меню: ${currentDay.label}`} className="fm-meals">
          <h2>{currentDay.label}</h2>
          {resolvedSlots.map(({ slotKey, slotLabel, recipe }, idx) => {
            const ingredients = recipe?.portionsVariants[1]?.ingredients ?? [];
            const photo = recipe ? photoForRecipe(recipe.id) : null;
            return (
              <article className="fm-card" key={slotKey} data-testid={`menu-slot-${slotKey}`}>
                {recipe && photo && (
                  <img
                    className="fm-card__photo"
                    src={photo}
                    alt={`Фотоиллюстрация: ${recipe.title}`}
                  />
                )}
                <div className="fm-card__body">
                  <p className="fm-card__label">
                    {slotLabel} · {SLOT_TIMESTAMPS[idx] || '18:30'}
                  </p>
                  {recipe ? (
                    <>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3>{recipe.title}</h3>
                        {(recipe.sourceStatus === 'review' || recipe.editorial_status === 'review') && (
                          <span
                            className="fm-review-badge"
                            data-testid={`review-badge-${recipe.id}`}
                          >
                            🔍 На проверке
                          </span>
                        )}
                      </div>
                      <p className="fm-card__subtitle">{recipe.subtitle}</p>
                      <p className="fm-card__meta">
                        {recipe.prepMinutes} мин · КБЖУ уточняется автором
                      </p>
                      {ingredients.length > 0 && (
                        <p className="fm-card__ingredients">
                          {ingredients
                            .slice(0, 3)
                            .map((ing) => `${ing.name} ${ing.amountLabel}`)
                            .join(' · ')}
                        </p>
                      )}
                      <div className="fm-card__actions">
                        <button
                          type="button"
                          className="fm-secondary"
                          data-testid={`replace-slot-btn-${slotKey}`}
                          onClick={() => {
                            triggerHaptic('selection');
                            setReplacingSlot({
                              slotKey,
                              slotLabel,
                              currentRecipeId: recipe.id,
                            });
                          }}
                        >
                          <RefreshCw aria-hidden="true" /> Заменить
                        </button>
                        <button
                          type="button"
                          className="fm-primary"
                          data-testid={`open-recipe-btn-${slotKey}`}
                          onClick={() => {
                            triggerHaptic('impact_light');
                            onOpenRecipe(recipe.id);
                          }}
                        >
                          Открыть рецепт →
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="fm-card__subtitle">Блюдо пока не добавлено</p>
                  )}
                </div>
              </article>
            );
          })}
          <div className="fm-shopping">
            <p>Выберите меню, чтобы перейти к списку покупок.</p>
            <button
              type="button"
              className="fm-primary"
              data-testid="choose-menu-shopping-btn"
              onClick={() => {
                triggerHaptic('impact_medium');
                onChooseMenuAndGoToShopping();
              }}
            >
              <ShoppingBag aria-hidden="true" /> Выбрать меню и собрать покупки
            </button>
          </div>
        </section>
      )}

      {replacingSlot && (
        <div
          className="fm-overlay"
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="replace-modal-title"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              triggerHaptic('selection');
              setReplacingSlot(null);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Tab') {
              const buttons = Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || []);
              const first = buttons[0], last = buttons[buttons.length - 1];
              if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
              if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
            }
            if (event.key === 'Escape') {
              triggerHaptic('selection');
              setReplacingSlot(null);
            }
          }}
        >
          <div className="fm-dialog">
            <div className="fm-dialog__heading">
              <div>
                <p>{replacingSlot.slotLabel}</p>
                <h2 id="replace-modal-title">Выберите блюдо</h2>
              </div>
              <button
                type="button"
                className="fm-close"
                onClick={() => {
                  triggerHaptic('selection');
                  setReplacingSlot(null);
                }}
                aria-label="Закрыть окно замены"
              >
                <X aria-hidden="true" />
              </button>
            </div>
            <p className="fm-dialog__conditions">{appliedConditionsText}</p>
            {matchingRecipes.length === 0 ? (
              <div
                className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl text-amber-900 dark:text-amber-200 text-sm space-y-1.5"
                role="alert"
                data-testid="no-replacement-candidates-alert"
              >
                <p className="font-semibold">Нет подходящих блюд для замены</p>
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  С учётом ваших ограничений и аллергенов в каталоге не найдено подходящих альтернатив. Несовместимые рецепты исключены для вашей безопасности. Вы можете изменить ограничения в параметрах.
                </p>
              </div>
            ) : (
              <div className="fm-candidates">
                {matchingRecipes.every(
                  (c) =>
                    c.id === replacingSlot.currentRecipeId ||
                    resolvedSlots.some(
                      (s) => s.slotKey !== replacingSlot.slotKey && s.recipe?.id === c.id
                    )
                ) && (
                  <div
                    className="p-3 mb-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl text-amber-900 dark:text-amber-200 text-xs"
                    role="status"
                    data-testid="all-candidates-used-notice"
                  >
                    Все совместимые с вашими ограничениями блюда уже выбраны в меню на этот день.
                  </div>
                )}
                {matchingRecipes.map((candidate) => {
                  const isCurrent = candidate.id === replacingSlot.currentRecipeId;
                  const isAlreadyUsedToday = resolvedSlots.some(
                    (s) => s.slotKey !== replacingSlot.slotKey && s.recipe?.id === candidate.id
                  );
                  return (
                    <div className="fm-candidate" key={candidate.id}>
                      <div>
                        <strong>{candidate.title}</strong>
                        <p>
                          {candidate.slotLabel} · {candidate.prepMinutes} мин
                        </p>
                        <p>{candidate.subtitle}</p>
                      </div>
                      <button
                        type="button"
                        className="fm-secondary"
                        disabled={isCurrent || isAlreadyUsedToday}
                        onClick={() => {
                          triggerHaptic('notification_success');
                          onReplaceRecipe(
                            currentDay?.dayIndex ?? 0,
                            replacingSlot.slotKey,
                            candidate.id
                          );
                          setReplacingSlot(null);
                        }}
                      >
                        {isCurrent ? (
                          <>
                            <Check aria-hidden="true" /> Выбрано
                          </>
                        ) : isAlreadyUsedToday ? (
                          'Уже в меню на сегодня'
                        ) : (
                          'Поставить в план'
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
