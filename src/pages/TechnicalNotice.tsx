import React from 'react';

export default function TechnicalNotice() {
  return <aside role="status" className="p-3 text-sm border-b border-amber-300 bg-amber-50 text-stone-800">
    <strong>Технический просмотр.</strong> Используй только вымышленные данные. Подбор и расчёты ещё не приняты для реального использования. Покупки отключены.
    <a className="underline ml-2" href="/api/version" target="_blank" rel="noopener noreferrer">Версия сервера</a>
  </aside>;
}
