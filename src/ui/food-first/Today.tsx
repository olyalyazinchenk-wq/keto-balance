import { useState } from 'react';
import type { FoodCard } from './model';
import { ArrowRight, Clock, Check } from './Icons';
import { triggerHaptic } from '../../tma/telegram';
import './today.css';
export interface FoodTodayProps {
  dateLabel: string; primary: FoodCard | null; others: FoodCard[];
  rhythm?: { key: string; label: string; completed: boolean }[];
  onOpenRecipe: (id: string) => void; onChooseMenu: () => void; onOpenSettings?: () => void;
}
function FoodPhoto({ card }: { card: FoodCard }) {
  const [failed, setFailed] = useState(false);
  if (!card.photo || failed) return null;
  return <img className="ff-photo" data-testid="food-photo" src={card.photo}
    alt={`Фотоиллюстрация: ${card.title}`} width="640" height="440" decoding="async" onError={() => setFailed(true)} />;
}
export function FoodToday({ dateLabel, primary, others, rhythm = [], onOpenRecipe, onChooseMenu, onOpenSettings }: FoodTodayProps) {
  const open = (id: string) => { triggerHaptic('impact_light'); onOpenRecipe(id); };
  return <section className="ff-today" data-testid="food-today" data-ui-revision="appetizing-02">
    <header className="ff-today__heading"><h1>Сегодня</h1><span className="ff-today__date">{dateLabel}</span></header>
    <div className="ff-today-grid">
      {primary ? <article className="ff-feature">
        <FoodPhoto key={primary.id} card={primary} />
        <div className="ff-feature__body"><p className="ff-feature__label">Блюдо дня</p>
          <h2>{primary.title}</h2>
          <p className="ff-feature__meta"><Clock aria-hidden="true" />{primary.minutes === null ? 'Время уточняется' : `${primary.minutes} мин`}{primary.servings !== null && ` · Порций: ${primary.servings}`}</p>
          <button type="button" className="ff-action" data-testid="food-main-action" onClick={() => open(primary.id)}>Открыть рецепт<ArrowRight aria-hidden="true" /></button>
        </div>
      </article> : <article className="ff-empty" data-testid={rhythm.length ? 'food-today-incompatible' : 'food-today-empty'}>
        <h2>{rhythm.length ? 'Блюда меню недоступны' : 'Начнём с меню?'}</h2>
        <p>{rhythm.length ? 'Для выбранных условий сейчас нет подходящих блюд. Проверь время готовки и предпочтения. Ограничения, связанные с аллергией, сохраняй.' : 'Выбери блюда на несколько дней. Список покупок соберётся из твоего меню.'}</p>
        {rhythm.length > 0 && onOpenSettings && <button type="button" className="ff-proof__help-btn" data-testid="food-today-open-settings" onClick={onOpenSettings}>Изменить параметры</button>}
        <button type="button" className="ff-action" data-testid="food-main-action" onClick={onChooseMenu}>{rhythm.length ? 'Перейти в меню' : 'Выбрать меню'}<ArrowRight aria-hidden="true" /></button>
      </article>}
      <div className="ff-today-aside">
        {others.length > 0 && <section className="ff-next" aria-label="Ещё на сегодня"><h2>Ещё на сегодня</h2>
          {others.map((card, idx) => <button type="button" key={`${card.id}-${idx}`} onClick={() => open(card.id)}>
            {card.photo && <FoodPhoto card={card} />}
            <span className="ff-next__text">{card.title}<small>{card.minutes === null ? 'Время уточняется' : `${card.minutes} мин`}</small></span><ArrowRight aria-hidden="true" />
          </button>)}
        </section>}
        {rhythm.length > 0 && <section className="ff-rhythm" aria-label="Ритм дня"><div className="ff-rhythm__heading"><h2>Ритм дня</h2><span>Готовим в своём темпе</span></div>
          <ol>{rhythm.map(meal => <li key={meal.key} className={meal.completed ? 'ff-rhythm__done' : ''}>
            {meal.completed && <Check aria-hidden="true" />}<strong>{meal.label}</strong><small>{meal.completed ? 'Приготовлено' : 'В плане'}</small>
          </li>)}</ol>
        </section>}
      </div>
    </div>
  </section>;
}
