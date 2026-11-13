import { useId, useState } from 'react';
import type { PortionVariantFixture, RecipeViewModel } from './contract';
import { Check } from './Icons';
import { photoForRecipe } from './model';
import './recipe-plate.css';

interface RecipePlateProps {
  recipe: RecipeViewModel;
  variant: PortionVariantFixture;
  checkedIngredients: Record<string, boolean>;
  onToggleIngredient: (key: string) => void;
  selectedPortions: 1 | 2 | 4;
  onSelectPortions: (portions: 1 | 2 | 4) => void;
}

/** Presents existing quantities. No nutritional estimation or new storage. */
export function RecipePlate({ recipe, variant, checkedIngredients, onToggleIngredient, selectedPortions, onSelectPortions }: RecipePlateProps) {
  const titleId = useId();
  const detailId = useId();
  const [selection, setSelection] = useState({ recipeId: recipe.id, index: 0 });
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  const imageUrl = photoForRecipe(recipe.id);
  const hasPhoto = Boolean(imageUrl && failedPhoto !== imageUrl);
  // Resolve synchronously on recipe changes: never expose the previous recipe's index.
  const index = selection.recipeId === recipe.id && selection.index < variant.ingredients.length
    ? selection.index : 0;
  const ingredient = variant.ingredients[index];
  const ingredientKey = `${recipe.id}:ing:${index}`;
  const isPrepared = Boolean(checkedIngredients[ingredientKey]);
  const prepared = variant.ingredients.filter((_, i) => checkedIngredients[`${recipe.id}:ing:${i}`]).length;

  return (
    <section className={`recipe-plate${hasPhoto ? ' recipe-plate--photo' : ''}`} aria-labelledby={titleId} data-testid="recipe-plate">
      <div className="recipe-plate__heading">
        <span className="recipe-plate__eyebrow">Состав • Порции • Подготовка</span>
        <span className="recipe-plate__yield" data-testid="plate-yield">{variant.yieldNote}</span>
      </div>
      <h2 id={titleId}>Тарелка в деталях</h2>
      <p className="recipe-plate__intro">Коснись продукта — узнай количество и отметь, что уже подготовлено.</p>
      <div className="recipe-plate__portions" role="group" aria-label="Выбор числа порций">
        {([1, 2, 4] as const).map(p => <button type="button" key={p}
          aria-pressed={selectedPortions === p} data-testid={`recipe-portions-${p}x`}
          onClick={() => onSelectPortions(p)}>{recipe.portionsVariants[p]?.yieldNote || `${p}×`}</button>)}
      </div>

      {hasPhoto && imageUrl && (
        <div className="recipe-plate__photo-wrap">
          <img className="recipe-plate__photo" src={imageUrl}
            alt={`Фотоиллюстрация блюда «${recipe.title}»`} width="320" height="320"
            onError={() => setFailedPhoto(imageUrl)} decoding="async" />
          <span className="recipe-plate__photo-label">Фотоиллюстрация</span>
        </div>
      )}

      {ingredient ? (
        <>
          <div className="recipe-plate__ingredients" role="group" aria-label="Продукты в тарелке">
            {variant.ingredients.map((item, i) => {
              const checked = Boolean(checkedIngredients[`${recipe.id}:ing:${i}`]);
              return (
                <button key={`${recipe.id}:${i}`} type="button"
                  className="recipe-plate__ingredient" aria-pressed={index === i}
                  aria-controls={detailId} aria-label={`${item.name}${checked ? ', подготовлено' : ''}`}
                  onClick={() => setSelection({ recipeId: recipe.id, index: i })}
                  data-testid={`plate-ingredient-${i}`}>
                  <span className="recipe-plate__ingredient-mark" aria-hidden="true">
                    {checked ? <Check width="14" height="14" /> : String(i + 1).padStart(2, '0')}
                  </span>
                  <span>{item.name}</span>
                </button>
              );
            })}
          </div>
          <div className="recipe-plate__detail" id={detailId} aria-live="polite" aria-atomic="true">
            <span className="recipe-plate__category">{ingredient.department}</span>
            <div className="recipe-plate__quantity" key={`${recipe.id}:${index}:${ingredient.amountLabel}`}>
              <strong data-testid="plate-amount">{ingredient.amountLabel}</strong>
              <span>{ingredient.name}</span>
            </div>
            <span className="recipe-plate__basis">На весь выбранный выход: {variant.yieldNote.toLowerCase()}</span>
          </div>
          <button className="recipe-plate__prepare" type="button" aria-pressed={isPrepared}
            data-testid="plate-prepare" onClick={() => onToggleIngredient(ingredientKey)}>
            <Check width="18" height="18" aria-hidden="true" />
            {isPrepared ? 'Подготовлено — отменить отметку' : 'Продукт подготовлен'}
          </button>
          <div className="recipe-plate__progress-label">
            <span>Готовность продуктов</span><span data-testid="plate-progress">{prepared} из {variant.ingredients.length}</span>
          </div>
          <progress className="recipe-plate__progress" value={prepared} max={variant.ingredients.length}
            aria-label={`Подготовлено продуктов: ${prepared} из ${variant.ingredients.length}`} />
        </>
      ) : <p className="recipe-plate__empty">Состав этого блюда пока уточняется.</p>}

      <details className="recipe-plate__nutrition">
        <summary>А где калории и БЖУ?</summary>
        <p>КБЖУ: [УТОЧНИТЬ]. Данные этого рецепта ещё не подтверждены. Здесь показан состав и количество продуктов, а не доли белков, жиров и углеводов.</p>
      </details>
    </section>
  );
}
