import { useMemo, useState } from 'react';
import { SUPPLEMENT_LIFEHACKS, searchLifehacks } from '../../data/supplementLifehacks';
import './lifehacks.css';

export function Lifehacks() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Все');
  const [expanded, setExpanded] = useState<string | null>(null);
  const categories = ['Все', ...new Set(SUPPLEMENT_LIFEHACKS.map(item => item.category))];
  const items = useMemo(() => searchLifehacks(query, category), [query, category]);
  return <section className="ff-more lifehacks" data-testid="lifehacks-screen">
    <h1>Лайфхаки</h1>
    <p>Биодобавки: для чего их применяют, что проверить на упаковке и какие ограничения учесть.</p>
    <p className="lifehacks-note">Справочные подсказки, а не схема приёма. Не начинайте все добавки одновременно. Индивидуальные назначения и совместимость с лекарствами обсудите с врачом или фармацевтом.</p>
    <label className="lifehacks-search">Найти добавку
      <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Например, биотин или магний" data-testid="lifehacks-search" />
    </label>
    <div className="lifehacks-categories" aria-label="Категории добавок">
      {categories.map(name => <button key={name} type="button" aria-pressed={category === name} onClick={() => setCategory(name)}>{name}</button>)}
    </div>
    <p role="status" aria-live="polite">Найдено: {items.length}</p>
    <div className="lifehacks-list">
      {items.map(item => <article className="lifehack-card" key={item.id} data-testid={`lifehack-${item.id}`}>
        <h2><button type="button" aria-expanded={expanded === item.id} aria-controls={`lifehack-body-${item.id}`}
          onClick={() => setExpanded(previous => previous === item.id ? null : item.id)}>
          {item.title}<span aria-hidden="true">{expanded === item.id ? '−' : '+'}</span>
        </button></h2>
        <p>{item.purpose}</p>
        {expanded === item.id && <div id={`lifehack-body-${item.id}`}>
          <h3>Что важно знать</h3><p>{item.context}</p>
          <h3>Ограничения и сочетания</h3><p>{item.caution}</p>
          <h3>Полезный шаг</h3><p>{item.practical}</p>
        </div>}
      </article>)}
    </div>
    {!items.length && <p>По вашему запросу ничего не найдено. Попробуйте другое название или категорию.</p>}
    {(query || category !== 'Все') && <button type="button" className="ff-proof__help-btn" onClick={() => { setQuery(''); setCategory('Все'); }}>Сбросить поиск и фильтры</button>}
  </section>;
}
