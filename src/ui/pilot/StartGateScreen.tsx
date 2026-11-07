import React, { useState } from 'react';
import { gateStatusLabel, isGateGranted, type PilotApproach } from './gate';

export interface StartGateScreenProps {
  approach?: PilotApproach;
  onSelectApproach?: (approach: PilotApproach) => void;
  onGateGranted: (payload: { approach: PilotApproach; confirmed18Plus: true }) => void;
  onContinue?: (approach: PilotApproach) => void;
  onOpenSupport?: () => void;
  onViewHome?: () => void;
}

function ArrowRightIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M4 10h12M11 5l5 5-5 5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M10 3.2 18 17H2L10 3.2Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M10 8v4M10 14.5v.1"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function approachCardClass(active: boolean): string {
  return [
    'group overflow-hidden rounded-[24px] border bg-[#F4F1EA] text-left transition-all cursor-pointer',
    active
      ? 'border-[#0F3526] ring-2 ring-[#0F3526]'
      : 'border-[#E3DED4] hover:border-[#CAD2CB]',
  ].join(' ');
}

function checkboxCardClass(checked: boolean): string {
  return [
    'rounded-2xl border bg-white p-4 transition-colors sm:p-5',
    checked
      ? 'border-[#0F3526] bg-[#F7FBF8]'
      : 'border-[#E2DDD3] hover:border-[#CAD2CB]',
  ].join(' ');
}

export function StartGateScreen({
  approach,
  onSelectApproach,
  onGateGranted,
  onContinue,
  onOpenSupport,
  onViewHome,
}: StartGateScreenProps) {
  const [localApproach, setLocalApproach] = useState<PilotApproach>(approach || 'keto');
  const currentApproach = approach || localApproach;

  const [confirmed18Plus, setConfirmed18Plus] = useState(false);
  const [consentedToPd, setConsentedToPd] = useState(false);
  const [error, setError] = useState('');

  const granted = isGateGranted(confirmed18Plus, consentedToPd);

  const handleSelect = (nextApproach: PilotApproach) => {
    setLocalApproach(nextApproach);
    onSelectApproach?.(nextApproach);
  };

  const handleContinue = () => {
    if (!granted) {
      setError(
        'Чтобы продолжить, отметьте оба пункта: подтверждение 18+ и согласие на обработку персональных данных.'
      );
      return;
    }
    setError('');
    onGateGranted({ approach: currentApproach, confirmed18Plus: true });
    onContinue?.(currentApproach);
  };

  return (
    <div
      id="start-gate-screen"
      data-testid="start-gate-screen"
      className="min-h-screen bg-[#F7F2E9] px-4 py-5 text-[#2B2620] sm:py-10"
    >
      <div className="mx-auto w-full max-w-3xl">
        <div className="space-y-6 rounded-[28px] border border-[#E8E4DA] bg-[#FAF8F5] p-4 shadow-sm sm:space-y-8 sm:p-7 md:p-9">
          {/* Header */}
          <header className="flex items-center justify-between gap-4 border-b border-[#EAE5D9] pb-5">
            <div className="flex items-center gap-3">
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#0F3526] font-sans text-xl font-black text-white"
                aria-hidden="true"
              >
                КБ
              </div>
              <div>
                <div className="font-sans text-[21px] font-black leading-none text-[#0F3526] sm:text-[23px]">
                  Кето Баланс
                </div>
                <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#6E7B74]">
                  Знакомство · мягкий старт
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#6E7B74] tabular-nums sm:text-[11px]">
                Знакомство 01 / 04
              </div>
              <div
                className="mt-2 grid w-24 grid-cols-4 gap-1.5 sm:w-32"
                aria-hidden="true"
              >
                <span className="h-[4px] rounded-full bg-[#0F3526]" />
                <span className="h-[4px] rounded-full bg-[#E2DDCF]" />
                <span className="h-[4px] rounded-full bg-[#E2DDCF]" />
                <span className="h-[4px] rounded-full bg-[#E2DDCF]" />
              </div>
            </div>
          </header>

          {/* Title & Introduction */}
          <div className="space-y-3">
            <h1 className="font-sans text-[30px] font-black leading-[1.08] tracking-tight text-[#0F3526] sm:text-[42px]">
              Знакомство с кето и карнивор
            </h1>
            <p className="text-[15px] leading-relaxed text-[#4A5750] sm:text-[16px]">
              «Кето Баланс» — сервис для планирования домашнего меню и списка
              покупок. Помогаем организовать питание из доступных продуктов без
              взвешивания граммов и давления.
            </p>
          </div>

          {/* Section Divider */}
          <div className="flex items-center gap-3">
            <h2 className="shrink-0 text-[11px] font-bold uppercase tracking-[0.14em] text-[#2F3E35] sm:text-[12px]">
              Что это такое простыми словами
            </h2>
            <div className="h-px flex-1 bg-[#DDD8CC]" />
          </div>

          {/* Choice Cards */}
          <div className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-2">
            {/* Keto Card */}
            <button
              type="button"
              id="start-choose-keto"
              data-testid="start-choose-keto"
              aria-pressed={currentApproach === 'keto'}
              onClick={() => handleSelect('keto')}
              className={approachCardClass(currentApproach === 'keto')}
            >
              <img
                src="/media/start/keto_salmon_plate.png"
                alt="Кето-рацион: запечённый лосось с авокадо и свежим салатом"
                className="aspect-[4/3] w-full object-cover"
              />
              <span className="block p-5 text-left sm:p-6">
                <span className="flex items-start justify-between gap-2">
                  <span className="font-sans text-[21px] font-black leading-tight text-[#0F3526] sm:text-[23px]">
                    Кето-рацион{' '}
                    <span className="text-[17px] font-semibold text-[#3A5245]">
                      (Keto)
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full border border-[#C5DEC9] bg-[#D8EADB] px-3 py-1 text-[11px] font-bold text-[#1B4E2B]">
                    Мягкий баланс
                  </span>
                </span>
                <span className="my-3.5 block h-px bg-[#E0DBCF]" />
                <span className="block text-[13.5px] leading-relaxed text-[#44524A] sm:text-[14px]">
                  Питание с очень низким количеством углеводов: качественные
                  белки, натуральные жиры и некрахмалистые овощи или зелень.
                </span>
                <span className="mt-2.5 block text-[12px] text-[#6E7B74]">
                  Результаты и реакция организма индивидуальны.
                </span>
                <span className="mt-4 flex justify-center">
                  <img
                    src="/media/start/keto_kale_avocado.png"
                    alt="Кейл и спелый авокадо"
                    className="max-h-[135px] w-full object-contain"
                  />
                </span>
              </span>
            </button>

            {/* Carnivore Card */}
            <button
              type="button"
              id="start-choose-carnivore"
              data-testid="start-choose-carnivore"
              aria-pressed={currentApproach === 'carnivore'}
              onClick={() => handleSelect('carnivore')}
              className={approachCardClass(currentApproach === 'carnivore')}
            >
              <img
                src="/media/start/carnivore_steak_plate.png"
                alt="Карнивор: сочный стейк из говядины с тимьяном"
                className="aspect-[4/3] w-full object-cover"
              />
              <span className="block p-5 text-left sm:p-6">
                <span className="flex items-start justify-between gap-2">
                  <span className="font-sans text-[21px] font-black leading-tight text-[#0F3526] sm:text-[23px]">
                    Карнивор{' '}
                    <span className="text-[17px] font-semibold text-[#3A5245]">
                      (Carnivore)
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full border border-[#EBD6B6] bg-[#F5E8D2] px-3 py-1 text-[11px] font-bold text-[#624016]">
                    Строго животный
                  </span>
                </span>
                <span className="my-3.5 block h-px bg-[#E0DBCF]" />
                <span className="block text-[13.5px] leading-relaxed text-[#44524A] sm:text-[14px]">
                  Рацион преимущественно или исключительно из продуктов
                  животного происхождения. Из меню исключается растительная
                  пища: овощи, зелень, крупы, фрукты, орехи и семена.
                </span>
                <span className="mt-2.5 block text-[12px] text-[#6E7B74]">
                  Результаты и переносимость индивидуальны.
                </span>
                <span className="mt-4 flex justify-center">
                  <img
                    src="/media/start/carnivore_raw_meat.png"
                    alt="Стейки из говядины с крупной морской солью"
                    className="max-h-[135px] w-full object-contain"
                  />
                </span>
              </span>
            </button>
          </div>

          {/* Gate Conditions Section */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#2F3E35] sm:text-[12px]">
                Подтверждение перед доступом
              </span>
              <span
                id="gate-status"
                data-testid="gate-status"
                data-granted={granted}
                className={
                  granted
                    ? 'inline-flex items-center gap-1.5 rounded-full border border-[#BCE1C4] bg-[#D7EEDB] px-3 py-1 text-[11.5px] font-bold text-[#1B4E2B]'
                    : 'inline-flex items-center gap-1.5 rounded-full border border-[#D5CEC0] bg-[#EAE5D9] px-3 py-1 text-[11.5px] font-bold text-[#4E5C53]'
                }
              >
                {gateStatusLabel(confirmed18Plus, consentedToPd)}
              </span>
            </div>

            {/* Checkbox 1: 18+ */}
            <div className={checkboxCardClass(confirmed18Plus)}>
              <label className="flex min-h-[44px] cursor-pointer items-start gap-3.5">
                <input
                  type="checkbox"
                  id="gate-checkbox-age"
                  data-testid="gate-checkbox-age"
                  checked={confirmed18Plus}
                  onChange={(event) => setConfirmed18Plus(event.target.checked)}
                  className="mt-1 h-5 w-5 shrink-0 cursor-pointer accent-[#0F3526]"
                />
                <span className="block space-y-1">
                  <span className="block text-[15px] font-bold leading-snug text-[#0F3526] sm:text-[16px]">
                    Мне есть 18 лет
                  </span>
                  <span className="block text-[13px] leading-relaxed text-[#556259]">
                    Подтверждаю, что мне исполнилось 18 лет. Понимаю, что «Кето
                    Баланс» носит информационно-бытовой характер и не заменяет
                    консультацию врача.
                  </span>
                </span>
              </label>
            </div>

            {/* Checkbox 2: PD Consent */}
            <div className={checkboxCardClass(consentedToPd)}>
              <label className="flex min-h-[44px] cursor-pointer items-start gap-3.5">
                <input
                  type="checkbox"
                  id="gate-checkbox-pd"
                  data-testid="gate-checkbox-pd"
                  checked={consentedToPd}
                  onChange={(event) => setConsentedToPd(event.target.checked)}
                  className="mt-1 h-5 w-5 shrink-0 cursor-pointer accent-[#0F3526]"
                />
                <span className="block space-y-1">
                  <span className="block text-[15px] font-bold leading-snug text-[#0F3526] sm:text-[16px]">
                    Согласен(на) на обработку персональных данных
                  </span>
                  <span className="block text-[13px] leading-relaxed text-[#556259]">
                    Принимаю условия обработки персональных данных: выбранный
                    подход, кулинарные предпочтения и личные отметки.
                  </span>
                </span>
              </label>
            </div>
          </div>

          {/* Legal Disclosure Panel */}
          <div
            id="legal-disclosure-panel"
            data-testid="legal-disclosure-panel"
            className="space-y-2 rounded-2xl border border-[#E0DBCF] bg-[#F0EDE5] p-4 text-[#5A6860] sm:p-5"
          >
            <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.06em] text-[#0F3526]">
              <AlertIcon />
              <span>
                [УТОЧНИТЬ: проект юридической документации на согласовании
                автором]
              </span>
            </div>
            <p className="text-[12.5px] leading-relaxed">
              Официальный текст оферты, политики конфиденциальности и реквизиты
              оператора персональных данных ещё не утверждены владельцем.
            </p>
            <p className="text-[12.5px] leading-relaxed">
              В пилотном режиме настройки, меню и отметки сохраняются в локальной
              тестовой базе на этом компьютере. Вопрос в поддержку не
              отправляется во внешние сервисы.
            </p>
          </div>

          {/* Support Question Button */}
          {onOpenSupport && (
            <button
              type="button"
              id="start-open-support-btn"
              data-testid="start-open-support-btn"
              onClick={onOpenSupport}
              className="w-full rounded-2xl border border-[#E2DDD3] bg-white px-4 py-3 text-[13.5px] font-semibold text-[#3A5245] transition-colors hover:border-[#CAD2CB]"
            >
              Сомневаетесь, какой формат подойдёт? Написать Ольге
            </button>
          )}

          {/* Gate Error Alert */}
          {error && (
            <div
              role="alert"
              id="gate-error-message"
              data-testid="gate-error-message"
              className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-[13.5px] font-medium text-red-900"
            >
              <AlertIcon />
              <span>{error}</span>
            </div>
          )}

          {/* Continue Button */}
          <button
            type="button"
            id="start-btn-continue"
            data-testid="start-btn-continue"
            disabled={!granted}
            aria-disabled={!granted}
            onClick={handleContinue}
            className={`flex min-h-[54px] w-full items-center justify-center gap-2.5 rounded-2xl text-[16px] font-semibold transition-colors sm:text-[17px] ${
              granted
                ? 'cursor-pointer bg-[#0F3526] text-white hover:bg-[#164D37]'
                : 'cursor-not-allowed bg-[#B0BCB3] text-white/90'
            }`}
          >
            <span>Продолжить</span>
            <ArrowRightIcon />
          </button>

          {onViewHome && (
            <button
              type="button"
              data-testid="gate-view-home-btn"
              onClick={onViewHome}
              className="w-full py-2 text-xs text-[#0F3526] hover:text-[#164D37] font-semibold text-center transition-colors underline"
            >
              Познакомиться с возможностями на главной →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
