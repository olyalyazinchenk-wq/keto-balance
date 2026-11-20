import { useState } from 'react';
import type { RecipeViewModel } from './contract';
import { ArrowRight, Sparkles } from './Icons';
import { photoForRecipe } from './model';

interface RecipePickerProps {
  recipes: RecipeViewModel[];
  onOpenRecipe: (id: string) => void;
}

function RecipeRows({ recipes, onOpenRecipe }: RecipePickerProps) {
  return <ul className="editorial-recipe-list">
    {recipes.map(recipe => {
      const photo = photoForRecipe(recipe.id);
      return <li key={recipe.id}>
        <button type="button" className="editorial-recipe-row" onClick={() => onOpenRecipe(recipe.id)}>
          {photo && <img src={photo} alt="" loading="lazy" width="86" height="78" />}
          <span>
            <small>{recipe.slotLabel} · {recipe.prepMinutes} мин</small>
            <strong>{recipe.title}</strong>
          </span>
          <ArrowRight aria-hidden="true" />
        </button>
      </li>;
    })}
  </ul>;
}

export function EditorialCatalog({ recipes, onOpenRecipe }: RecipePickerProps) {
  const [query, setQuery] = useState('');
  const normalized = query.trim().toLocaleLowerCase('ru');
  const matching = recipes.filter(recipe => recipe.title.toLocaleLowerCase('ru').includes(normalized));
  return <section className="editorial-picker" data-testid="editorial-catalog">
    <h1>Рецепты</h1>
    <p className="editorial-section-title">Просто выбрать.<br /><em>Приятно готовить.</em></p>
    <label className="editorial-search">
      <span>Поиск по рецептам</span>
      <input type="search" placeholder="Найти любимое блюдо" value={query} onChange={event => setQuery(event.target.value)} />
    </label>
    <RecipeRows recipes={matching} onOpenRecipe={onOpenRecipe} />
    {!matching.length && <p role="status">{normalized ? 'По этому запросу ничего не найдено.' : 'Пока нет рецептов, подходящих под ваши настройки.'}</p>}
  </section>;
}

const occasions = [
  { id: 'breakfast', label: 'Хочется уютного завтрака', matches: (r: RecipeViewModel) => r.slotType === 'breakfast' },
  { id: 'family', label: 'Нужно приготовить для семьи', matches: (r: RecipeViewModel) => Boolean(r.portionsVariants[4]?.ingredients.length) },
  { id: 'dinner', label: 'Хочу красивый ужин', matches: (r: RecipeViewModel) => r.slotType === 'dinner' },
] as const;

export function EditorialCompass({ recipes, onOpenRecipe }: RecipePickerProps) {
  const [occasion, setOccasion] = useState<(typeof occasions)[number]['id'] | null>(null);
  const selected = occasions.find(item => item.id === occasion);
  const matching = selected ? recipes.filter(selected.matches) : [];
  return <section className="editorial-picker" data-testid="editorial-compass">
    <h1><Sparkles aria-hidden="true" /> КетоКомпас</h1>
    <h2 className="editorial-section-title">Что сегодня по настроению?</h2>
    <div className="editorial-occasions" role="group" aria-label="Что хочется приготовить">
      {occasions.map(item => <button key={item.id} type="button" aria-pressed={item.id === occasion} onClick={() => setOccasion(item.id)}>
        {item.label}<ArrowRight aria-hidden="true" />
      </button>)}
    </div>
    {selected && <>
      <h2>Подходящие блюда</h2>
      <RecipeRows recipes={matching} onOpenRecipe={onOpenRecipe} />
      {!matching.length && <p role="status">Для этого варианта нет блюд с вашими настройками питания. Попробуйте другой вариант.</p>}
    </>}
  </section>;
}
