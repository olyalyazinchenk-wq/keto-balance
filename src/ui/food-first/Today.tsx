import { useState } from 'react';
import type { FoodCard } from './model';
import { ArrowRight, Clock, Check } from './Icons';
import { triggerHaptic } from '../../tma/telegram';
import { EducationGuides } from './EducationGuides';
import './today.css';

export interface FoodTodayProps {
  dateLabel: string;
  primary: FoodCard | null;
  others: FoodCard[];
  rhythm?: { key: string; label: string; completed: boolean }[];
  hasMenu?: boolean;
  onOpenRecipe: (id: string) => void;
  onChooseMenu: () => void;
  onOpenSettings?: () => void;
  onOpenPaywall?: () => void;
  isPremium?: boolean;
  localSubscription?: any;
  onNavigateToSupport?: () => void;
  onSelectApproach?: (approach: 'keto' | 'carnivore') => void;
}

function FoodPhoto({ card }: { card: FoodCard }) {
  const [failed, setFailed] = useState(false);
  if (!card.photo || failed) return null;
  return (
    <img
      className="ff-photo"
      data-testid="food-photo"
      src={card.photo}
      alt={`Фотоиллюстрация: ${card.title}`}
      width="640"
      height="440"
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
  hasMenu = false,
  onOpenRecipe,
  onChooseMenu,
  onOpenSettings,
  onOpenPaywall,
  isPremium = false,
  localSubscription,
  onNavigateToSupport,
  onSelectApproach,
}: FoodTodayProps) {
  const open = (id: string) => {
    triggerHaptic('impact_light');
    onOpenRecipe(id);
  };

  return (
    <section className="ff-today" data-testid="food-today" data-ui-revision="appetizing-month-03">
      {/* 1. Вводный блок ценности на месяц */}
      <header className="ff-today__heading">
        <div className="ff-hero" data-testid="home-hero-banner">
          <span className="ff-hero__tag">Персональное питание на месяц</span>
          <h1>Питание на месяц без ежедневного поиска рецептов</h1>
          <p className="ff-hero__desc">
            Выберите подход, получите блюда по дням, меняйте их под себя и собирайте покупки на удобный период.
          </p>
          <button
            type="button"
            className="ff-action ff-hero__cta"
            data-testid="food-main-action"
            onClick={() => {
              triggerHaptic('impact_medium');
              if (primary) {
                open(primary.id);
              } else {
                onChooseMenu();
              }
            }}
          >
            {hasMenu ? 'Продолжить мой план' : 'Составить меню на месяц'}
            <ArrowRight aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* 2. Блюда на сегодня (Блюдо дня, ещё на сегодня, ритм дня) */}
      <div className="ff-today-section" data-testid="home-today-dishes">
        <div className="ff-today-section__header">
          <h2>Сегодня</h2>
          <span className="ff-today__date">{dateLabel}</span>
        </div>

        <div className="ff-today-grid">
          {primary ? (
            <article className="ff-feature">
              <FoodPhoto key={primary.id} card={primary} />
              <div className="ff-feature__body">
                <p className="ff-feature__label">Блюдо дня</p>
                <h2>{primary.title}</h2>
                <p className="ff-feature__meta">
                  <Clock aria-hidden="true" />
                  {primary.minutes === null ? 'Время уточняется' : `${primary.minutes} мин`}
                  {primary.servings !== null && ` · Порций: ${primary.servings}`}
                </p>
                <button
                  type="button"
                  className="ff-action"
                  data-testid="food-card-action"
                  onClick={() => open(primary.id)}
                >
                  Открыть рецепт
                  <ArrowRight aria-hidden="true" />
                </button>
              </div>
            </article>
          ) : (
            <article
              className="ff-empty"
              data-testid={rhythm.length ? 'food-today-incompatible' : 'food-today-empty'}
            >
              <h2>{rhythm.length ? 'Блюда меню недоступны' : 'Начнём с меню?'}</h2>
              <p>
                {rhythm.length
                  ? 'Для выбранных условий сейчас нет подходящих блюд. Проверьте время готовки и предпочтения. Ограничения, связанные с аллергией, сохраняйте.'
                  : 'Выберите блюда на календарный месяц. Список покупок соберётся на удобную неделю или период.'}
              </p>
              {rhythm.length > 0 && onOpenSettings && (
                <button
                  type="button"
                  className="ff-proof__help-btn"
                  data-testid="food-today-open-settings"
                  onClick={onOpenSettings}
                >
                  Изменить параметры
                </button>
              )}
              <button
                type="button"
                className="ff-action"
                data-testid="food-empty-action"
                onClick={onChooseMenu}
              >
                {rhythm.length ? 'Перейти в меню' : 'Выбрать меню'}
                <ArrowRight aria-hidden="true" />
              </button>
            </article>
          )}

          <div className="ff-today-aside">
            {others.length > 0 && (
              <section className="ff-next" aria-label="Ещё на сегодня">
                <h2>Ещё на сегодня</h2>
                {others.map((card, idx) => (
                  <button
                    type="button"
                    key={`${card.id}-${idx}`}
                    onClick={() => open(card.id)}
                  >
                    {card.photo && <FoodPhoto card={card} />}
                    <span className="ff-next__text">
                      {card.title}
                      <small>{card.minutes === null ? 'Время уточняется' : `${card.minutes} мин`}</small>
                    </span>
                    <ArrowRight aria-hidden="true" />
                  </button>
                ))}
              </section>
            )}

            {rhythm.length > 0 && (
              <section className="ff-rhythm" aria-label="Ритм дня">
                <div className="ff-rhythm__heading">
                  <h2>Ритм дня</h2>
                  <span>Готовим в своём темпе</span>
                </div>
                <ol>
                  {rhythm.map((meal) => (
                    <li key={meal.key} className={meal.completed ? 'ff-rhythm__done' : ''}>
                      {meal.completed && <Check aria-hidden="true" />}
                      <strong>{meal.label}</strong>
                      <small>{meal.completed ? 'Приготовлено' : 'В плане'}</small>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </div>
        </div>
      </div>

      {/* 3. Как это работает (5 реальных шагов) */}
      <section className="ff-how-it-works" aria-label="Как это работает" data-testid="how-it-works-section">
        <div className="ff-section-title">
          <span className="ff-kicker">Простой процесс</span>
          <h2>Как это работает</h2>
        </div>
        <div className="ff-steps-grid">
          <div className="ff-step-item">
            <span className="ff-step-num">1</span>
            <div>
              <h3>Меню по дням</h3>
              <p>Готовый сбалансированный рацион на календарный месяц без ежедневного придумывания блюд.</p>
            </div>
          </div>
          <div className="ff-step-item">
            <span className="ff-step-num">2</span>
            <div>
              <h3>Точный расчёт порций</h3>
              <p>Каждый рецепт мгновенно масштабируется на 1, 2 или 4 порции с точными граммовками.</p>
            </div>
          </div>
          <div className="ff-step-item">
            <span className="ff-step-num">3</span>
            <div>
              <h3>Умные замены блюд</h3>
              <p>Заменяйте любое блюдо в один клик с сохранением режима и исключений по аллергенам.</p>
            </div>
          </div>
          <div className="ff-step-item">
            <span className="ff-step-num">4</span>
            <div>
              <h3>Покупки на неделю или месяц</h3>
              <p>Удобный список ингредиентов по отделам магазина с отметками «есть дома».</p>
            </div>
          </div>
          <div className="ff-step-item">
            <span className="ff-step-num">5</span>
            <div>
              <h3>Пошаговая готовка и таймеры</h3>
              <p>Понятные шаги приготовления со встроенным кухонным таймером прямо у плиты.</p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Знакомство с кето и карнивором */}
      <section className="ff-approaches" aria-label="Знакомство с кето и карнивором" data-testid="approaches-section">
        <div className="ff-section-title">
          <span className="ff-kicker">Два терапевтических режима</span>
          <h2>Знакомство с кето и карнивором</h2>
        </div>
        <p className="ff-approaches__intro">
          Каждый организм уникален. Выберите подход, который лучше всего соответствует вашим целям и ощущениям.
        </p>
        <div className="ff-approaches-grid">
          <div className="ff-approach-card">
            <span className="ff-approach-card__badge">Сбалансированное кето</span>
            <h3>Кето-рацион</h3>
            <p>
              Рацион на основе качественных жиров, белков и свежих овощей. Способствует стабильному уровню энергии и чувству насыщения без скачков сахара.
            </p>
            <button
              type="button"
              className="ff-approach-btn"
              data-testid="choose-keto-btn"
              onClick={() => {
                triggerHaptic('selection');
                if (onSelectApproach) onSelectApproach('keto');
                else if (onOpenSettings) onOpenSettings();
              }}
            >
              Настроить Кето-рацион →
            </button>
          </div>

          <div className="ff-approach-card">
            <span className="ff-approach-card__badge ff-approach-card__badge--carnivore">Элиминационный рацион</span>
            <h3>Карнивор-рацион</h3>
            <p>
              Питание на основе мяса, птицы, рыбы, субпродуктов и яиц без растительных углеводов. Применяется для разгрузки ЖКТ и исключения триггеров.
            </p>
            <button
              type="button"
              className="ff-approach-btn"
              data-testid="choose-carnivore-btn"
              onClick={() => {
                triggerHaptic('selection');
                if (onSelectApproach) onSelectApproach('carnivore');
                else if (onOpenSettings) onOpenSettings();
              }}
            >
              Настроить Карнивор →
            </button>
          </div>
        </div>
      </section>

      {/* 5. Обучение и гайды */}
      <section className="ff-home-guides" aria-label="Обучение и гайды">
        <EducationGuides />
      </section>

      {/* 6. Условия доступа и подписка */}
      <section className="ff-access" aria-label="Аккаунт и доступ" data-testid="home-access-section">
        <p className="ff-kicker">Аккаунт и условия доступа</p>
        <h2>{isPremium ? 'Подписка активна' : 'Базовый доступ к рациону'}</h2>
        {isPremium && localSubscription?.expires_at ? (
          <p>Действует до {new Date(localSubscription.expires_at).toLocaleDateString('ru-RU')}</p>
        ) : (
          <p>Полный доступ к персональному плану на месяц, умным заменам и рецептам автора.</p>
        )}
        {onOpenPaywall && (
          <button
            type="button"
            className="ff-action"
            data-testid="more-open-paywall-btn"
            onClick={() => {
              triggerHaptic('selection');
              onOpenPaywall();
            }}
          >
            Условия доступа и тарифы
          </button>
        )}
      </section>

      {/* 7. Настройки, помощь и честный статус дневника */}
      <section className="ff-home-footer-nav" aria-label="Настройки и помощь">
        <div className="ff-section-title">
          <span className="ff-kicker">Управление и связь</span>
          <h2>Настройки и помощь</h2>
        </div>
        <div className="ff-home-links">
          {onOpenSettings && (
            <button
              type="button"
              className="ff-more-link"
              data-testid="home-open-settings-btn"
              onClick={() => {
                triggerHaptic('selection');
                onOpenSettings();
              }}
            >
              <span>Настройки питания и аллергены</span>
              <span aria-hidden="true">→</span>
            </button>
          )}
          {onNavigateToSupport && (
            <button
              type="button"
              className="ff-more-link"
              data-testid="home-open-support-btn"
              onClick={() => {
                triggerHaptic('selection');
                onNavigateToSupport();
              }}
            >
              <span>Помощь и личный вопрос Ольге</span>
              <span aria-hidden="true">→</span>
            </button>
          )}
        </div>

        <div className="ff-diary-teaser" data-testid="home-diary-teaser">
          <h3>Дневник появится позже</h3>
          <p>
            Личные дневниковые записи приёмов пищи и динамики самочувствия пока в разработке. Сейчас вам доступны все функции планирования, рецептов и покупок.
          </p>
        </div>
      </section>
    </section>
  );
}
