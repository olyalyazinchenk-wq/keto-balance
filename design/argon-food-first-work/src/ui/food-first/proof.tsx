import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FoodToday } from './Today';
import { toFoodCard } from './model';

function Proof() {
  const [notice, setNotice] = useState('');
  const primary = toFoodCard(
    { id: 'proof-breakfast', title: 'Яичница с авокадо', time: 10, serv: 1 },
    '/media/food-first/hero.webp',
  );
  const other = toFoodCard({ id: 'proof-dinner', title: 'Рыба с овощами', time: 25, serv: 1 });
  return (
    <div className="ff-proof">
      <header className="ff-proof__header">
        <span className="ff-proof__brand">Кето Баланс</span>
        <span className="ff-proof__help">Помощь</span>
      </header>
      <aside className="ff-proof__notice">
        Визуальный макет · синтетические данные · без отправки сообщений
      </aside>
      <FoodToday
        dateLabel="Пример дня"
        primary={primary}
        others={[other]}
        onOpenRecipe={(id) =>
          setNotice(
            `Проверен callback открытия: ${id}. Это ещё не рабочая страница рецепта.`,
          )
        }
        onChooseMenu={() =>
          setNotice(
            'Проверен callback выбора меню. Реальный генератор здесь не запущен.',
          )
        }
      />
      <p className="ff-proof__status" role="status">
        {notice}
      </p>
      <nav className="ff-proof__nav" aria-label="Визуальный пример навигации">
        {['Сегодня', 'Меню', 'Покупки', 'Дневник', 'Ещё'].map((label) => (
          <span
            key={label}
            aria-current={label === 'Сегодня' ? 'page' : undefined}
          >
            {label}
          </span>
        ))}
      </nav>
    </div>
  );
}

const root = document.getElementById('food-proof-root');
if (!root) throw new Error('Missing food-proof-root');
createRoot(root).render(<Proof />);
