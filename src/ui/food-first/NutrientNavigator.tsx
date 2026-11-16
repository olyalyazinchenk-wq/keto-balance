import { useRef, useState } from 'react';
import './client-info.css';

import { filterNutrients } from './nutrients';
import './nutrient-navigator.css';

export function NutrientNavigator() {
  const containerRef = useRef<HTMLDetailsElement>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Все');
  const matches = filterNutrients(query, category);
  return <details ref={containerRef} className="ff-client-info ff-nutrients" data-testid="nutrient-navigator">
    <summary><span>Витамины, минералы и добавки</span><span className="ff-client-info__hint">Нутриентный навигатор</span></summary>
    <div className="ff-client-info__body">
      <button className="ff-nutrients__back" type="button" onClick={() => { if (containerRef.current) { containerRef.current.open = false; containerRef.current.querySelector('summary')?.focus(); } }}>← Назад</button>
      <p>Разнообразие продуктов важно и при кето. Добавки подходят не всем; этот справочник не ставит диагноз и не назначает лечение.</p>
      <label className="ff-nutrients__field">Поиск нутриента <input type="search" value={query} onChange={e => setQuery(e.target.value)} /></label>
      <label className="ff-nutrients__field">Категория <select value={category} onChange={e => setCategory(e.target.value)}><option>Все</option><option>Витамины</option><option>Минералы</option></select></label>
      <p role="status" aria-live="polite">{matches.length === 0 ? 'Ничего не найдено. Попробуйте другое название.' : `Найдено: ${matches.length}`}</p>
      {matches.map(item => <details className="ff-nutrients__card" key={item.name}><summary>{item.name}</summary><div>
        <p><strong>Зачем нужен:</strong> {item.role}</p><p><strong>Источники в пище:</strong> {item.food}</p>
        <p><strong>Что учитывать:</strong> {item.safety}</p><p>Признаки недостатка неспецифичны. Если вас беспокоит самочувствие или рацион ограничен, обсудите с врачом необходимость обследования.</p>
        <p><a href={item.url} target="_blank" rel="noreferrer">Источник: NIH Office of Dietary Supplements</a>. Проверено {item.verifiedDate}.</p>
      </div></details>)}
    </div>
  </details>;
}
