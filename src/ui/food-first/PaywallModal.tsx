import React, { useState, useEffect } from 'react';
import type { SubscriptionProduct, SubscriptionState } from '../../types/subscription';
import { purchaseSubscription, confirmDemoPayment } from '../../adapters/pilotApi';
import { triggerHaptic, bindBackButton } from '../../tma/telegram';

export interface PaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updatedSubscription: SubscriptionState) => void;
  sessionToken?: string;
  currentTier?: string | null;
  availableProducts?: SubscriptionProduct[];
  isDemoPreview?: boolean;
}

interface TariffConfig {
  id: string;
  badge: string;
  title: string;
  price: number;
  periodLabel: string;
  description: string;
  isPopular?: boolean;
  highlights: string[];
}

const DEFAULT_TARIFFS: TariffConfig[] = [
  {
    id: 'sub_month',
    badge: 'ЕДИНЫЙ ТАРИФ · ПОЛНЫЙ ДОСТУП',
    title: 'Кето Баланс Premium',
    price: 990,
    periodLabel: '990 ₽ / 30 дней',
    description: 'Месячный рацион, рецепты, покупки и обучение на 30 дней. Без автоматического продления.',
    isPopular: true,
    highlights: [
      'Каталог допущенных рецептов выбранного подхода',
      'Персональный рацион на календарный месяц',
      'Умный автосписок покупок с расчётом на порции',
      'Конструктор замен блюд из каталога',
      'Восемь микро-гайдов о питании и работе с приложением',
    ],
  },
];

export const PaywallModal: React.FC<PaywallModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  sessionToken,
  currentTier,
  availableProducts,
  isDemoPreview,
}) => {
  const [selectedTariffId, setSelectedTariffId] = useState<string>('sub_month');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // In local preview (URL param demo_user or explicit prop), demo activation is permitted
  const isDemo =
    isDemoPreview ??
    (typeof window !== 'undefined' &&
      (window.location.search.includes('demo_user=') ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname === 'localhost'));

  useEffect(() => {
    if (!isOpen) return;

    const cleanupBack = bindBackButton(() => {
      triggerHaptic('selection');
      onClose();
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        triggerHaptic('selection');
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      cleanupBack();
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSelectTariff = (tariffId: string) => {
    setSelectedTariffId(tariffId);
    triggerHaptic('selection');
    setErrorMessage(null);
  };

  const handlePurchase = async () => {
    triggerHaptic('medium');
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const token = sessionToken || '';
      // 1. Initiate purchase order
      const initResp = await purchaseSubscription(token, selectedTariffId);

      // 2. In demo preview mode only, complete demo payment
      if (isDemo && initResp.order_id) {
        const confirmResp = await confirmDemoPayment(token, initResp.order_id);
        triggerHaptic('success');
        onSuccess(confirmResp.subscription);
        onClose();
        return;
      }

      // 3. Real Telegram Stars checkout
      if (initResp.payment_url) {
        if (window.Telegram?.WebApp?.openInvoice) {
          window.Telegram.WebApp.openInvoice(initResp.payment_url, (status) => {
            if (status === 'paid') {
              triggerHaptic('success');
              onClose();
            }
          });
        } else {
          window.open(initResp.payment_url, '_blank');
        }
      } else {
        setErrorMessage('Заказ создан. Ожидание завершения транзакции в Telegram.');
      }
    } catch (err: any) {
      triggerHaptic('error');
      console.warn('[Paywall] Purchase error:', err);
      setErrorMessage(err?.message || 'Не удалось завершить оформление. Попробуйте еще раз.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleInstantDemoActivate = async () => {
    if (!isDemo) {
      setErrorMessage('Демо-активация отключена в рабочей среде.');
      return;
    }

    triggerHaptic('medium');
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const token = sessionToken || '';
      if (!token) throw new Error('Для проверки доступа откройте приложение заново.');
      if (token) {
        const initResp = await purchaseSubscription(token, selectedTariffId || 'sub_month');
        const confirmResp = await confirmDemoPayment(token, initResp.order_id);
        triggerHaptic('success');
        onSuccess(confirmResp.subscription);
        onClose();
        return;
      }
    } catch (e: any) {
      setErrorMessage(e?.message || 'Не удалось подтвердить демонстрационный доступ. Повторите попытку.');
    } finally {
      setIsLoading(false);
    }

  };

  const selectedTariff = DEFAULT_TARIFFS.find((t) => t.id === selectedTariffId) || DEFAULT_TARIFFS[0];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      data-testid="paywall-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="paywall-title"
      onClick={() => {
        triggerHaptic('selection');
        onClose();
      }}
    >
      <div
        className="relative w-full max-w-md max-h-[92vh] sm:max-h-[88vh] flex flex-col bg-[var(--kb-bg)] rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden border border-[var(--kb-border)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Close Button */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 bg-[var(--kb-surface)] border-b border-[var(--kb-border)]">
          <div className="flex items-center gap-2">
            <span className="text-xl">🥑</span>
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--kb-primary)]">
              Кето Баланс · Доступ
            </span>
          </div>
          <button
            type="button"
            data-testid="paywall-close-btn"
            onClick={() => {
              triggerHaptic('selection');
              onClose();
            }}
            className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full bg-[var(--kb-surface-muted)] text-[var(--kb-text-2)] hover:bg-stone-200 active:scale-95 transition-all text-base font-bold cursor-pointer"
            aria-label="Закрыть окно оплаты"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Hero Section */}
          <div className="text-center space-y-1.5">
            <h1
              id="paywall-title"
              className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--kb-text-1)]"
            >
              Открой свой <span className="text-[var(--kb-primary)]">Кето Баланс</span>
            </h1>
            <p className="text-xs sm:text-sm text-[var(--kb-text-2)] max-w-xs mx-auto leading-relaxed">
              Блюда по дням, подходящие замены и покупки на ближайшую неделю.
            </p>
          </div>

          {/* Value Propositions / Benefits */}
          <div className="bg-[var(--kb-surface)] rounded-2xl p-4 border border-[var(--kb-border)] shadow-sm space-y-2.5">
            <div className="text-xs font-bold uppercase tracking-wider text-[var(--kb-text-3)] mb-1">
              Что входит в Premium:
            </div>
            <div className="grid gap-2 text-xs sm:text-sm text-[var(--kb-text-2)]">
              <div className="flex items-start gap-2.5">
                <span className="text-[var(--kb-primary)] font-bold">✓</span>
                <span>
                  <strong>Допущенные рецепты</strong> с составом, шагами и кухонными таймерами
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="text-[var(--kb-primary)] font-bold">✓</span>
                <span>
                  <strong>Персональные рационы</strong> на календарный месяц (кето или карнивор)
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="text-[var(--kb-primary)] font-bold">✓</span>
                <span>
                  <strong>Умный список покупок</strong> с сортировкой по отделам
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="text-[var(--kb-primary)] font-bold">✓</span>
                <span>
                  <strong>Замены блюд</strong> с учётом выбранных ограничений
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="text-[var(--kb-primary)] font-bold">✓</span>
                <span>
                  <strong>Восемь микро-гайдов</strong> и личные вопросы автору
                </span>
              </div>
            </div>
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3 bg-[var(--kb-danger-bg)] border border-[var(--kb-danger-border)] text-[var(--kb-danger-ink)] rounded-xl text-xs font-medium">
              ⚠️ {errorMessage}
            </div>
          )}

          {/* Tariff Selection Card (Single Approved Tariff) */}
          <div className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-[var(--kb-text-3)]">
              Утверждённый тариф:
            </div>
            {DEFAULT_TARIFFS.map((tariff) => {
              const isSelected = selectedTariffId === tariff.id;
              const isCurrent = currentTier === tariff.id;
              return (
                <div
                  key={tariff.id}
                  data-testid={`tariff-card-${tariff.id}`}
                  onClick={() => handleSelectTariff(tariff.id)}
                  className={`relative p-4 rounded-2xl cursor-pointer transition-all border ${
                    isSelected
                      ? 'bg-[var(--kb-surface-muted)] border-[#255c48] ring-2 ring-[#255c48]/30 shadow-md'
                      : 'bg-[var(--kb-surface)] border-[var(--kb-border)] hover:border-stone-300 shadow-sm'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                      {tariff.badge}
                    </span>
                    <div className="w-4 h-4 rounded-full border border-[#255c48] bg-[#255c48] flex items-center justify-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-[var(--kb-surface)]" />
                    </div>
                  </div>

                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="font-bold text-[var(--kb-text-1)] text-sm sm:text-base">
                      {tariff.title}
                    </h3>
                    <div className="text-right">
                      <span className="font-extrabold text-[var(--kb-text-1)] text-sm sm:text-base">
                        {tariff.periodLabel}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-[var(--kb-text-3)] mt-1 leading-snug">
                    {tariff.description}
                  </p>

                  <ul className="mt-3 pt-3 border-t border-[var(--kb-border)] space-y-1 text-xs text-[var(--kb-text-2)] animate-fade-in">
                    {tariff.highlights.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-1.5">
                        <span className="text-[var(--kb-primary)] text-[10px] mt-0.5">●</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>

                  {isCurrent && (
                    <div className="mt-2 text-[11px] font-semibold text-[var(--kb-primary)]">
                      ✓ Ваш текущий тариф
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Transparent Commercial Information */}
          <div className="grid grid-cols-2 gap-2 text-[11px] text-[var(--kb-text-3)] py-1">
            <div className="flex items-center gap-1.5 justify-center p-2 rounded-xl bg-[var(--kb-surface-muted)] border border-[var(--kb-border)] text-center">

              <span>Оплата Telegram Stars</span>
            </div>
            <div className="flex items-center gap-1.5 justify-center p-2 rounded-xl bg-[var(--kb-surface-muted)] border border-[var(--kb-border)] text-center">
              <span>⚙️</span>
              <span>Без автопродления</span>
            </div>
          </div>
        </div>

        {/* Action Footer */}
        <div className="p-4 bg-[var(--kb-surface)] border-t border-[var(--kb-border)] space-y-2">
          {/* Main Purchase CTA */}
          <button
            type="button"
            data-testid="paywall-buy-btn"
            disabled={isLoading}
            onClick={handlePurchase}
            className={`w-full py-3.5 px-4 rounded-xl font-bold text-sm text-white shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer ${
              isLoading
                ? 'bg-stone-400 cursor-not-allowed'
                : 'bg-[#255c48] hover:bg-[#1d4939]'
            }`}
          >
            {isLoading ? (
              <span>Обработка запроса...</span>
            ) : (
              <span>Оформить доступ · {selectedTariff.price.toLocaleString('ru-RU')} ₽</span>
            )}
          </button>

          {/* Demo activation button: strictly gated for local preview with explicit notice */}
          {isDemo && (
            <button
              type="button"
              data-testid="paywall-demo-activate-btn"
              disabled={isLoading}
              onClick={handleInstantDemoActivate}
              className="w-full py-2.5 px-3 rounded-xl font-semibold text-xs text-[var(--kb-primary)] bg-emerald-50 hover:bg-emerald-100 active:scale-[0.98] border border-emerald-200 transition-all cursor-pointer flex items-center justify-center gap-1.5"
            >
              <span>⚡ Демонстрация — деньги не списываются</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
