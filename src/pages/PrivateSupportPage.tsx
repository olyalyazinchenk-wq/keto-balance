import React from 'react';

export const SUPPORT_BOT_URL = 'https://t.me/keto_balance_userbot?start=question';

export default function PrivateSupportPage() {
  return <section className="p-4 max-w-2xl mx-auto" data-testid="private-support">
    <h1 className="text-2xl font-bold mb-3">Написать Ольге</h1>
    <div className="rounded-2xl p-5 border border-stone-200" style={{ background: 'var(--card)' }}>
      <p className="mb-3">Личные вопросы предназначены Ольге в личный чат. В канал они не направляются.</p>
      <p className="text-sm mb-4">Откроется чат бота. Там ты увидишь получателя и отдельно отправишь вопрос. На этом экране ничего не отправлено.</p>
      <a className="inline-block rounded-xl px-4 py-3 text-white font-semibold" style={{ background: 'var(--acc)' }} href={SUPPORT_BOT_URL} target="_blank" rel="noopener noreferrer">Открыть чат для вопроса</a>
      <p className="text-xs mt-4">Не отправляй анализы и медицинские документы. Срочные обращения этот чат не заменяет.</p>
    </div>
  </section>;
}
