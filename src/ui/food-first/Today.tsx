import { FoodImage } from './FoodImage';
import type { FoodCard } from './model';
import { ArrowRight, Clock, Check, BookOpen, Settings, Sparkles, Calendar, ShoppingBag } from './Icons';
import { triggerHaptic } from '../../tma/telegram';
import './today.css';
import './food-image.css';
import './learning-navigation.css';

export interface FoodTodayProps {
  onOpenLearning?: (screen: 'rules' | 'education' | 'guides' | 'lifehacks') => void;
  onOpenCompass?: () => void;
  onOpenCatalog?: () => void;
  catalogHighlights?: FoodCard[];
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
  sessionToken?: string;
  onNavigate?: (screen: 'menu' | 'shopping' | 'support') => void;
}

function FoodPhoto({ card }: { card: FoodCard }) {
  if (!card.photo) return null;
  return <FoodImage className="ff-photo" data-testid="food-photo" src={card.photo}
    alt={`Фотоиллюстрация: ${card.title}`} width="640" height="440" loading="lazy" />;
}

export function FoodToday({
  dateLabel,
  onOpenLearning,
  onOpenCompass,
  onOpenCatalog,
  catalogHighlights = [],
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
  sessionToken,
  onNavigate,
}: FoodTodayProps) {
  const open = (id: string) => {
    triggerHaptic('impact_light');
    onOpenRecipe(id);
  };

  return (
    <section className="ff-today" data-testid="food-today" data-ui-revision="appetizing-month-03">
      {/* 1. Вводный блок ценности на месяц */}
      <header className="ff-today__heading">
        <p className="editorial-opening">Место для вкусного кето</p>
        <div className="ff-hero" data-testid="home-hero-banner">
          <div className="editorial-hero-copy">
            <span>Вкусно, когда по-домашнему</span>
            <h1>Готовить.<br /> <em>Наслаждаться.</em><br /> Жить.</h1>
            <p className="ff-hero__desc">Простые блюда, любимые продукты и забота о себе каждый день.</p>
          </div>
        </div>
      </header>

      <section className="editorial-compass-card" aria-labelledby="editorial-compass-title">
        <div>
          <span><Sparkles aria-hidden="true" /> КетоКомпас</span>
          <h2 id="editorial-compass-title">Что мне съесть сегодня?</h2>
          <button type="button" onClick={onOpenCompass}>Подобрать блюдо <ArrowRight aria-hidden="true" /></button>
        </div>
      </section>

      <h2 className="editorial-section-title">Всё, что <em>нужно</em></h2>
      <nav className="ff-learning-links editorial-shortcuts" aria-label="Основы кето и обучение" data-testid="home-learning-links">
        {([
          ['rules', 'Правила кето', Settings],
          ['education', 'Обучение', BookOpen],
          ['guides', 'Микрогайды', Sparkles],
        ] as const).map(([screen, title, Icon]) => (
          <button key={screen} type="button" className="ff-learning-card" data-testid={`home-open-${screen}`} onClick={() => onOpenLearning?.(screen)}>
            <span><Icon aria-hidden="true" /></span><strong>{title}</strong>
          </button>
        ))}
      </nav>
      <button type="button" className="ff-more-link editorial-lifehacks-link" data-testid="home-open-lifehacks" onClick={() => onOpenLearning?.('lifehacks')}>
        <span>Лайфхаки · биодобавки</span><ArrowRight aria-hidden="true" />
      </button>
      <section aria-labelledby="editorial-home-recipes">
        <div className="editorial-home-recipes-heading">
          <h2 className="editorial-section-title" id="editorial-home-recipes">Домашнее <em>меню</em></h2>
          <button type="button" className="editorial-catalog-link" onClick={onOpenCatalog}>Все рецепты <ArrowRight aria-hidden="true" /></button>
        </div>
        {catalogHighlights.length > 0 && <div className="editorial-highlights">
          {catalogHighlights.map(card => <button key={card.id} type="button" onClick={() => open(card.id)}>
            <FoodPhoto card={card} /><strong>{card.title}</strong>
            {card.minutes && <small>{card.minutes} мин</small>}
          </button>)}
        </div>}
      </section>
      <div className="editorial-tools">
        <button type="button" data-testid="home-hero-cta" onClick={onChooseMenu}><Calendar aria-hidden="true" /> {hasMenu ? 'Продолжить мой план' : 'Составить меню на месяц'}</button>
        <button type="button" onClick={() => onNavigate?.('shopping')}><ShoppingBag aria-hidden="true" /> Список покупок</button>
      </div>
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
                  data-testid="food-main-action"
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
                  Настройки питания
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
              <p>План питания на календарный месяц с распределением блюд по дням недели.</p>
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

      {/* 4. Знакомство с кето */}
      <section className="ff-approaches" aria-label="Знакомство с кето" data-testid="approaches-section">
        <div className="ff-section-title">
          <span className="ff-kicker">Основы кето-питания</span>
          <h2>Знакомство с кето</h2>
        </div>
        <p className="ff-approaches__intro">
          Узнайте, как устроено кето-меню. Укажите свои предпочтения и ограничения, чтобы подобрать блюда для домашней готовки.
        </p>
        <div>
          <div className="ff-approach-card">
            <span className="ff-approach-card__badge">Низкоуглеводный рацион</span>
            <h3>Кето-рацион</h3>
            <p>
              Рацион на основе мяса, рыбы, яиц, натуральных масел и зелёных овощей с низким содержанием углеводов.
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
        </div>
      </section>

      {/* 5. Обучение и гайды */}

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
            data-testid="home-open-paywall-btn"
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
              <span>Настройки питания</span>
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
