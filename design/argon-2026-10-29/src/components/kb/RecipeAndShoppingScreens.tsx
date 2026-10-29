import { useState } from 'react';
import {
  Clock,
  Check,
  Copy,
  RefreshCw,
  BookOpen,
  AlertTriangle,
} from 'lucide-react';
import type {
  RecipeViewModel,
  ShoppingFixtureItem,
} from '../../types/ketoBalanceContract';
import { formatShoppingListForClipboard } from '../../utils/ketoBalanceState';
import { RecipeArtwork } from './RecipeArtwork';

interface RecipeCookingScreenProps {
  recipe: RecipeViewModel;
  checkedIngredients: Record<string, boolean>;
  onToggleIngredient: (key: string) => void;
  checkedSteps: Record<string, boolean>;
  onToggleStep: (key: string) => void;
  onLogCookedMealToDiary: (recipeTitle: string) => void;
}

export function RecipeCookingScreen({
  recipe,
  checkedIngredients,
  onToggleIngredient,
  checkedSteps,
  onToggleStep,
  onLogCookedMealToDiary,
}: RecipeCookingScreenProps) {
  const [portions, setPortions] = useState<1 | 2>(1);
  const variant = recipe.portionsVariants[portions];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <article className="bg-[var(--kb-surface)] rounded-2xl border border-[var(--kb-border)] p-5 sm:p-7 space-y-6">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--kb-muted)]">
            <span className="font-semibold text-[var(--kb-primary)]">
              {recipe.slotLabel} · Время готовки: {recipe.prepMinutes} мин
            </span>
            <span>БЖУ и калорийность: {variant.nutritionStatus}</span>
          </div>

          <h1 className="text-xl sm:text-2xl font-bold text-[var(--kb-ink)] leading-snug break-words">
            {recipe.title}
          </h1>

          <p className="text-base text-[var(--kb-muted)] leading-relaxed">
            {recipe.subtitle}
          </p>
        </div>

        <RecipeArtwork
          artworkKey={recipe.artworkKey}
          caption={recipe.artworkCaption}
          size="regular"
        />

        {/* Переключатель предзаданных демонстрационных вариантов порций (без неутверждённого пересчёта) */}
        <div className="p-4 rounded-xl bg-[var(--kb-bg)] border border-[var(--kb-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-[var(--kb-ink)]">
              Количество порций: {variant.yieldNote}
            </div>
            <div className="text-xs text-[var(--kb-muted)]">
              Используются заранее проверенные варианты из описания рецепта (без автопересчёта БЖУ)
            </div>
          </div>

          <div
            role="group"
            aria-label="Выбор числа порций"
            className="inline-flex items-center gap-1.5 bg-[var(--kb-surface)] p-1 rounded-xl border border-[var(--kb-border)] shrink-0"
          >
            {([1, 2] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPortions(p)}
                aria-pressed={portions === p}
                className={`min-h-[44px] px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors kb-focus-ring ${
                  portions === p
                    ? 'bg-[var(--kb-primary)] text-white'
                    : 'text-[var(--kb-ink)] hover:bg-[var(--kb-sage)]'
                }`}
              >
                {p} {p === 1 ? 'порция' : 'порции'}
              </button>
            ))}
          </div>
        </div>

        {/* Крупные чекбоксы ингредиентов для кухни */}
        <section aria-labelledby="recipe-ingredients-heading" className="space-y-3">
          <h2
            id="recipe-ingredients-heading"
            className="text-lg font-bold text-[var(--kb-ink)]"
          >
            Ингредиенты
          </h2>
          <div className="divide-y divide-[var(--kb-border)] border border-[var(--kb-border)] rounded-xl overflow-hidden">
            {variant.ingredients.map((ing, idx) => {
              const key = `${recipe.id}-ing-${idx}`;
              const isChecked = Boolean(checkedIngredients[key]);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onToggleIngredient(key)}
                  aria-pressed={isChecked}
                  className="w-full min-h-[52px] px-4 py-3 text-left flex items-center justify-between gap-3 hover:bg-[var(--kb-bg)] transition-colors kb-focus-ring"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`w-6 h-6 rounded-md border flex items-center justify-center shrink-0 ${
                        isChecked
                          ? 'bg-[var(--kb-primary)] border-[var(--kb-primary)] text-white'
                          : 'border-[var(--kb-muted)] bg-[var(--kb-surface)]'
                      }`}
                    >
                      {isChecked && <Check className="w-4 h-4" />}
                    </span>
                    <span
                      className={`text-base ${
                        isChecked
                          ? 'line-through text-[var(--kb-muted)]'
                          : 'text-[var(--kb-ink)] font-medium'
                      }`}
                    >
                      {ing.name}
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-[var(--kb-ink)] tabular-nums shrink-0">
                    {ing.amountLabel}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Пошаговое приготовление крупным шрифтом с сохранением состояния */}
        <section aria-labelledby="recipe-steps-heading" className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2
              id="recipe-steps-heading"
              className="text-lg font-bold text-[var(--kb-ink)]"
            >
              Шаги приготовления
            </h2>
            <span className="text-xs text-[var(--kb-muted)]">
              Отметки сохраняются при выходе с экрана
            </span>
          </div>

          <div className="space-y-2.5">
            {recipe.steps.map((stepText, idx) => {
              const stepKey = `${recipe.id}-step-${idx}`;
              const done = Boolean(checkedSteps[stepKey]);
              return (
                <button
                  key={stepKey}
                  type="button"
                  onClick={() => onToggleStep(stepKey)}
                  aria-pressed={done}
                  className={`w-full min-h-[60px] p-4 rounded-xl border text-left flex items-start gap-3.5 transition-colors kb-focus-ring ${
                    done
                      ? 'bg-[var(--kb-sage)] border-[var(--kb-primary)]'
                      : 'bg-[var(--kb-surface)] border-[var(--kb-border)] hover:bg-[var(--kb-bg)]'
                  }`}
                >
                  <span
                    className={`mt-0.5 w-6 h-6 rounded-md border flex items-center justify-center text-xs font-bold shrink-0 ${
                      done
                        ? 'bg-[var(--kb-primary)] border-[var(--kb-primary)] text-white'
                        : 'border-[var(--kb-muted)] text-[var(--kb-ink)]'
                    }`}
                  >
                    {done ? <Check className="w-4 h-4" /> : idx + 1}
                  </span>
                  <span
                    className={`text-base leading-relaxed ${
                      done ? 'line-through text-[var(--kb-muted)]' : 'text-[var(--kb-ink)]'
                    }`}
                  >
                    {stepText}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Допустимые замены и хранение строго из исходных данных */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <section
            aria-label="Допустимые замены продуктов"
            className="p-4 rounded-xl bg-[var(--kb-bg)] border border-[var(--kb-border)] space-y-2"
          >
            <h3 className="text-sm font-bold text-[var(--kb-ink)]">
              Чем можно заменить
            </h3>
            <ul className="space-y-1.5 text-sm text-[var(--kb-muted)] list-disc pl-4">
              {recipe.substitutions.map((sub, i) => (
                <li key={i}>{sub}</li>
              ))}
            </ul>
          </section>

          <section
            aria-label="Правила хранения готового блюда"
            className="p-4 rounded-xl bg-[var(--kb-bg)] border border-[var(--kb-border)] space-y-2"
          >
            <h3 className="text-sm font-bold text-[var(--kb-ink)]">
              Как хранить
            </h3>
            <p className="text-sm text-[var(--kb-muted)] leading-relaxed">
              {recipe.storageRule}
            </p>
          </section>
        </div>

        {/* Основное действие после готовки: записать в ручной дневник */}
        <div className="pt-4 border-t border-[var(--kb-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <span className="text-xs text-[var(--kb-muted)]">
            Источник данных: {recipe.sourceStatus}
          </span>

          <button
            type="button"
            onClick={() => onLogCookedMealToDiary(recipe.title)}
            className="min-h-[48px] px-6 py-3 rounded-xl bg-[var(--kb-primary)] hover:bg-[var(--kb-primary-hover)] text-white font-semibold text-base inline-flex items-center justify-center gap-2 transition-colors kb-focus-ring"
          >
            <BookOpen className="w-4 h-4" aria-hidden="true" />
            <span>Записать приём пищи в дневник</span>
          </button>
        </div>
      </article>
    </div>
  );
}

interface ShoppingScreenProps {
  items: ShoppingFixtureItem[];
  menuTitle: string;
  isStaleAfterMenuEdit: boolean;
  onRefreshShoppingFromMenu: () => void;
  onToggleCheckedInStore: (id: string) => void;
  onToggleAlreadyHave: (id: string) => void;
}

const DEPARTMENTS: ShoppingFixtureItem['department'][] = [
  'Мясо, птица и рыба',
  'Яйца и молочное',
  'Овощи и зелень',
  'Масла и бакалея',
];

export function ShoppingScreen({
  items,
  menuTitle,
  isStaleAfterMenuEdit,
  onRefreshShoppingFromMenu,
  onToggleCheckedInStore,
  onToggleAlreadyHave,
}: ShoppingScreenProps) {
  const [copiedNotice, setCopiedNotice] = useState(false);

  const handleCopyListOnly = () => {
    const text = formatShoppingListForClipboard(
      items,
      menuTitle,
      isStaleAfterMenuEdit
    );
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    setCopiedNotice(true);
    setTimeout(() => setCopiedNotice(false), 2500);
  };

  return (
    <div className="space-y-6">
      <section
        aria-labelledby="shopping-screen-heading"
        className="bg-[var(--kb-surface)] rounded-2xl border border-[var(--kb-border)] p-5 space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-[var(--kb-primary)]">
              Связано с планом: {menuTitle}
            </p>
            <h1
              id="shopping-screen-heading"
              className="text-xl sm:text-2xl font-bold text-[var(--kb-ink)]"
            >
              Список покупок по отделам
            </h1>
            <p className="text-sm text-[var(--kb-muted)]">
              Отметь «Уже есть дома», чтобы оставить только то, что нужно купить в магазине.
            </p>
          </div>

          {/* Единственная главная кнопка блока: копирование ТОЛЬКО копирует в буфер обмена без скрытых сетевых запросов */}
          <button
            type="button"
            onClick={handleCopyListOnly}
            className="min-h-[48px] px-5 py-2.5 rounded-xl bg-[var(--kb-primary)] hover:bg-[var(--kb-primary-hover)] text-white font-semibold text-sm sm:text-base inline-flex items-center justify-center gap-2 shrink-0 transition-colors kb-focus-ring"
          >
            {copiedNotice ? (
              <>
                <Check className="w-4 h-4" aria-hidden="true" />
                <span>Скопировано в буфер</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" aria-hidden="true" />
                <span>Скопировать список</span>
              </>
            )}
          </button>
        </div>

        {/* Явная пометка, если меню менялось после формирования списка */}
        {isStaleAfterMenuEdit && (
          <div
            role="status"
            className="p-4 rounded-xl bg-[var(--kb-warn-bg)] border border-[var(--kb-warn-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          >
            <div className="flex items-start gap-2.5 text-sm text-[var(--kb-warn-ink)]">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                <strong>Меню было изменено.</strong> Текущий список покупок
                сформирован до замены блюда и требует обновления.
              </span>
            </div>
            <button
              type="button"
              onClick={onRefreshShoppingFromMenu}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-[var(--kb-surface)] border border-[var(--kb-warn-border)] text-xs sm:text-sm font-semibold text-[var(--kb-ink)] inline-flex items-center justify-center gap-1.5 shrink-0 kb-focus-ring"
            >
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
              <span>Обновить список по меню</span>
            </button>
          </div>
        )}
      </section>

      {/* Группы продуктов по отделам */}
      <div className="space-y-5">
        {DEPARTMENTS.map((dept) => {
          const deptItems = items.filter((i) => i.department === dept);
          if (deptItems.length === 0) return null;

          return (
            <section
              key={dept}
              aria-label={`Отдел: ${dept}`}
              className="bg-[var(--kb-surface)] rounded-2xl border border-[var(--kb-border)] p-5 space-y-3"
            >
              <h2 className="text-base font-bold text-[var(--kb-ink)]">
                {dept}
              </h2>

              <div className="divide-y divide-[var(--kb-border)]">
                {deptItems.map((item) => {
                  const isDone = item.checkedInStore || item.alreadyHave;
                  return (
                    <div
                      key={item.id}
                      className="py-3.5 first:pt-1 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <button
                        type="button"
                        onClick={() => onToggleCheckedInStore(item.id)}
                        aria-pressed={item.checkedInStore}
                        className="min-h-[44px] text-left flex items-start gap-3 flex-1 kb-focus-ring rounded-lg"
                      >
                        <span
                          className={`mt-0.5 w-6 h-6 rounded-md border flex items-center justify-center shrink-0 ${
                            isDone
                              ? 'bg-[var(--kb-primary)] border-[var(--kb-primary)] text-white'
                              : 'border-[var(--kb-muted)] bg-[var(--kb-surface)]'
                          }`}
                        >
                          {isDone && <Check className="w-4 h-4" />}
                        </span>
                        <div className="space-y-0.5">
                          <div
                            className={`text-base font-semibold ${
                              isDone
                                ? 'line-through text-[var(--kb-muted)]'
                                : 'text-[var(--kb-ink)]'
                            }`}
                          >
                            {item.name} —{' '}
                            <span className="tabular-nums">{item.amountLabel}</span>
                          </div>
                          <div className="text-xs text-[var(--kb-muted)]">
                            Для блюд: {item.linkedRecipeTitles.join('; ')}
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => onToggleAlreadyHave(item.id)}
                        aria-pressed={item.alreadyHave}
                        className={`min-h-[44px] px-3.5 py-2 rounded-xl border text-xs font-semibold shrink-0 transition-colors kb-focus-ring ${
                          item.alreadyHave
                            ? 'bg-[var(--kb-sage)] border-[var(--kb-primary)] text-[var(--kb-ink)]'
                            : 'bg-[var(--kb-bg)] border-[var(--kb-border)] text-[var(--kb-muted)] hover:text-[var(--kb-ink)]'
                        }`}
                      >
                        {item.alreadyHave ? 'Уже есть дома ✓' : 'Отметить «Уже есть»'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
