import { useState } from 'react';
import type { FoodCard } from './model';
import { triggerHaptic } from '../../tma/telegram';
import './today.css';

export interface FoodTodayProps {
  dateLabel: string;
  primary: FoodCard | null;
  others: FoodCard[];
  rhythm?: { key: string; label: string; completed: boolean }[];
  onOpenRecipe: (id: string) => void;
  onChooseMenu: () => void;
  onOpenSettings?: () => void;
}

function FoodPhoto({ card }: { card: FoodCard }) {
  const [failed, setFailed] = useState(false);
  if (!card.photo || failed) {
    return (
      <div className="ff-photo ff-photo--missing" data-testid="food-photo-missing">
        Фото блюда ещё не подключено
      </div>
    );
  }
  return (
    <img
      className="ff-photo"
      data-testid="food-photo"
      src={card.photo}
      alt={`Фотоиллюстрация: ${card.title}`}
      width="640"
      height="440"
      loading="eager"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

export function FoodToday({
  dateLabel,
  primary,
  others,
  rhythm = [],
  onOpenRecipe,
  onChooseMenu,
  onOpenSettings,
}: FoodTodayProps) {
  return (
    <section
      className="ff-today"
      data-testid="food-today"
      data-ui-revision="food-first-01"
    >
      <header className="ff-today__heading">
        <h1>Сегодня</h1>
        <span className="ff-today__date">{dateLabel}</span>
      </header>
      {rhythm.length > 0 && (
        <section className="ff-rhythm" aria-label="Ритм дня">
          <div className="ff-rhythm__heading"><strong>Ритм дня</strong><span>Готовим в своём темпе</span></div>
          <ol>
            {rhythm.map((meal) => (
              <li
                key={meal.key}
                className={`${meal.completed ? 'ff-rhythm__done' : ''} cursor-pointer transition-transform active:scale-[0.98]`}
                onClick={() => {
                  triggerHaptic(meal.completed ? 'selection' : 'success');
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    triggerHaptic(meal.completed ? 'selection' : 'success');
                  }
                }}
                aria-label={`${meal.label}: ${meal.completed ? 'Приготовлено' : 'В плане'}`}
              >
                <span className="ff-rhythm__dot" aria-hidden="true">{meal.completed ? '✓' : '·'}</span>
                <strong>{meal.label}</strong>
                <small>{meal.completed ? 'Приготовлено' : 'В плане'}</small>
              </li>
            ))}
          </ol>
        </section>
      )}
      {primary ? (
        <article className="ff-feature">
          <FoodPhoto key={primary.photo ?? 'missing'} card={primary} />
          <div className="ff-feature__body">
            <p className="ff-feature__label">Ближайшее блюдо</p>
            <h2>{primary.title}</h2>
            <p className="ff-feature__meta">
              {primary.minutes === null
                ? 'Время уточняется'
                : `${primary.minutes} мин`}
              {primary.servings !== null && ` · Порций: ${primary.servings}`}
            </p>
            <button
              type="button"
              className="ff-action"
              data-testid="food-main-action"
              onClick={() => {
                triggerHaptic('impact_light');
                onOpenRecipe(primary.id);
              }}
            >
              Открыть рецепт <span aria-hidden="true">→</span>
            </button>
          </div>
        </article>
      ) : rhythm.length > 0 ? (
        <article className="ff-empty" data-testid="food-today-incompatible">
          <h2>Блюда меню недоступны</h2>
          <p>
            Блюда текущего дня не соответствуют установленным ограничениям или лимиту времени.
          </p>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
            {onOpenSettings && (
              <button
                type="button"
                className="ff-action"
                data-testid="food-today-open-settings"
                onClick={() => {
                  triggerHaptic('selection');
                  onOpenSettings();
                }}
              >
                Изменить параметры
              </button>
            )}
            <button
              type="button"
              className="ff-action"
              data-testid="food-main-action"
              onClick={() => {
                triggerHaptic('selection');
                onChooseMenu();
              }}
            >
              Перейти в меню
            </button>
          </div>
        </article>
      ) : (
        <article className="ff-empty">
          <h2>Начнём с меню?</h2>
          <p>
            Выбери блюда, а покупки и приготовление будут следующим понятным
            шагом.
          </p>
          <button
            type="button"
            className="ff-action"
            data-testid="food-main-action"
            onClick={() => {
              triggerHaptic('selection');
              onChooseMenu();
            }}
          >
            Выбрать меню
          </button>
        </article>
      )}
      {others.length > 0 && (
        <section className="ff-next" aria-label="Ещё на сегодня">
          <h2>Ещё на сегодня</h2>
          {others.map((card) => (
            <button
              type="button"
              key={card.id}
              onClick={() => {
                triggerHaptic('impact_light');
                onOpenRecipe(card.id);
              }}
            >
              <span className="ff-next__text">
                {card.title}
                <small>
                  {card.minutes === null
                    ? 'Время уточняется'
                    : `${card.minutes} мин`}
                </small>
              </span>
              <span aria-hidden="true">→</span>
            </button>
          ))}
        </section>
      )}
    </section>
  );
}
