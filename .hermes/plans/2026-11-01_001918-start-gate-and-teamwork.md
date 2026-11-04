# План: «Знакомство · Мягкий старт» + чистый показ + протокол командной работы

**Исполнитель:** Gemini 3.8 Flash (High), Antigravity, отдельная сессия.  
**Дата составления:** 2026-11-01 00:19 MSK.  
**Рабочая папка:** `C:/Users/HP/Keto-balance`.  
**Ветка:** `design/argon-ui-import`, HEAD `5f39a90`; рабочее дерево уже содержит изменения владельца — **не сбрасывать, не коммитить, не пушить**.  
**Режим:** `/boost` или `/teamwork`. Это исполнение готового задания, а не новое интервью и не новый продуктовый scope.

---

## 1. Цель

Внедрить утверждённый владельцем экран «Знакомство с кето и карнивор» с двумя обязательными галочками (18+ и согласие на обработку ПДн), починить живые фото в изолированной сборке, убрать отладочные элементы из пользовательского показа и создать в репозитории единый координационный хаб для всех агентов.

---

## 2. Что уже известно (без домыслов)

1. Владелец утвердил **шаг 1 и шаг 2** ответа Argon-4:
   - шаг 1 — внедрить утверждённый визуал «Знакомство с кето и карнивор» + две обязательные галочки + живые фото без битых иконок, обновить показ на `http://127.0.0.1:18080`;
   - шаг 2 — привести в порядок синхронизацию: закрыть незакоммиченный хвост в НутриОК и создать единый хаб-файл в `Keto-balance`.
2. Изменения из Google AI Studio **уже отправлены в GitHub-песочницу** `olyalyazinchenk-wq/Keto-Balance_Argon-4`.
3. Последний коммит песочницы: **`7c4874a9`**, сообщение `feat: add user consent gate and update typography` (2026-10-31T20:34:39Z). В нём:
   - добавлены `public/media/start/keto_salmon_plate.png`, `keto_kale_avocado.png`, `carnivore_steak_plate.png`, `carnivore_raw_meat.png`;
   - переработан `src/components/kb/StartAndSettingsScreens.tsx` (+406/−122), добавлены две галочки и экран-гейт;
   - добавлен тест `tests/frontend/start-access-gate.test.cjs`;
   - изменены `src/App.tsx`, `src/utils/ketoBalanceState.ts`, `src/index.css`.
4. В локальном `design/argon-food-first-work/` лежит **старая** версия `StartScreen` (без ПДн-галочки и без фото). Не выдавать её за утверждённый вариант.
5. В основном приложении `src/main.tsx` рендерит `PilotApp`; `PilotApp` при `phase === 'needs_settings'` показывает сухую анкету. Богатый стартовый экран в живой поток не подключён.
6. В `scripts/build-isolated.mjs` **не копируется папка `public/`** в snapshot, поэтому в изолированном `dist` нет `media/` — отсюда битые картинки на `18080`.
7. В `.gitignore` строка `media/` игнорирует и `public/media/`; ассеты не попадают даже в `git status`. Это нужно исправить, иначе другие агенты не увидят фото.
8. В `src/ui/food-first/AppShell.tsx` показывается плашка «Визуальный макет · синтетические данные · без отправки сообщений», а в `src/ui/food-first/Menu.tsx` — кнопка «Проверить конфликт». Для показа владельцу это отладочный шум.
9. Порт `18080` сейчас **не слушается**. Порты `8000`, `4387`, `8090` принадлежат другим процессам — их не трогать.
10. В НутриОК (`C:/Users/HP/Desktop/Новая папка`, ветка `master`) ровно 4 незакоммиченных файла:
    - `WellnessBot/html_pdf_engine.py`;
    - `WellnessBot/main.py`;
    - `WellnessBot/templates/nutriok_report.html.j2`;
    - `tests/test_nutriok_fact_fidelity.py` (untracked).
    Тест содержит **8 тестовых методов**; ожидаемый результат — `8 passed`.

---

## 3. Архитектура решения

Экран-гейт реализуется как **локальный React-компонент** `src/ui/pilot/StartGateScreen.tsx` и вставляется в `PilotApp` перед формой настроек; серверный wire-контракт и схема БД **не меняются**. Фото копируются из песочницы в `public/media/start/`, изолированная сборка начинает копировать `public/`, а отладочные элементы убираются из пользовательского режима. Параллельно в `docs/` создаются `LIVE_STATUS.md`, `TEAMWORK.md`, `handoff/TEMPLATE.md` и бриф задания; НутриОК-хвост закрывается отдельным коммитом в его собственном репозитории.

Никакого нового backend, новых зависимостей, редизайна и «улучшений заодно» нет.

---

## 4. Жёсткие ограничения (нарушение = стоп)

1. **Не** выполнять `git commit`, `git push`, `reset`, `clean`, `stash`, `checkout` в `C:/Users/HP/Keto-balance`. Изменения остаются в рабочем дереве; фиксацию делает владелец/координатор отдельно.
2. **Не** читать и не выводить `.env`, `bot_data.json`, `.tunnel_cache.json`, рабочие SQLite/БД, runtime-логи, данные участников.
3. **Не** запускать/перезапускать Telegram-бота, сервер на `8000`, Vite-превью на `4387`, студию НутриОК на `8090`, VPN/прокси, туннели.
4. **Не** убивать процессы по имени/порту без проверки командной строки. Останавливать только свой `run_local_preview.py` на `18080`.
5. **Не** менять математическое ядро, КБЖУ, цены, тарифы, медицинские протоколы. В тексте экрана **не должно быть** обещаний «ровная энергия», «уходят отёки», «минус размер», «жиросжигание» и т. п.
6. **Не** добавлять новые продуктовые функции: explore-режим, OCR, оплату, напоминания, админку, новую аналитику.
7. **Не** вводить одноразовые коды, пароли, CVC и 2FA-подтверждения. Если GitHub просит sudo/2FA — открыть окно и передать владельцу, не вводить в чат.
8. **Не** считать `/boost`/`/teamwork` разрешением на git-запись. Это только режим исполнения.
9. **Не** «улучшать» соседние файлы. Менять только перечисленные ниже.
10. Если baseline-проверки падают **до** твоих изменений — остановись и запиши фактический вывод. Не чини чужие поломки.

---

## 5. Как использовать `/boost` или `/teamwork`

- Новое интервью не запускать: все решения уже приняты.
- Внутренний scoping заполнить из этого плана; спросить можно только о реальном конфликте файлов, секрете или новой внешней операции.
- Один primary-writer — Gemini. Независимый reviewer — только read-only.
- Максимум две параллельные workstream: (A) экран + сборка, (B) документы координации. НутриОК — отдельный репозиторий, не смешивать с A.
- После каждого крупного блока — короткий чекпоинт: что изменено, какая команда запущена, какой фактический вывод. Не спрашивать «продолжать?» после каждого зелёного теста.

---

## 6. Порядок работ (чеклист)

- [ ] 0.1 Зафиксировать baseline и состояние git.
- [ ] 0.2 Забрать песочницу Argon и проверить новые ассеты.
- [ ] 1.1 RED: unit-тест чистой логики гейта.
- [ ] 1.2 GREEN: `src/ui/pilot/gate.ts`.
- [ ] 1.3 RED: E2E-тест экрана-гейта.
- [ ] 1.4 GREEN: `src/ui/pilot/StartGateScreen.tsx`.
- [ ] 1.5 Интегрировать гейт в `src/PilotApp.tsx`.
- [ ] 1.6 Скопировать фото и разрешить `public/media` в git.
- [ ] 1.7 Обновить существующие E2E под новый гейт.
- [ ] 2.1 Починить изолированную сборку (`public/`).
- [ ] 2.2 Убрать отладочную плашку и кнопку «Проверить конфликт».
- [ ] 2.3 Прогнать проверки, собрать, запустить `18080`, снять скриншот.
- [ ] 3.1 Создать `docs/LIVE_STATUS.md`.
- [ ] 3.2 Создать `docs/TEAMWORK.md`.
- [ ] 3.3 Создать `docs/handoff/TEMPLATE.md`.
- [ ] 3.4 Добавить указатели в `README.md` и `AGENTS.md`.
- [ ] 3.5 Создать бриф `docs/handoff/2026-11-01-start-gate.md`.
- [ ] 3.6 Обновить `LIVE_STATUS.md` фактическими результатами.
- [ ] 4.1 НутриОК: проверить 4 файла.
- [ ] 4.2 НутриОК: прогнать `8 passed`.
- [ ] 4.3 НутриОК: pulse log + commit + push + readback.
- [ ] 5.1 Написать финальный отчёт по шаблону.

---

## 7. Задачи

### Задача 0.1 — Зафиксировать baseline (2–3 минуты)

Выполнить в `C:/Users/HP/Keto-balance`:

```bash
git status --short > C:/Users/HP/AppData/Local/hermes/cache/scratch/baseline-status.txt
git log -1 --oneline
npm run typecheck
npm run test:unit
```

**Ожидаемо:**
- `git log -1 --oneline` → `5f39a90 feat(k2): complete backend API, test suites, E2E specs, and tunnel resilience`;
- `npm run typecheck` → exit code `0`, вывода нет;
- `npm run test:unit` → exit code `0`, в TAP-хвосте `# fail 0`; число `# pass` записать в отчёт (не выдумывать).

Если `typecheck`/`test:unit` падают — **стоп**, приложить вывод, не исправлять.

---

### Задача 0.2 — Забрать песочницу Argon (3–5 минут)

```bash
cd C:/Users/HP/Keto-balance
node scripts/argon-pull.mjs --no-build
ls .cache/argon-src/public/media/start
```

**Ожидаемо:**
- в начале вывода: `HEAD: 7c4874a9` и сообщение `feat: add user consent gate and update typography`;
- `ls` показывает ровно четыре файла:
  `carnivore_raw_meat.png  carnivore_steak_plate.png  keto_kale_avocado.png  keto_salmon_plate.png`.

Если сеть/прокси не работает:

```bash
HTTPS_PROXY=http://127.0.0.1:10809 HTTP_PROXY=http://127.0.0.1:10809 node scripts/argon-pull.mjs --no-build
```

Если и это не помогло — **стоп** и записать точную ошибку. Не подменять ассеты заглушками.

---

### Задача 1.1 — RED: unit-тест чистой логики гейта (2 минуты)

Создать файл `tests/frontend/start-gate.test.cjs`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');

const { isGateGranted, gateStatusLabel } = loadTs('src/ui/pilot/gate.ts');

test('gate requires both consents, not one', () => {
  assert.equal(isGateGranted(false, false), false);
  assert.equal(isGateGranted(true, false), false);
  assert.equal(isGateGranted(false, true), false);
  assert.equal(isGateGranted(true, true), true);
});

test('status label counts completed conditions', () => {
  assert.match(gateStatusLabel(false, false), /0 из 2/);
  assert.match(gateStatusLabel(true, false), /1 из 2/);
  assert.match(gateStatusLabel(false, true), /1 из 2/);
});

test('status label opens access only at 2 of 2', () => {
  assert.equal(
    gateStatusLabel(true, true),
    'Доступ открыт · 2 из 2 условий выполнены'
  );
});
```

Запустить:

```bash
node --test tests/frontend/start-gate.test.cjs
```

**Ожидаемо (RED):** exit code `1`, ошибка вида `Cannot find module .../src/ui/pilot/gate.ts`. Это нормально: тест написан раньше кода.

---

### Задача 1.2 — GREEN: `src/ui/pilot/gate.ts` (2 минуты)

Создать файл `src/ui/pilot/gate.ts`:

```ts
export type PilotApproach = 'keto' | 'carnivore';

export function isGateGranted(
  confirmed18Plus: boolean,
  consentedToPd: boolean
): boolean {
  return confirmed18Plus === true && consentedToPd === true;
}

export function gateStatusLabel(
  confirmed18Plus: boolean,
  consentedToPd: boolean
): string {
  const completed = (confirmed18Plus ? 1 : 0) + (consentedToPd ? 1 : 0);
  if (completed === 2) {
    return 'Доступ открыт · 2 из 2 условий выполнены';
  }
  return `Требуется подтверждение · ${completed} из 2`;
}
```

Запустить:

```bash
node --test tests/frontend/start-gate.test.cjs
```

**Ожидаемо (GREEN):** `# pass 3`, `# fail 0`, exit code `0`.

---

### Задача 1.3 — RED: E2E-тест экрана-гейта (3 минуты)

Создать файл `tests/e2e/start-gate.spec.ts`:

```ts
import { test, expect } from './pilot.fixture';

test('start gate blocks access until both consents are given', async ({
  createSession,
}) => {
  const { page } = await createSession({ id: 6101, first_name: 'GateUser' });
  await page.goto('/');

  const gate = page.getByTestId('start-gate-screen');
  await expect(gate).toBeVisible({ timeout: 10000 });

  const continueBtn = page.getByTestId('start-btn-continue');
  await expect(continueBtn).toBeDisabled();
  await expect(page.getByTestId('gate-status')).toContainText('0 из 2');

  const ketoImage = page.getByAltText(
    'Кето-рацион: запечённый лосось с авокадо и свежим салатом'
  );
  await expect(ketoImage).toBeVisible();
  await expect
    .poll(async () =>
      ketoImage.evaluate((el: HTMLImageElement) => el.naturalWidth)
    )
    .toBeGreaterThan(0);

  await page.getByTestId('gate-checkbox-age').check();
  await expect(continueBtn).toBeDisabled();
  await expect(page.getByTestId('gate-status')).toContainText('1 из 2');

  await page.getByTestId('gate-checkbox-pd').check();
  await expect(continueBtn).toBeEnabled();
  await expect(page.getByTestId('gate-status')).toContainText('2 из 2');

  await continueBtn.click();
  await expect(page.getByTestId('pilot-settings-form')).toBeVisible();
});
```

Запустить:

```bash
npx playwright test tests/e2e/start-gate.spec.ts --reporter=list
```

**Ожидаемо (RED):** `1 failed`, локатор `[data-testid="start-gate-screen"]` не найден. Это нормально.

Примечание: Playwright сам соберёт изолированный `dist` и поднимет тестовый сервер на `18080`; убедись, что порт свободен. Если занят — см. 2.3, останови только свой процесс.

---

### Задача 1.4 — GREEN: `src/ui/pilot/StartGateScreen.tsx` (10–15 минут)

Создать файл `src/ui/pilot/StartGateScreen.tsx` **целиком**:

```tsx
import { useState } from 'react';
import { gateStatusLabel, isGateGranted, type PilotApproach } from './gate';

export interface StartGateScreenProps {
  onContinue: (approach: PilotApproach) => void;
  onOpenSupport?: () => void;
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
    'group overflow-hidden rounded-[24px] border bg-[#F4F1EA] text-left transition-colors',
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
  onContinue,
  onOpenSupport,
}: StartGateScreenProps) {
  const [approach, setApproach] = useState<PilotApproach>('keto');
  const [confirmed18Plus, setConfirmed18Plus] = useState(false);
  const [consentedToPd, setConsentedToPd] = useState(false);
  const [error, setError] = useState('');

  const granted = isGateGranted(confirmed18Plus, consentedToPd);

  const handleContinue = () => {
    if (!granted) {
      setError(
        'Чтобы продолжить, отметьте оба пункта: подтверждение 18+ и согласие на обработку персональных данных.'
      );
      return;
    }
    setError('');
    onContinue(approach);
  };

  return (
    <div
      data-testid="start-gate-screen"
      className="min-h-screen bg-[#F7F2E9] px-4 py-5 text-[#2B2620] sm:py-10"
    >
      <div className="mx-auto w-full max-w-3xl">
        <div className="space-y-6 rounded-[28px] border border-[#E8E4DA] bg-[#FAF8F5] p-4 shadow-sm sm:space-y-8 sm:p-7 md:p-9">
          <header className="flex items-center justify-between gap-4 border-b border-[#EAE5D9] pb-5">
            <div className="flex items-center gap-3">
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#0F3526] font-serif text-xl font-black text-white"
                aria-hidden="true"
              >
                КБ
              </div>
              <div>
                <div className="font-serif text-[21px] font-black leading-none text-[#0F3526] sm:text-[23px]">
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

          <div className="space-y-3">
            <h1 className="font-serif text-[30px] font-black leading-[1.08] tracking-tight text-[#0F3526] sm:text-[42px]">
              Знакомство с кето и карнивор
            </h1>
            <p className="text-[15px] leading-relaxed text-[#4A5750] sm:text-[16px]">
              «Кето Баланс» — сервис для планирования домашнего меню и списка
              покупок. Помогаем организовать питание из доступных продуктов без
              взвешивания граммов и давления.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <h2 className="shrink-0 text-[11px] font-bold uppercase tracking-[0.14em] text-[#2F3E35] sm:text-[12px]">
              Что это такое простыми словами
            </h2>
            <div className="h-px flex-1 bg-[#DDD8CC]" />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-2">
            <button
              type="button"
              data-testid="start-choose-keto"
              aria-pressed={approach === 'keto'}
              onClick={() => setApproach('keto')}
              className={approachCardClass(approach === 'keto')}
            >
              <img
                src="/media/start/keto_salmon_plate.png"
                alt="Кето-рацион: запечённый лосось с авокадо и свежим салатом"
                className="aspect-[4/3] w-full object-cover"
              />
              <span className="block p-5 text-left sm:p-6">
                <span className="flex items-start justify-between gap-2">
                  <span className="font-serif text-[21px] font-black leading-tight text-[#0F3526] sm:text-[23px]">
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

            <button
              type="button"
              data-testid="start-choose-carnivore"
              aria-pressed={approach === 'carnivore'}
              onClick={() => setApproach('carnivore')}
              className={approachCardClass(approach === 'carnivore')}
            >
              <img
                src="/media/start/carnivore_steak_plate.png"
                alt="Карнивор: сочный стейк из говядины с тимьяном"
                className="aspect-[4/3] w-full object-cover"
              />
              <span className="block p-5 text-left sm:p-6">
                <span className="flex items-start justify-between gap-2">
                  <span className="font-serif text-[21px] font-black leading-tight text-[#0F3526] sm:text-[23px]">
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

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#2F3E35] sm:text-[12px]">
                Подтверждение перед доступом
              </span>
              <span
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

            <div className={checkboxCardClass(confirmed18Plus)}>
              <label className="flex min-h-[44px] cursor-pointer items-start gap-3.5">
                <input
                  type="checkbox"
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

            <div className={checkboxCardClass(consentedToPd)}>
              <label className="flex min-h-[44px] cursor-pointer items-start gap-3.5">
                <input
                  type="checkbox"
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

          <div
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

          {onOpenSupport && (
            <button
              type="button"
              onClick={onOpenSupport}
              className="w-full rounded-2xl border border-[#E2DDD3] bg-white px-4 py-3 text-[13.5px] font-semibold text-[#3A5245] transition-colors hover:border-[#CAD2CB]"
            >
              Сомневаетесь, какой формат подойдёт? Написать Ольге
            </button>
          )}

          {error && (
            <div
              role="alert"
              data-testid="gate-error-message"
              className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-[13.5px] font-medium text-red-900"
            >
              <AlertIcon />
              <span>{error}</span>
            </div>
          )}

          <button
            type="button"
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
        </div>
      </div>
    </div>
  );
}
```

**Важно:** в тексте сохранены только нейтральные формулировки; никаких «минус размер», «уходят отёки», «жиросжигание», «20–30 г углеводов». Если очень хочется вернуть цифру 20–30 г — **нельзя** без утверждённой методологии; это прямо запрещено `AGENTS.md`.

---

### Задача 1.5 — Интегрировать гейт в `src/PilotApp.tsx` (5–7 минут)

#### 1.5.1 Импорт

Найти:

```tsx
import PrivateSupportPage from './pages/PrivateSupportPage';
```

Добавить после:

```tsx
import { StartGateScreen } from './ui/pilot/StartGateScreen';
```

#### 1.5.2 Состояние

Найти:

```tsx
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
```

Добавить после:

```tsx
  const [gatePassed, setGatePassed] = useState(false);
```

#### 1.5.3 Bootstrap: существующий профиль не должен снова видеть гейт

Найти:

```tsx
        if (!currentProfile?.settings || !currentProfile.settings.confirmed18Plus) {
          setPhase('needs_settings');
          return;
        }
```

Заменить на:

```tsx
        if (!currentProfile?.settings || !currentProfile.settings.confirmed18Plus) {
          setPhase('needs_settings');
          return;
        }

        // Профиль уже подтверждён на сервере: это не первый вход,
        // поэтому экран знакомства повторно не показываем.
        setGatePassed(true);
```

#### 1.5.4 Рендер гейта до формы настроек

Найти блок `if (phase === 'needs_settings') {`, внутри него — ветку `if (showSupport) { ... }`. **После** закрывающей `}` этой ветки и **до** `return (` с формой настроек вставить:

```tsx
    if (!gatePassed) {
      return (
        <StartGateScreen
          onContinue={(approach) => {
            setDraftApproach(approach);
            setDraftConfirmed18(true);
            setGatePassed(true);
            setErrorMessage('');
          }}
          onOpenSupport={() => setShowSupport(true)}
        />
      );
    }
```

Порядок важен: `showSupport` остаётся **выше** гейта, чтобы `?screen=support` по-прежнему открывал поддержку без согласия (там нет персональных данных).

#### 1.5.5 Убрать мёртвый пункт «Знакомство» из формы настроек

Найти:

```tsx
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[
                  { id: 'keto', title: 'Кето', desc: 'Низкоуглеводный' },
                  { id: 'carnivore', title: 'Карнивор', desc: 'Мясной рацион' },
                  { id: 'explore', title: 'Знакомство', desc: 'Мягкий старт' },
                ].map((item) => (
```

Заменить на:

```tsx
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { id: 'keto', title: 'Кето', desc: 'Низкоуглеводный' },
                  { id: 'carnivore', title: 'Карнивор', desc: 'Мясной рацион' },
                ].map((item) => (
```

Пояснение: explore-режим не реализован в пилоте, а старый пункт вёл к `alert(...)` — это тупик. Утверждённый экран уже даёт выбор «Кето/Карнивор»; вторичную ссылку «Просто осмотреться без анкеты» в пилот **не добавляем**, потому что за ней нет рабочего экрана. Это осознанное отклонение от макета, зафиксировать в отчёте.

#### 1.5.6 Проверка типов

```bash
npm run typecheck
```

**Ожидаемо:** exit code `0`, вывода нет. Если ошибка — читать точный файл/строку, не отключать проверку.

---

### Задача 1.6 — Фото и `.gitignore` (3 минуты)

Скопировать четыре ассета:

```bash
mkdir -p public/media/start
cp .cache/argon-src/public/media/start/keto_salmon_plate.png public/media/start/
cp .cache/argon-src/public/media/start/keto_kale_avocado.png public/media/start/
cp .cache/argon-src/public/media/start/carnivore_steak_plate.png public/media/start/
cp .cache/argon-src/public/media/start/carnivore_raw_meat.png public/media/start/
ls -l public/media/start
```

**Ожидаемо:** четыре PNG, размер каждого > 0.

Открыть `.gitignore`, найти последнюю строку `.cache/` и добавить ниже:

```gitignore

# публичные ассеты приложения должны попадать в репозиторий
!public/media/
!public/media/**
```

Проверить, что git больше не игнорирует фото:

```bash
git check-ignore -v public/media/start/keto_salmon_plate.png
```

**Ожидаемо:** exit code `1`, вывода нет (файл больше не игнорируется). Если команда печатает правило — исключение не сработало, перечитать `.gitignore`.

Не делать `git add` и `git commit` в основном репозитории.

---

### Задача 1.7 — Обновить существующие E2E под гейт (5–7 минут)

Гейт ломает старые сценарии, которые сразу искали форму настроек. Это нужно исправить, а не ослаблять тесты.

#### 1.7.1 Хелпер в `tests/e2e/pilot.fixture.ts`

В конец файла, перед `export { expect };`, добавить:

```ts
/**
 * Пропускает экран знакомства, если он показан.
 * Для нового пользователя ждёт гейт или форму настроек; для уже
 * подтверждённого профиля просто возвращается.
 */
export async function passStartGateIfNeeded(page: Page): Promise<void> {
  const gate = page.getByTestId('start-gate-screen');
  const settings = page.getByTestId('pilot-settings-form');

  await page
    .locator(
      '[data-testid="start-gate-screen"], [data-testid="pilot-settings-form"]'
    )
    .first()
    .waitFor({ state: 'visible', timeout: 10000 });

  if (await gate.isVisible()) {
    await page.getByTestId('gate-checkbox-age').check();
    await page.getByTestId('gate-checkbox-pd').check();
    await page.getByTestId('start-btn-continue').click();
    await expect(settings).toBeVisible({ timeout: 10000 });
  }
}
```

#### 1.7.2 `tests/e2e/food-flow.spec.ts`

Изменить импорт:

```ts
import { test, expect, passStartGateIfNeeded } from './pilot.fixture';
```

После `await page.goto('/');` добавить:

```ts
    await passStartGateIfNeeded(page);
```

Заменить блок проверки 18+:

```ts
    // 18+ checkbox is required
    const confirm18 = page.locator('[data-testid="settings-confirmed-18"]');
    const submitBtn = page.locator('[data-testid="submit-settings-btn"]');
    await expect(submitBtn).toBeDisabled();

    await confirm18.check();
    await expect(submitBtn).toBeEnabled();
```

на:

```ts
    // 18+ подтверждён на экране знакомства; форма настроек уже доступна.
    const confirm18 = page.locator('[data-testid="settings-confirmed-18"]');
    const submitBtn = page.locator('[data-testid="submit-settings-btn"]');
    await expect(confirm18).toBeChecked();
    await expect(submitBtn).toBeEnabled();
```

#### 1.7.3 `tests/e2e/persistence.spec.ts`

Изменить импорт:

```ts
import { test, expect, passStartGateIfNeeded } from './pilot.fixture';
```

После `await page1.goto('/');` добавить:

```ts
    await passStartGateIfNeeded(page1);
```

После `await pageB.goto('/');` добавить:

```ts
    await passStartGateIfNeeded(pageB);
```

**Не** добавлять хелпер после `page2.goto('/')`: это тот же уже подтверждённый пользователь, гейта там нет.

#### 1.7.4 `tests/e2e/support.spec.ts`

Не менять: `?screen=support` обрабатывается **до** гейта, поддержка доступна без согласия.

#### 1.7.5 Запуск

```bash
npx playwright test tests/e2e/start-gate.spec.ts tests/e2e/food-flow.spec.ts tests/e2e/persistence.spec.ts tests/e2e/support.spec.ts --reporter=list
```

**Ожидаемо:** `4 passed` (1 gate + 1 food-flow + 1 persistence + 1 support), exit code `0`.

Если падает `p0.spec.ts` — не трогать: он ходит на `http://localhost:3000/` и не относится к этому срезу. В отчёте указать отдельно.

---

### Задача 2.1 — Починить изолированную сборку (2 минуты)

В `scripts/build-isolated.mjs` найти:

```js
copyDirectoryFiltered('src', path.join(snapshotDir, 'src'));
```

Добавить после:

```js
// public/ содержит hero.webp и фото стартового экрана. Без этой строки
// Vite собирает dist без /media, и на 18080 вместо фото — битые иконки.
copyDirectoryFiltered('public', path.join(snapshotDir, 'public'));
```

Создать тест `tests/frontend/build-isolated-public.test.cjs`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');

test('isolated build copies public assets into the snapshot', () => {
  const src = fs.readFileSync(
    path.join(ROOT, 'scripts/build-isolated.mjs'),
    'utf8'
  );
  assert.match(src, /copyDirectoryFiltered\(\s*['"]public['"]/);
});

test('public media is trackable by git', () => {
  const result = spawnSync(
    'git',
    ['check-ignore', '-q', 'public/media/food-first/hero.webp'],
    { cwd: ROOT }
  );
  assert.equal(
    result.status,
    1,
    'public/media must not be ignored; check .gitignore exceptions'
  );
});
```

Запустить:

```bash
node --test tests/frontend/build-isolated-public.test.cjs
```

**Ожидаемо:** `# pass 2`, `# fail 0`.

---

### Задача 2.2 — Убрать отладочные элементы (3 минуты)

#### 2.2.1 `src/ui/food-first/AppShell.tsx`

Удалить блок:

```tsx
        <aside className="ff-proof__notice">
          Визуальный макет · синтетические данные · без отправки сообщений
        </aside>
```

Заменить:

```tsx
        <nav className="ff-proof__nav" aria-label="Визуальный пример навигации">
```

на:

```tsx
        <nav className="ff-proof__nav" aria-label="Основная навигация">
```

CSS-класс `.ff-proof__notice` можно оставить — он больше нигде не используется, удалять стили не нужно.

#### 2.2.2 `src/ui/food-first/Menu.tsx`

Удалить:

```tsx
  const [simulateEmptyConflict, setSimulateEmptyConflict] = useState(false);
  const matchingRecipes = simulateEmptyConflict
    ? []
    : filterRecipesBySettings(recipes, settings, catalogRecipes);
```

Заменить на:

```tsx
  const matchingRecipes = filterRecipesBySettings(
    recipes,
    settings,
    catalogRecipes
  );
```

Удалить кнопку:

```tsx
          <button
            type="button"
            className="fm-secondary"
            aria-pressed={simulateEmptyConflict}
            onClick={() => setSimulateEmptyConflict((prev) => !prev)}
          >
            {simulateEmptyConflict ? 'Сбросить конфликт' : 'Проверить конфликт'}
          </button>
```

Удалить блок внутри пустого состояния:

```tsx
          {simulateEmptyConflict && (
            <button
              type="button"
              className="fm-secondary"
              onClick={() => setSimulateEmptyConflict(false)}
            >
              Вернуть рабочий набор рецептов
            </button>
          )}
```

Проверить, что `useState` в `Menu.tsx` всё ещё используется (для `replacingSlot`) — импорт не удалять.

#### 2.2.3 Проверка

```bash
npm run typecheck
npm run test:unit
```

**Ожидаемо:** exit code `0`, `# fail 0`.

---

### Задача 2.3 — Сборка, живой показ, скриншот (10–15 минут)

#### 2.3.1 Собрать изолированный dist

```bash
node scripts/build-isolated.mjs --json > C:/Users/HP/AppData/Local/hermes/cache/scratch/iso-build.json
```

**Ожидаемо:** exit code `0`; в stderr шаги `[BUILD_STEP]`, в конце `[ISOLATED_BUILD] Success! Build ID: ...`; в JSON есть `build_id`, `dist_dir`, `receipt_path`.

Проверить ассеты в dist одной командой (работает в любой оболочке):

```bash
node -e "const fs=require('fs'),path=require('path');const r=JSON.parse(fs.readFileSync('C:/Users/HP/AppData/Local/hermes/cache/scratch/iso-build.json','utf8'));for(const f of ['media/start/keto_salmon_plate.png','media/start/keto_kale_avocado.png','media/start/carnivore_steak_plate.png','media/start/carnivore_raw_meat.png','media/food-first/hero.webp']){const p=path.join(r.dist_dir,f);console.log((fs.existsSync(p)?'OK ':'MISSING ')+f)}"
```

**Ожидаемо:** пять строк `OK ...`, ни одной `MISSING`.

#### 2.3.2 Проверить порт 18080

```bash
netstat -ano | grep ':18080' | grep LISTENING
```

Если пусто — порт свободен, переходи к запуску. Если занят:

- получить PID;
- проверить командную строку:

```bash
wmic process where processid=<PID> get commandline
```

- останавливать **только** если в командной строке есть `run_local_preview.py`. Иначе — стоп, чужой процесс не трогать.

#### 2.3.3 Запустить показ

В отдельном терминале (не закрывать):

```bash
cd C:/Users/HP/Keto-balance
.venv-p0/Scripts/python.exe scripts/run_local_preview.py --port 18080 --lifetime 3600
```

**Ожидаемо:** в выводе:
- `Preview URL: http://127.0.0.1:18080/?demo_user=1084557944`;
- `Catalog: 5 recipes ...`;
- `Database: ...preview-run-.../preview_pilot.db`;
- `Uvicorn running on http://127.0.0.1:18080`.

#### 2.3.4 Проверить health и фото

```bash
node -e "fetch('http://127.0.0.1:18080/api/health').then(r=>{console.log('health',r.status);return r.text()}).then(t=>console.log(t))"
node -e "fetch('http://127.0.0.1:18080/media/start/keto_salmon_plate.png').then(r=>console.log('image',r.status,r.headers.get('content-type')))"
```

**Ожидаемо:** `health 200` + JSON; `image 200 image/png`.

#### 2.3.5 Скриншот 390×844

```bash
mkdir -p docs/audit/evidence/2026-11-01-start-gate
npx playwright screenshot --viewport-size="390,844" --wait-for-timeout=3000 "http://127.0.0.1:18080/?demo_user=1084557944" docs/audit/evidence/2026-11-01-start-gate/start-gate-390x844.png
```

**Ожидаемо:** файл существует, размер > 10 КБ. Открыть его и глазами проверить:
- заголовок «Знакомство с кето и карнивор»;
- две карточки с фото (лосось и стейк), фото не битые;
- два чекбокса;
- кнопка «Продолжить» серая/неактивная;
- нет плашки «Визуальный макет»;
- нет горизонтальной прокрутки на 390 px.

Если фото битые — вернуться к 2.1/2.3.1, не «маскировать» битую иконку.

#### 2.3.6 Ручной сценарий

В браузере открыть тот же URL и пройти:
1. Оба чекбокса → кнопка «Продолжить» стала тёмно-зелёной.
2. «Продолжить» → форма настроек.
3. Выбрать «Кето», ограничения, «Составить меню».
4. Сегодня → Меню → рецепт → Покупки.
5. В Меню **нет** кнопки «Проверить конфликт»; сверху **нет** плашки «Визуальный макет».
6. Фото завтрака (hero) видно.

Если пункт 5/6 не выполняется — не отмечать задачу выполненной.

---

### Задача 3.1 — `docs/LIVE_STATUS.md` (3 минуты)

Создать файл **целиком**:

```md
# LIVE STATUS — Кето Баланс

> Единая точка входа для всех агентов. Обновляй в начале и в конце работы.
> Последнее обновление: 2026-11-01 00:30 MSK · Gemini 3.8 Flash (High), Antigravity.

## Сейчас
- Задача: экран «Знакомство · Мягкий старт» + чистый локальный показ.
- Ветка: `design/argon-ui-import`, HEAD `5f39a90`; рабочее дерево dirty — это сохранённые изменения владельца, не сбрасывать.
- Утверждённый источник: песочница `olyalyazinchenk-wq/Keto-Balance_Argon-4`, commit `7c4874a9`; макет — `C:/Users/HP/.codex/generated_images/01a19367-03e5-7143-89a4-d8ffd7fa7aef/exec-689f3c91-b8af-4d4b-9fb5-6d3035ede604.png`.
- Живой показ: `http://127.0.0.1:18080/?demo_user=1084557944` (запускать `run_local_preview.py`; один экземпляр).
- Статус: в работе; отчёт — `docs/handoff/2026-11-01-start-gate-report.md`.

## Роли
| Среда | Модель | Роль | Не делает |
|---|---|---|---|
| ChatGPT Desktop | GPT 6.1 Terra + Product Design | арт-директор, концепты | не гоняет Chrome/AI Studio циклами |
| Google AI Studio | Argon-4 | прототип и дизайн | не источник истины для локального кода |
| Antigravity | Gemini 3.8 Flash (High) | локальный сборщик и интегратор | не коммитит/пушит основной репо |
| Hermes | GPT 6.1 Haiku | координатор и приёмка | не дублирует круги тестов |

## Канонические команды
- Песочница: `node scripts/argon-pull.mjs --no-build`
- Проверки: `npm run typecheck`, `npm run test:unit`
- Сборка показа: `node scripts/build-isolated.mjs --json`
- Запуск: `.venv-p0/Scripts/python.exe scripts/run_local_preview.py --port 18080 --lifetime 3600`

## Блокеры и решения владельца
- Юридические тексты оферты/ПДн: `[УТОЧНИТЬ]`; чекбоксы обязательны, текст-заглушка честная.
- Публикация в Telegram/прод и коммит основного репо: отдельное согласование, не в этом срезе.

## Следующий шаг
1. Прогнать acceptance из `docs/handoff/2026-11-01-start-gate.md`.
2. Обновить этот файл фактическим build ID и результатами тестов.
3. Передать отчёт координатору (Hermes).
```

Проверка:

```bash
node -e "const fs=require('fs');console.log(fs.existsSync('docs/LIVE_STATUS.md'), fs.statSync('docs/LIVE_STATUS.md').size)"
```

**Ожидаемо:** `true` и размер > 1000 байт.

---

### Задача 3.2 — `docs/TEAMWORK.md` (5 минут)

Создать файл **целиком**:

```md
# TEAMWORK — протокол работы нескольких агентов

Этот файл описывает, как разные модели и среды работают над одним проектом без гонки, потери контекста и сгорания лимитов. Он не заменяет `AGENTS.md`; при конфликте побеждают инварианты `AGENTS.md`.

## 1. Один источник истины
- Текущий статус: `docs/LIVE_STATUS.md` — читать первым, обновлять в начале и конце.
- Задание: `docs/handoff/<дата>-<слаг>.md`.
- Отчёт: `docs/handoff/<дата>-<слаг>-report.md` по шаблону `docs/handoff/TEMPLATE.md`.
- Код: рабочее дерево `C:/Users/HP/Keto-balance`. Песочница Argon — источник дизайна, не истина для локального кода.

## 2. Роли
| Среда | Модель | Роль | Чего не делает |
|---|---|---|---|
| ChatGPT Desktop | GPT 6.1 Terra + Product Design | арт-директор: концепты, PNG, UX-тексты | не управляет Chrome/AI Studio в цикле ожидания |
| Google AI Studio | Argon-4 | прототип, визуальный дизайн | не пишет в основной репозиторий |
| Antigravity | Gemini 3.8 Flash (High) | локальный сборщик, вёрстка, тесты, сборка показа | не коммитит/пушит основной репо без согласования |
| Hermes | GPT 6.1 Haiku | координатор, финальная приёмка, отчёт владельцу | не запускает 5–7 повторных кругов тестов |

## 3. Правило одного писателя
- Один файл в момент времени меняет один агент.
- Перед правкой: `git status --short`; если файл уже изменён другим — не перезаписывать, согласовать.
- Backend/DTO замораживаются до интеграции UI; после заморозки backend и client можно делить по непересекающимся файлам.
- Максимум две параллельные workstream. Независимый reviewer — read-only.

## 4. Цикл передачи
1. Арт-директор даёт PNG/ссылку и тексты, **не код**.
2. AI Studio (если используется) отправляет изменения в песочницу кнопкой «Отправить изменения в GitHub».
3. Локальный интегратор: `argon-pull` → diff → перенос → тесты → сборка → показ.
4. Координатор проверяет **один раз**: файлы, команды, фактический вывод, скриншот 390×844.
5. Отчёт по шаблону; `LIVE_STATUS.md` обновлён.

## 5. Экономия лимитов
- Запрещены циклы Computer Use «подождать AI Studio»: это до 80% лимитов на пустое ожидание.
- Не опрашивать вкладку чаще, чем раз в 2–3 минуты; лучше забрать результат через GitHub.
- Не запускать полный набор тестов после каждой строки: targeted → полный перед сдачей.
- Один финальный review, а не 7 раундов «ещё немного проверю».

## 6. Git и данные
- В основном репозитории: без `commit`/`push` без отдельного согласования владельца.
- Песочница: только кнопка отправки в AI Studio + `node scripts/argon-pull.mjs --no-build`.
- Секреты, `.env`, рабочие БД, runtime-логи и данные участников не читать и не выводить.
- Не убивать чужие процессы. Порты `8000`, `4387`, `8090` — не наши.

## 7. Критерий «готово»
- Указаны файлы, команды, фактический вывод, скриншот.
- Указан build ID и путь к receipt.
- Честно перечислены отклонения и `[УТОЧНИТЬ]`.
- Нет слов «должно работать» без вывода команды.
```

Проверка:

```bash
node -e "const fs=require('fs');console.log(fs.existsSync('docs/TEAMWORK.md'), fs.statSync('docs/TEAMWORK.md').size)"
```

**Ожидаемо:** `true`, размер > 2000 байт.

---

### Задача 3.3 — `docs/handoff/TEMPLATE.md` (3 минуты)

Создать файл **целиком**:

```md
# Отчёт исполнителя: <короткое название задачи>

- Дата/время (MSK):
- Агент/модель:
- Среда:
- Ветка/HEAD:
- Scope (файлы):
- Задание (ссылка):

## Что сделано
1.
2.
3.

## Команды и фактический вывод
| Команда | Exit code | Ключевой вывод |
|---|---|---|
| `npm run typecheck` | | |
| `node --test ...` | | |
| `npx playwright test ...` | | |
| `node scripts/build-isolated.mjs --json` | | build_id=... |
| `curl/fetch ...` | | HTTP ... |

## Скриншот
- Путь:
- Размер экрана: 390×844
- Что видно:

## Отклонения от задания
- Что и почему.

## Блокеры и вопросы владельцу
- Один список; без размытых формулировок.

## Следующий шаг
- Кто и что делает.
```

Проверка:

```bash
node -e "const fs=require('fs');console.log(fs.existsSync('docs/handoff/TEMPLATE.md'))"
```

**Ожидаемо:** `true`.

---

### Задача 3.4 — Указатели в `README.md` и `AGENTS.md` (3 минуты)

#### 3.4.1 `README.md`

Найти:

```md
> **Актуальное состояние, проверки и открытые блокеры: [`docs/CURRENT-STATE.md`](docs/CURRENT-STATE.md)** — читать первым, если вы агент или новый разработчик.
```

Добавить после:

```md

> **Координация агентов:** [`docs/LIVE_STATUS.md`](docs/LIVE_STATUS.md) — кто что делает сейчас; [`docs/TEAMWORK.md`](docs/TEAMWORK.md) — правила передачи; [`docs/handoff/TEMPLATE.md`](docs/handoff/TEMPLATE.md) — формат отчёта.
```

#### 3.4.2 `AGENTS.md`

Найти:

```md
- После отправки: `node scripts/sync-argon.mjs` — тянет песочницу, показывает diff, гоняет `tsc` и `vite build`. Результат сообщать фактами, а не «должно работать».
```

Заменить на:

```md
- После отправки: `node scripts/argon-pull.mjs --no-build` — тянет песочницу и показывает diff; без `--no-build` скрипт дополнительно гоняет сборку. Результат сообщать фактами, а не «должно работать».
```

В конец файла добавить:

```md

## Координация агентов
- Статус и роли: `docs/LIVE_STATUS.md`. Протокол передачи: `docs/TEAMWORK.md`. Формат отчёта: `docs/handoff/TEMPLATE.md`.
- Перед работой прочитать `docs/LIVE_STATUS.md`; после работы обновить его фактами (файлы, команды, вывод, скриншот).
```

Проверка:

```bash
node -e "const fs=require('fs');const r=fs.readFileSync('README.md','utf8');const a=fs.readFileSync('AGENTS.md','utf8');console.log('readme',r.includes('docs/TEAMWORK.md'));console.log('agents',a.includes('argon-pull.mjs'));console.log('coord',a.includes('Координация агентов'))"
```

**Ожидаемо:** `readme true`, `agents true`, `coord true`.

---

### Задача 3.5 — Бриф задания в репозитории (3 минуты)

Создать `docs/handoff/2026-11-01-start-gate.md`:

```md
# Задание: «Знакомство · Мягкий старт» + чистый показ

- **Исполнитель:** Gemini 3.8 Flash (High), Antigravity.
- **Полный план:** `.hermes/plans/2026-11-01_001918-start-gate-and-teamwork.md` (читать первым).
- **Утверждено владельцем:** шаги 1 и 2 ответа Argon-4; изменения AI Studio отправлены в песочницу.
- **Ветка:** `design/argon-ui-import`, HEAD `5f39a90`; dirty tree сохранять.

## Результат
1. Новый пользователь видит экран «Знакомство с кето и карнивор» с двумя карточками и фото.
2. Без двух галочек (18+ и ПДн) кнопка «Продолжить» неактивна.
3. После галочек открывается форма настроек; меню и покупки работают.
4. На `18080` нет плашки «Визуальный макет» и кнопки «Проверить конфликт».
5. В `docs/` есть `LIVE_STATUS.md`, `TEAMWORK.md`, `handoff/TEMPLATE.md`.
6. Хвост НутриОК закрыт отдельным коммитом в его репозитории.

## Запреты
- Не коммитить/пушить основной репозиторий.
- Не читать секреты, БД, runtime-логи.
- Не менять БКЖУ/цены/медицинские тексты.
- Не добавлять explore-режим, оплату, OCR, напоминания.

## Приёмка
См. раздел 9 полного плана. Без фактических выводов команд задача не считается выполненной.
```

Проверка:

```bash
node -e "const fs=require('fs');console.log(fs.existsSync('docs/handoff/2026-11-01-start-gate.md'))"
```

**Ожидаемо:** `true`.

---

### Задача 3.6 — Обновить `LIVE_STATUS.md` фактами (3 минуты)

После всех проверок заменить в `docs/LIVE_STATUS.md`:
- `Последнее обновление` — на фактическое время;
- `Статус: в работе` — на `Статус: проверено локально; отчёт ...`;
- добавить блок:

```md
## Проверено (факты)
- `node --test tests/frontend/start-gate.test.cjs` → pass 3, fail 0.
- `npm run test:unit` → pass <N>, fail 0.
- `npx playwright test ...` → 4 passed.
- `node scripts/build-isolated.mjs --json` → build_id `<BUILD_ID>`.
- `http://127.0.0.1:18080/api/health` → 200.
- Скриншот: `docs/audit/evidence/2026-11-01-start-gate/start-gate-390x844.png`.
- НутриОК: `8 passed`, commit `<SHA>`, push выполнен.
```

Числа и SHA брать только из фактического вывода, не придумывать.

---

### Задача 4.1 — НутриОК: проверить хвост (2 минуты)

Перейти в отдельный репозиторий:

```bash
cd "C:/Users/HP/Desktop/Новая папка"
git branch --show-current
git status --porcelain
```

**Ожидаемо:**
- ветка `master`;
- ровно четыре пути:
  ` M WellnessBot/html_pdf_engine.py`, ` M WellnessBot/main.py`, ` M WellnessBot/templates/nutriok_report.html.j2`, `?? tests/test_nutriok_fact_fidelity.py`.

Если появились другие изменения — **не коммитить всё подряд**; добавить только эти четыре файла + `docs/PROJECT_PULSE_LOG.md`. Чужие изменения сохранить.

Прочитать (обязательный startup order этого репозитория):
`docs/CURRENT_STAGE.json`, `docs/AGENT_CONTEXT_HUB.md`, `docs/KNOWLEDGE_SYNC_HUB.md`, `docs/PROJECT_PULSE_LOG.md`, `docs/AGENT_SYNC_PROTOCOL.md`.

**Этап не меняется:** `nutriok-controlled-build-2026-07-17-r1`; `CURRENT_STAGE.json` не редактировать.

---

### Задача 4.2 — НутриОК: тест (2 минуты)

```bash
cd "C:/Users/HP/Desktop/Новая папка"
.venv/Scripts/python.exe -m pytest tests/test_nutriok_fact_fidelity.py -q
.venv/Scripts/python.exe -m compileall -q WellnessBot tests
```

**Ожидаемо:**
- `8 passed` (exit code `0`);
- `compileall` без вывода (exit code `0`).

Если тест падает — **стоп**, не коммитить; приложить вывод.

---

### Задача 4.3 — НутриОК: pulse log, commit, push, readback (5 минут)

#### 4.3.1 Pulse log

В конец `docs/PROJECT_PULSE_LOG.md` добавить (заменить `<...>` фактическими значениями):

```md

## 2026-11-01 <HH:MM> MSK - Fact Fidelity: публикация проверенного хвоста

- Этап не изменён: `nutriok-controlled-build-2026-07-17-r1`; `PAYMENT_MODE=manual`, public launch заблокирован, второй polling-процесс не запускался.
- **Fact Fidelity (`WellnessBot/html_pdf_engine.py`, `WellnessBot/main.py`, `WellnessBot/templates/nutriok_report.html.j2`, `tests/test_nutriok_fact_fidelity.py`)**: добавлена защита от выдуманных AI-цитат и неподтверждённых фактов в PDF-отчёте `ОК-Разбор`; неподтверждённые цитаты не попадают в HTML, baseline/тайр не подменяются AI.
- Проверки: `8 passed` (`pytest tests/test_nutriok_fact_fidelity.py -q`), `compileall` без ошибок.
- Git: commit `<SHA>`, push в `origin/master`, `git status --porcelain` пуст, `git ls-remote` совпадает с локальным HEAD.
```

#### 4.3.2 Commit и push

```bash
cd "C:/Users/HP/Desktop/Новая папка"
git add WellnessBot/html_pdf_engine.py WellnessBot/main.py WellnessBot/templates/nutriok_report.html.j2 tests/test_nutriok_fact_fidelity.py docs/PROJECT_PULSE_LOG.md
git commit -m "fix(nutriok): enforce fact fidelity in OK review PDF reports"
git push origin master
```

**Ожидаемо:** commit создан; push завершился без ошибок.

Если push просит пароль/2FA — **не вводить**. Открыть окно и передать владельцу; записать блокер.

#### 4.3.3 Readback

```bash
git status --porcelain
git log -1 --oneline
git ls-remote origin refs/heads/master
```

**Ожидаемо:**
- `git status --porcelain` пуст (или только чужие, не наши файлы — перечислить);
- `git log -1 --oneline` → `<SHA> fix(nutriok): enforce fact fidelity in OK review PDF reports`;
- `git ls-remote` → тот же `<SHA>` для `refs/heads/master`.

Не писать «синхронизировано», пока readback не совпал.

---

### Задача 5.1 — Финальный отчёт (5 минут)

Создать `docs/handoff/2026-11-01-start-gate-report.md` по `docs/handoff/TEMPLATE.md`. Обязательно:
- фактические числа тестов (`pass`, `fail`);
- `build_id` и путь к `dist`;
- вывод health/image;
- путь к скриншоту;
- отклонения: нет вторичной ссылки explore; ПДн-согласие не сохраняется на сервере; основной репозиторий не закоммичен;
- НутриОК commit SHA и результат readback;
- блокеры (если есть) — одним списком.

После этого обновить `docs/LIVE_STATUS.md` (задача 3.6) и сообщить владельцу короткий итог.

---

## 8. Тесты и валидация (TDD-цикл)

| Шаг | RED | GREEN | Проверка |
|---|---|---|---|
| Логика гейта | `node --test tests/frontend/start-gate.test.cjs` → module not found | создать `gate.ts` | `pass 3, fail 0` |
| Экран-гейт | `npx playwright test tests/e2e/start-gate.spec.ts` → локатор не найден | создать компонент + интеграция | `1 passed` |
| Регрессия flow | старые specs падают на форме настроек | хелпер + правки specs | `4 passed` |
| Сборка | dist без `media/` | копировать `public/` | 5×`OK` |
| Отладка | плашка/кнопка видны | удалить | grep false |
| Документы | файлов нет | создать | `exists true` |
| НутриОК | 4 dirty файла | тест + commit/push | `8 passed`, readback |

**Правило:** не ослаблять тест ради зелёного. Если тест падает по реальной причине — чинить причину. Если причина вне scope — стоп и отчёт.

---

## 9. Критерии приёмки (все обязательны)

1. `node --test tests/frontend/start-gate.test.cjs` → `# pass 3`, `# fail 0`.
2. `npm run test:unit` → exit `0`, `# fail 0`; число pass записано.
3. `npm run typecheck` → exit `0`, без вывода.
4. `npx playwright test tests/e2e/start-gate.spec.ts tests/e2e/food-flow.spec.ts tests/e2e/persistence.spec.ts tests/e2e/support.spec.ts --reporter=list` → `4 passed`.
5. `node scripts/build-isolated.mjs --json` → exit `0`; `build_id` записан.
6. В `dist` есть `media/start/*.png` (4 файла) и `media/food-first/hero.webp`.
7. `http://127.0.0.1:18080/api/health` → HTTP `200`.
8. `http://127.0.0.1:18080/media/start/keto_salmon_plate.png` → HTTP `200`, `image/png`.
9. Скриншот `docs/audit/evidence/2026-11-01-start-gate/start-gate-390x844.png` существует и визуально соответствует: две карточки, фото, два чекбокса, неактивная кнопка.
10. После двух галочек кнопка активна; после клика открывается `pilot-settings-form`.
11. В `AppShell.tsx` нет строки `Визуальный макет`; в `Menu.tsx` нет `Проверить конфликт`.
12. `docs/LIVE_STATUS.md`, `docs/TEAMWORK.md`, `docs/handoff/TEMPLATE.md`, `docs/handoff/2026-11-01-start-gate.md` существуют.
13. `README.md` ссылается на `docs/TEAMWORK.md`; `AGENTS.md` содержит `argon-pull.mjs` и раздел `Координация агентов`.
14. НутриОК: `8 passed`, commit создан, push выполнен, `git status --porcelain` пуст, `git ls-remote` совпадает.
15. Основной репозиторий: HEAD остался `5f39a90`, новых commit/push нет; рабочее дерево содержит только ожидаемые изменения.

Если хотя бы один пункт не выполнен — **не писать «готово»**. Указать, что именно не выполнено и почему.

---

## 10. Риски, компромиссы и открытые вопросы

1. **Юридический текст не утверждён.** В экране стоит честная заглушка `[УТОЧНИТЬ: проект юридической документации на согласовании автором]`. Не заменять её «красивым» текстом из интернета и не обещать юридическую силу.
2. **Согласие на ПДн не сохраняется на сервере.** В пилоте это UI-гейт; в БД уходит только `confirmed18Plus`. Для реального продукта нужны поле версии согласия, время, миграция и юридическая проверка — отдельная задача. Зафиксировать в отчёте.
3. **Нет вторичной ссылки «Просто осмотреться без анкеты».** В пилоте нет explore-режима; ссылка вела бы в тупик. Это отклонение от макета, согласовать с владельцем в отчёте.
4. **Основной репозиторий не коммитится.** По `AGENTS.md` и handoff Gemini не делает commit/push. Владелец/координатор фиксирует изменения отдельно. Если нужен GitHub — это отдельное согласование.
5. **`.gitignore` меняется.** Исключение `!public/media/` делает ассеты trackable. Это не секреты, а продуктовые изображения; проверить, что в `public/media` нет ничего лишнего.
6. **E2E `p0.spec.ts`** ходит на `localhost:3000` и не относится к этому срезу. Не включать в acceptance и не «чинить» его здесь.
7. **НутриОК — отдельный репозиторий.** Push может потребовать credentials/2FA. Коды не вводить; при блокере — сообщить владельцу.
8. **Прокси/сеть.** `argon-pull` зависит от `gh` и прокси `127.0.0.1:10809`. Если Happ выключен — pull упадёт; это не повод подменять ассеты.
9. **Порт 18080.** Если занят чужим процессом — не убивать. Остановить только `run_local_preview.py` после проверки командной строки.
10. **Повторный показ гейта.** Гейт показывается только новому профилю (нет `confirmed18Plus`). После завершения настроек повторно его увидеть можно, запустив новый preview (новая БД) или очистив тестовую БД; это нормально, не ломать логику ради «показать ещё раз».
11. **Фото — иллюстративные.** Не выдавать их за точное изображение конкретного рецепта; alt-текст честный.
12. **Дублирование 18+ в форме настроек.** Галочка остаётся как финальное подтверждение; если владелец попросит убрать — отдельная задача, не в этом срезе.

---

## 11. Что не делать

- Не запускать новое интервью и не пересматривать роли/архитектуру.
- Не добавлять новые зависимости, MCP, плагины, модели.
- Не менять `bot/`, `src/domain/`, `src/core/keto-engine/`, `src/data/recipes.ts`, цены, тарифы.
- Не переписывать `FoodFirstApp` целиком; только точечные правки.
- Не копировать старый `StartScreen` из `design/argon-food-first-work` вместо нового экрана.
- Не коммитить/пушить `Keto-balance`.
- Не выдавать `pass` без фактического вывода команды.
- Не писать «должно работать» и «всё готово» без acceptance-таблицы.

---

## 12. Первое сообщение исполнителя (шаблон)

```text
Принял задание. Работаю в C:/Users/HP/Keto-balance, ветка design/argon-ui-import, HEAD 5f39a90, dirty tree сохраняю.
План: .hermes/plans/2026-11-01_001918-start-gate-and-teamwork.md.
Режим: /boost (или /teamwork), без нового интервью. Коммиты/пуш в основной репо не делаю.
Начинаю с baseline: typecheck + unit + argon-pull --no-build. Вернусь с фактами: файлы, команды, вывод.
```
