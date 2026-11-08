import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { KetoClient, ApiError, ConflictError, UnauthorizedError } from './api/ketoClient';
import { resolveTelegramLaunchAuth } from './tma/launchAuth';
import { onLateTelegramSDK } from './tma/telegram';
import type {
  PilotCatalogV1,
  PilotPreferencesV1,
  PilotProfileV1,
  PilotStateV1,
  PilotShoppingItemV1,
  PilotRestrictionToken,
  ShoppingRange,
} from './api/pilotTypes';
import {
  preferencesToUserProfile,
  isMenuCompatibleWithProfile,
  approachToMode,
  SerializedSaveQueue,
  writeUserCache,
  readUserCache,
  RESTRICTION_MAP,
} from './adapters/pilotState';
import { createMenuController } from './adapters/menuController';
import { resolveSelectedDate } from './domain/menu';
import { isRecipeAllowed } from './domain/eligibility';
import { FoodFirstApp } from './ui/food-first/FoodFirstApp';
import { rebuildShoppingFromMenu } from './ui/food-first/shoppingFromMenu';
import { toRecipeViewModel } from './ui/food-first/recipesAdapter';
import type { RecipeViewModel } from './ui/food-first/contract';
import PrivateSupportPage from './pages/PrivateSupportPage';
import { StartGateScreen } from './ui/pilot/StartGateScreen';
import { fetchSubscription } from './adapters/pilotApi';
import type { SubscriptionState } from './types/subscription';
import { PaywallModal } from './ui/food-first/PaywallModal';

type PilotPhase =
  | 'init'
  | 'authenticating'
  | 'loading'
  | 'needs_settings'
  | 'ready'
  | 'unauthorized'
  | 'error'
  | 'conflict';

type SyncStatus = 'idle' | 'saving' | 'saved' | 'error' | 'conflict';

const RESTRICTIONS_LIST: { token: PilotRestrictionToken; label: string }[] = [
  { token: 'exclude_eggs', label: 'Исключить яйца' },
  { token: 'exclude_dairy', label: 'Исключить молочные продукты' },
  { token: 'exclude_fish', label: 'Исключить рыбу' },
  { token: 'exclude_nuts', label: 'Исключить орехи' },
  { token: 'exclude_offal', label: 'Не использовать субпродукты' },
  { token: 'exclude_mushrooms', label: 'Не использовать грибы' },
];

export default function PilotApp() {
  const [phase, setPhase] = useState<PilotPhase>('init');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [gatePassed, setGatePassed] = useState<boolean>(false);

  const [userId, setUserId] = useState<number | null>(null);
  const [userRevision, setUserRevision] = useState<number>(0);
  const [shoppingRevision, setShoppingRevision] = useState<number>(0);

  const [catalog, setCatalog] = useState<PilotCatalogV1 | null>(null);
  const [profile, setProfile] = useState<PilotProfileV1 | null>(null);
  const [state, setState] = useState<PilotStateV1 | null>(null);
  const [shoppingItems, setShoppingItems] = useState<PilotShoppingItemV1[]>([]);

  // Monetization and subscription state
  const [sessionToken, setSessionToken] = useState<string>('');
  const [subscription, setSubscription] = useState<SubscriptionState | null>(null);
  const [showPaywall, setShowPaywall] = useState<boolean>(false);

  // Settings form draft state (for new or editing users)
  const [draftConfirmed18, setDraftConfirmed18] = useState<boolean>(false);
  const [draftApproach, setDraftApproach] = useState<'keto' | 'carnivore' | 'explore'>('keto');
  const [draftRestrictions, setDraftRestrictions] = useState<PilotRestrictionToken[]>([]);
  const [draftPrepTime, setDraftPrepTime] = useState<number>(35);
  const [draftMealsPerDay, setDraftMealsPerDay] = useState<2 | 3 | 4>(3);
  const [draftPlanDays, setDraftPlanDays] = useState<1 | 3 | 7 | 28 | 29 | 30 | 31>(30);
  const [draftMonth, setDraftMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [availableCatalogs, setAvailableCatalogs] = useState<
    Array<{
      catalog_id: string;
      catalog_month?: string;
      editorial_status: string;
      accessible: boolean;
      total_recipes: number;
    }>
  >([]);
  const [viewHomeBeforeGate, setViewHomeBeforeGate] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search);
      const s = p.get('screen');
      if (s === 'home' || s === 'today') return true;
      if (window.location.hash.includes('home') || window.location.hash.includes('today')) return true;
    }
    return false;
  });
  const [showSupport, setShowSupport] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search);
      if (p.get('screen') === 'support') return true;
      if (window.location.hash.includes('support')) return true;
    }
    return false;
  });

  // References for queue execution
  const userRevisionRef = useRef<number>(0);
  const shoppingRevisionRef = useRef<number>(0);
  const profileRef = useRef<PilotProfileV1 | null>(null);
  const stateRef = useRef<PilotStateV1 | null>(null);
  const shoppingItemsRef = useRef<PilotShoppingItemV1[]>([]);
  const stickyErrorRef = useRef<'conflict' | 'error' | null>(null);
  const authDispatchedRef = useRef<boolean>(false);

  useEffect(() => {
    userRevisionRef.current = userRevision;
  }, [userRevision]);
  useEffect(() => {
    shoppingRevisionRef.current = shoppingRevision;
  }, [shoppingRevision]);
  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    shoppingItemsRef.current = shoppingItems;
  }, [shoppingItems]);

  const client = useMemo(() => new KetoClient(), []);
  const saveQueue = useMemo(() => new SerializedSaveQueue(), []);

  // UI recipes lookup map
  const recipesById = useMemo<Record<string, RecipeViewModel>>(() => {
    if (!catalog) return {};
    const map: Record<string, RecipeViewModel> = {};
    for (const r of catalog.recipes) {
      map[r.id] = toRecipeViewModel(r);
    }
    return map;
  }, [catalog]);

  // Load registered catalogs list, refreshed whenever sessionToken / userId changes
  const catalogRegistryReqIdRef = useRef(0);
  const refreshCatalogRegistry = useCallback(async () => {
    const reqId = ++catalogRegistryReqIdRef.current;
    try {
      const res = await client.listCatalogs();
      if (reqId === catalogRegistryReqIdRef.current && res && Array.isArray(res.catalogs)) {
        setAvailableCatalogs(res.catalogs);
      }
    } catch {
      // Keep existing catalogs if available
    }
  }, [client]);

  useEffect(() => {
    void refreshCatalogRegistry();
  }, [client, sessionToken, userId, refreshCatalogRegistry]);

  // Auth & bootstrap
  useEffect(() => {
    client.onUnauthorized = () => {
      setPhase('unauthorized');
      setErrorMessage('Сессия завершена или недействительна. Пожалуйста, откройте бот заново.');
    };

    let isMounted = true;

    const startBootstrap = async (initData: string, demoUserId: number | null) => {
      setPhase('authenticating');
      try {
        let session;
        if (demoUserId !== null) {
          // The API permits demo auth only in the isolated test stage.
          session = await client.createDemoSession(demoUserId);
        } else {
          session = await client.createSession(initData);
        }
        if (!isMounted) return;
        setUserId(session.user_id);
        setSessionToken(session.session_token);
        setPhase('loading');

        void fetchSubscription(session.session_token).then((data) => {
          if (isMounted) setSubscription(data);
        }).catch(() => { /* Keep access unknown; subscription service does not block meals. */ });
        const [userData, shopData, catListRes] = await Promise.all([
          client.getUser(),
          client.getShopping(),
          client.listCatalogs().catch(() => null),
        ]);

        if (!isMounted) return;

        if (catListRes && Array.isArray(catListRes.catalogs)) {
          setAvailableCatalogs(catListRes.catalogs);
        }

        const savedCatalogId = userData.state?.menu?.catalog_id;
        let catData: PilotCatalogV1;
        try {
          catData = await client.getCatalog(savedCatalogId || undefined);
        } catch (catErr: any) {
          if (savedCatalogId) {
            setPhase('error');
            setErrorMessage(`Сохранённая версия каталога меню (${savedCatalogId}) недоступна на сервере. Пожалуйста, обратитесь в службу поддержки.`);
            return;
          }
          throw catErr;
        }

        if (!isMounted) return;
        setCatalog(catData);
        userRevisionRef.current = userData.revision;
        shoppingRevisionRef.current = shopData.revision;
        setUserRevision(userData.revision);
        setShoppingRevision(shopData.revision);

        const currentProfile = userData.profile;
        let currentState = userData.state;

        if (!currentProfile?.settings || !currentProfile.settings.confirmed18Plus) {
          setPhase('needs_settings');
          return;
        }

        // Returning user with confirmed18Plus === true on server: bypass Start Gate
        setGatePassed(true);

        // Initialize draft settings from current profile
        setDraftConfirmed18(Boolean(currentProfile.settings.confirmed18Plus));
        setDraftApproach(currentProfile.settings.approach || 'keto');
        setDraftRestrictions(currentProfile.settings.restrictions || []);
        setDraftPrepTime(currentProfile.settings.prepTimeMax ?? 0);
        setDraftMealsPerDay((currentProfile.settings.mealsPerDay as any) || 3);
        setDraftPlanDays((currentProfile.settings.planDays as any) || 3);
        if (currentProfile.settings.month) {
          setDraftMonth(currentProfile.settings.month);
        } else if (currentState?.menu?.month) {
          setDraftMonth(currentState.menu.month);
        }

        if (currentProfile.settings.approach === 'explore') {
          setPhase('needs_settings');
          setErrorMessage('Режим «Знакомство» носит ознакомительный характер. Для расчёта персонального меню выберите «Кето» или «Карнивор».');
          return;
        }

        setProfile(currentProfile);
        profileRef.current = currentProfile;
        setShoppingItems(shopData.items || []);
        shoppingItemsRef.current = shopData.items || [];

        if (currentState?.menu) {
          const canonProfile = preferencesToUserProfile(currentProfile.settings);
          const isComp = isMenuCompatibleWithProfile(
            currentState.menu,
            canonProfile,
            catData.recipes,
            catData.released_ids,
            catData.test_only
          );
          if (!isComp) {
            const controller = createMenuController(catData.recipes, catData.released_ids, {
              isPreview: catData.test_only,
              catalogId: catData.catalog_id,
            });
            const validNumDays = (currentProfile.settings.planDays && [1, 3, 7, 28, 29, 30, 31].includes(currentProfile.settings.planDays as any))
              ? currentProfile.settings.planDays
              : (currentState.menu.days?.length && [1, 3, 7, 28, 29, 30, 31].includes(currentState.menu.days.length as any)
                ? currentState.menu.days.length
                : 3) as any;
            const targetMonth = currentState.menu.month || currentProfile.settings.month;
            const isCalendarMonth = validNumDays >= 28 || Boolean(targetMonth && (currentProfile.settings.planDays ?? 0) >= 28);
            try {
              const rebuiltMenu = controller.createUserMenu({
                numDays: validNumDays,
                month: isCalendarMonth ? targetMonth : undefined,
                meals: currentProfile.settings.mealsPerDay,
                profile: canonProfile,
                mode: approachToMode(currentProfile.settings.approach),
                catalogId: catData.catalog_id,
              });
              const nextSelectedDate = resolveSelectedDate(rebuiltMenu, currentState.selected_date);
              currentState = {
                ...currentState,
                menu: rebuiltMenu,
                selected_date: nextSelectedDate,
                shopping_stale: true,
              };
              enqueueUserStateSave(currentState);
            } catch {
              setPhase('needs_settings');
              setErrorMessage('Сохранённое меню несовместимо с текущими настройками, а составить новое меню невозможно. Пожалуйста, измените параметры или ограничения.');
              return;
            }
          }

          // Check shopping consistency with menu
          if (currentState?.menu) {
            const menuTitles = new Set<string>();
            for (const day of currentState.menu.days) {
              for (const rid of Object.values(day.slots)) {
                const r = catData.recipes.find((x) => x.id === rid);
                if (r) menuTitles.add(r.title);
              }
            }
            const shoppingTitles = new Set<string>();
            for (const it of shopData.items || []) {
              for (const t of it.linkedRecipeTitles || []) {
                shoppingTitles.add(t);
              }
            }
            if (
              menuTitles.size > 0 &&
              (shopData.items?.length === 0 ||
                Array.from(menuTitles).some((t) => !shoppingTitles.has(t)) ||
                Array.from(shoppingTitles).some((t) => !menuTitles.has(t)))
            ) {
              currentState = {
                ...currentState,
                shopping_stale: true,
              };
            }
          }

          setState(currentState);
          stateRef.current = currentState;
          setPhase('ready');
        } else {
          // Generate initial menu if missing
          const canonProfile = preferencesToUserProfile(currentProfile.settings);
          const controller = createMenuController(catData.recipes, catData.released_ids, {
            isPreview: catData.test_only,
            catalogId: catData.catalog_id,
          });
          const planDays = (currentProfile.settings.planDays && [1, 3, 7, 28, 29, 30, 31].includes(currentProfile.settings.planDays as any))
            ? currentProfile.settings.planDays
            : 3;
          const targetMonth = currentProfile.settings.month;
          const isCalendarMonth = planDays >= 28;
          let genMenu;
          try {
            genMenu = controller.createUserMenu({
              numDays: planDays,
              month: isCalendarMonth ? targetMonth : undefined,
              meals: currentProfile.settings.mealsPerDay,
              profile: canonProfile,
              mode: approachToMode(currentProfile.settings.approach),
              catalogId: catData.catalog_id,
            });
          } catch (genErr: any) {
            setPhase('error');
            setErrorMessage(genErr.message || 'Не удалось составить меню из доступных рецептов.');
            return;
          }

          const nextSelectedDate = resolveSelectedDate(genMenu, null);
          const initState: PilotStateV1 = {
            schema_version: 1,
            menu: genMenu,
            selected_date: nextSelectedDate,
            checked_ingredients: {},
            checked_steps: {},
            shopping_batches: 1,
            shopping_stale: false,
          };

          const initialUiMap: Record<string, RecipeViewModel> = {};
          for (const r of catData.recipes) initialUiMap[r.id] = toRecipeViewModel(r);
          const initialShopping = rebuildShoppingFromMenu(genMenu, initialUiMap, [], 1);

          // Save shopping first, then user state
          const sRes = await client.putShopping({
            schema_version: 1,
            expected_revision: shopData.revision,
            items: initialShopping,
          });
          setShoppingRevision(sRes.revision);
          shoppingRevisionRef.current = sRes.revision;

          const uRes = await client.putUser({
            schema_version: 1,
            expected_revision: userData.revision,
            profile: currentProfile,
            state: initState,
          });
          setUserRevision(uRes.revision);
          userRevisionRef.current = uRes.revision;

          setState(initState);
          setShoppingItems(initialShopping);
          setPhase('ready');
        }
      } catch (err: any) {
        if (!isMounted) return;
        if (err instanceof UnauthorizedError) {
          setPhase('unauthorized');
          setErrorMessage('Ошибка авторизации. Недействительная подпись Telegram.');
        } else {
          setPhase('error');
          setErrorMessage(err.message || 'Ошибка загрузки данных с сервера.');
        }
      }
    };

    let initData = '';
    let demoUserId: number | null = null;
    if (typeof window !== 'undefined') {
      const launch = resolveTelegramLaunchAuth(
        window.Telegram?.WebApp?.initData,
        window.location.search,
        window.location.hash
      );
      initData = launch.initData;
      demoUserId = launch.demoUserId;
    }

    if (initData || demoUserId !== null) {
      authDispatchedRef.current = true;
      void startBootstrap(initData, demoUserId);
    } else {
      setPhase('unauthorized');
      setErrorMessage('Ожидание авторизации Telegram. Откройте приложение через кнопку в боте «КетоБаланс».');
    }

    // Subscribe to late Telegram SDK appearance (>5s fallback timeout)
    const unsubscribeLateSDK = onLateTelegramSDK((lateTg) => {
      if (authDispatchedRef.current) return;
      if (typeof window !== 'undefined') {
        const lateLaunch = resolveTelegramLaunchAuth(
          lateTg?.initData || window.Telegram?.WebApp?.initData,
          window.location.search,
          window.location.hash
        );
        if (lateLaunch.initData || lateLaunch.demoUserId !== null) {
          authDispatchedRef.current = true;
          void startBootstrap(lateLaunch.initData, lateLaunch.demoUserId);
        }
      }
    });

    return () => {
      isMounted = false;
      unsubscribeLateSDK();
    };
  }, [client]);

  // Handle settings submission
  const handleSubmitSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    if (!draftConfirmed18) {
      alert('Для использования рациона необходимо подтвердить возраст 18+.');
      return;
    }
    if (draftApproach === 'explore') {
      alert('Режим «Знакомство» носит ознакомительный характер. Для расчёта персонального меню выберите «Кето» или «Карнивор».');
      return;
    }
    if (!catalog) return;

    const newSettings: PilotPreferencesV1 = {
      confirmed18Plus: true,
      approach: draftApproach,
      restrictions: draftRestrictions,
      prepTimeMax: draftPrepTime,
      mealsPerDay: draftMealsPerDay,
      planDays: draftPlanDays,
      month: draftPlanDays >= 28 ? draftMonth : undefined,
      preferenceNote: 'simple_daily',
    };

    const newProfile: PilotProfileV1 = { settings: newSettings };
    const canonProfile = preferencesToUserProfile(newSettings);

    let activeCatalog = catalog;
    if (draftPlanDays >= 28 && draftMonth) {
      const catalogsList = typeof availableCatalogs !== 'undefined' && Array.isArray(availableCatalogs) ? availableCatalogs : [];
      const matchedMeta = catalogsList.find((c) => c.catalog_month === draftMonth);
      if (matchedMeta && matchedMeta.accessible === false) {
        setErrorMessage(
          `Подборка на ${draftMonth} пока находится на утверждении у автора и доступна только владельцу. Выберите утверждённый месяц или повторите попытку позже.`
        );
        return;
      }

      const targetCatalogId =
        matchedMeta?.catalog_id ||
        (draftMonth === '2026-12' ? 'released-catalog-202612-v1' : 'released-catalog-202611-v1');

      if (catalog.catalog_id !== targetCatalogId) {
        try {
          const fetchedCatalog = await client.getCatalog(targetCatalogId);
          if (fetchedCatalog && fetchedCatalog.recipes && fetchedCatalog.recipes.length > 0) {
            activeCatalog = fetchedCatalog;
          } else {
            throw new Error(`Подборка ${targetCatalogId} не содержит рецептов`);
          }
        } catch (catErr: any) {
          setErrorMessage(
            `Не удалось загрузить подборку на ${draftMonth}. Пожалуйста, повторите попытку или выберите другой месяц.`
          );
          return;
        }
      }
    }

    const activeRecipesMap: Record<string, any> = { ...(recipesById || {}) };
    for (const r of activeCatalog.recipes) {
      if (typeof toRecipeViewModel === 'function') {
        activeRecipesMap[r.id] = toRecipeViewModel(r);
      } else {
        activeRecipesMap[r.id] = {
          id: r.id,
          title: r.title || r.id,
          portionsVariants: {
            1: {
              portions: 1,
              yieldNote: '',
              nutritionStatus: '[УТОЧНИТЬ]',
              ingredients: (r.ing || []).map(([name, amount]: [string, string]) => ({
                name,
                amountLabel: amount,
                department: 'Масла и бакалея',
              })),
            },
          },
        };
      }
    }

    const controller = createMenuController(activeCatalog.recipes, activeCatalog.released_ids, {
      isPreview: activeCatalog.test_only,
      catalogId: activeCatalog.catalog_id,
    });

    let genMenu;
    let initialShopping;
    try {
      genMenu = controller.createUserMenu({
        numDays: draftPlanDays,
        month: draftPlanDays >= 28 ? draftMonth : undefined,
        meals: draftMealsPerDay,
        profile: canonProfile,
        mode: approachToMode(draftApproach),
        catalogId: activeCatalog.catalog_id,
      });

      initialShopping = rebuildShoppingFromMenu(genMenu, activeRecipesMap, [], 1);
    } catch (genErr: any) {
      setErrorMessage(
        genErr.message ||
          'Не удалось составить меню или список покупок из доступных рецептов. Ваши настройки не применены. Попробуйте выбрать другой режим или уменьшить количество приёмов пищи.'
      );
      return;
    }

    const nextSelectedDate = resolveSelectedDate(genMenu, stateRef.current?.selected_date);
    const initState: PilotStateV1 = {
      schema_version: 1,
      menu: genMenu,
      selected_date: nextSelectedDate,
      checked_ingredients: {},
      checked_steps: {},
      shopping_batches: 1,
      shopping_stale: false,
    };

    setCatalog(activeCatalog);
    setProfile(newProfile);
    profileRef.current = newProfile;
    setState(initState);
    stateRef.current = initState;
    setShoppingItems(initialShopping);
    shoppingItemsRef.current = initialShopping;
    setPhase('loading');

    saveQueue.enqueue(async () => {
      setSyncStatus('saving');
      try {
        // 1. Put shopping first
        const sRes = await client.putShopping({
          schema_version: 1,
          expected_revision: shoppingRevisionRef.current,
          items: initialShopping,
        });
        shoppingRevisionRef.current = sRes.revision;
        setShoppingRevision(sRes.revision);

        // 2. Put user second
        const uRes = await client.putUser({
          schema_version: 1,
          expected_revision: userRevisionRef.current,
          profile: newProfile,
          state: initState,
        });
        userRevisionRef.current = uRes.revision;
        setUserRevision(uRes.revision);

        if (userId) {
          writeUserCache(userId, 'state', initState);
        }
        stickyErrorRef.current = null;
        setSyncStatus('saved');
        setPhase('ready');
      } catch (err: any) {
        if (err instanceof ConflictError) {
          stickyErrorRef.current = 'conflict';
          setSyncStatus('conflict');
          setPhase('conflict');
          setErrorMessage('Конфликт изменений. Данные были обновлены в другой сессии.');
        } else {
          stickyErrorRef.current = 'error';
          setSyncStatus('error');
          setPhase('error');
          setErrorMessage(err.message || 'Ошибка сохранения настроек на сервере.');
        }
        throw err;
      }
    }).catch(() => {});
  };

  // Safe user state save enqueuer
  const enqueueUserStateSave = useCallback(
    (nextState: PilotStateV1) => {
      setState(nextState);
      stateRef.current = nextState;
      if (userId) writeUserCache(userId, 'state', nextState);

      saveQueue.enqueue(async () => {
        if (stickyErrorRef.current === 'conflict') {
          throw new ConflictError('Предыдущее сохранение завершилось конфликтом версий.');
        }
        if (stickyErrorRef.current === 'error') {
          throw new Error('Предыдущее сохранение завершилось ошибкой.');
        }
        setSyncStatus('saving');
        try {
          const res = await client.putUser({
            schema_version: 1,
            expected_revision: userRevisionRef.current,
            profile: profileRef.current,
            state: nextState,
          });
          userRevisionRef.current = res.revision;
          setUserRevision(res.revision);
          if (!stickyErrorRef.current) {
            setSyncStatus('saved');
          } else {
            setSyncStatus(stickyErrorRef.current);
          }
        } catch (err) {
          if (err instanceof ConflictError) {
            stickyErrorRef.current = 'conflict';
            setSyncStatus('conflict');
          } else {
            stickyErrorRef.current = stickyErrorRef.current || 'error';
            setSyncStatus(stickyErrorRef.current);
          }
          throw err;
        }
      }).catch(() => {});
    },
    [client, saveQueue, userId]
  );

  // Safe shopping state save enqueuer
  const enqueueShoppingStateSave = useCallback(
    (nextItems: PilotShoppingItemV1[]) => {
      setShoppingItems(nextItems);
      shoppingItemsRef.current = nextItems;

      saveQueue.enqueue(async () => {
        if (stickyErrorRef.current === 'conflict') {
          throw new ConflictError('Предыдущее сохранение завершилось конфликтом версий.');
        }
        if (stickyErrorRef.current === 'error') {
          throw new Error('Предыдущее сохранение завершилось ошибкой.');
        }
        setSyncStatus('saving');
        try {
          const res = await client.putShopping({
            schema_version: 1,
            expected_revision: shoppingRevisionRef.current,
            items: nextItems,
          });
          shoppingRevisionRef.current = res.revision;
          setShoppingRevision(res.revision);
          setShoppingItems(() => {
            const active = shoppingItemsRef.current;
            const activeIds = new Set(active.map((x) => x.id));
            // active has the most recent user intent and interactions (checkmarks, custom items, etc.)
            const merged = [...active];
            for (const item of nextItems) {
              if (!activeIds.has(item.id)) {
                merged.push(item);
              }
            }
            shoppingItemsRef.current = merged;
            return merged;
          });
          if (!stickyErrorRef.current) {
            setSyncStatus('saved');
          } else {
            setSyncStatus(stickyErrorRef.current);
          }
        } catch (err) {
          if (err instanceof ConflictError) {
            stickyErrorRef.current = 'conflict';
            setSyncStatus('conflict');
          } else {
            stickyErrorRef.current = stickyErrorRef.current || 'error';
            setSyncStatus(stickyErrorRef.current);
          }
          throw err;
        }
      }).catch(() => {});
    },
    [client, saveQueue]
  );

  // Callbacks passed to FoodFirstApp
  const handleSelectDate = useCallback(
    (date: string) => {
      const currentState = stateRef.current;
      if (!currentState) return;
      const nextState: PilotStateV1 = { ...currentState, selected_date: date };
      enqueueUserStateSave(nextState);
    },
    [enqueueUserStateSave]
  );

  const handleReplaceRecipe = useCallback(
    async (date: string, slotKey: string, nextRecipeId: string) => {
      const currentState = stateRef.current;
      if (!currentState || !currentState.menu || !catalog || !profile?.settings) return;

      const currentDay = currentState.menu.days.find((d) => d.date === date);
      if (!currentDay) return;

      const currentRecipeId = currentDay.slots[slotKey];
      const canonProfile = preferencesToUserProfile(profile.settings);
      let mode: 'keto' | 'carnivore';
      try {
        mode = approachToMode(profile.settings.approach);
      } catch {
        return;
      }

      const controller = createMenuController(catalog.recipes, catalog.released_ids, {
        isPreview: catalog.test_only,
      });

      const dayIds = Object.entries(currentDay.slots)
        .filter(([k]) => k !== slotKey)
        .map(([, id]) => id);

      try {
        const candidates = controller.createUserReplacementCandidates({
          currentId: currentRecipeId || '',
          dayIds,
          profile: canonProfile,
          mode,
        });

        if (!candidates.some((r) => r.id === nextRecipeId)) {
          return; // Rejected: not an admitted/eligible replacement candidate
        }
      } catch {
        return;
      }

      const nextDays = currentState.menu.days.map((day) => {
        if (day.date === date) {
          return {
            ...day,
            slots: {
              ...day.slots,
              [slotKey]: nextRecipeId,
            },
          };
        }
        return day;
      });

      const nextMenu = { ...currentState.menu, days: nextDays };

      const reconcileRangeCheckmarks = (
        prevMenu?: { days?: Array<{ date?: string; slots: Record<string, string> }> },
        nextM?: { days?: Array<{ date?: string; slots: Record<string, string> }> },
        recList?: Array<{ id: string; serv?: number; ing?: Array<[string, string]> }>,
        numBatches: number = 1,
        prevCheckmarks: Record<string, boolean> = {}
      ): Record<string, boolean> => {
        const nextRangeChecked: Record<string, boolean> = { ...prevCheckmarks };
        if (!prevMenu || !nextM || !recList || !Array.isArray(recList)) return nextRangeChecked;

        const recipesMap = new Map<string, { serv?: number; ing?: Array<[string, string]> }>();
        for (const r of recList) {
          if (r && r.id) recipesMap.set(r.id, r);
        }

        const slugify = (text: string): string => {
          return text
            .toLowerCase()
            .replace(/[^a-zа-я0-9]+/gi, '-')
            .replace(/^-+|-+$/g, '');
        };

        const normalizeUnit = (rawUnit: string) => {
          const u = rawUnit.toLowerCase().replace(/\.$/, '').trim();
          if (u === 'г' || u === 'гр') return { baseUnit: 'г', unitType: 'weight', scale: 1 };
          if (u === 'кг') return { baseUnit: 'г', unitType: 'weight', scale: 1000 };
          if (u === 'мл') return { baseUnit: 'мл', unitType: 'volume', scale: 1 };
          if (u === 'л') return { baseUnit: 'мл', unitType: 'volume', scale: 1000 };
          if (u === 'шт' || u === 'штук' || u === 'штуки') return { baseUnit: 'шт.', unitType: 'count', scale: 1 };
          if (u.includes('ст') && u.includes('л')) return { baseUnit: 'ст. л.', unitType: 'tbsp', scale: 1 };
          if (u.startsWith('банк')) return { baseUnit: 'банка', unitType: 'can', scale: 1 };
          if (u.startsWith('стейк')) return { baseUnit: 'стейка', unitType: 'steak', scale: 1 };
          if (u.startsWith('нож')) return { baseUnit: 'ножки', unitType: 'leg', scale: 1 };
          return { baseUnit: u || 'ед', unitType: u ? 'custom' : 'text', scale: 1 };
        };

        const parseAmountHelper = (raw: string) => {
          const s = (raw || '').trim();
          const frac = s.match(/^(\d+)\/(\d+)\s*(.*)$/);
          if (frac) {
            const val = parseInt(frac[1], 10) / parseInt(frac[2], 10);
            const u = normalizeUnit(frac[3]);
            return { value: val * u.scale, baseUnit: u.baseUnit, unitType: u.unitType, isText: false };
          }
          const dec = s.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
          if (dec) {
            const val = parseFloat(dec[1].replace(',', '.'));
            const u = normalizeUnit(dec[2]);
            return { value: val * u.scale, baseUnit: u.baseUnit, unitType: u.unitType, isText: false };
          }
          return { value: 0, baseUnit: s, unitType: 'text', isText: true };
        };

        const getAggregatedId = (normName: string, unitType: string, baseUnit: string): string => {
          const slug = slugify(normName);
          return `shop-agg-${slug}${unitType !== 'text' ? `-${unitType}-${slugify(baseUnit)}` : ''}`;
        };

        const getRangeDays = (
          menuDays: Array<{ date?: string; slots: Record<string, string> }>,
          rangeKey: string
        ): Array<{ date?: string; slots: Record<string, string> }> => {
          if (!menuDays || !Array.isArray(menuDays)) return [];
          if (rangeKey === 'all') return menuDays;
          if (rangeKey.startsWith('week-')) {
            const weekIdx = parseInt(rangeKey.replace('week-', ''), 10);
            const startIdx = weekIdx * 7;
            const endIdx = Math.min((weekIdx + 1) * 7, menuDays.length);
            return menuDays.slice(startIdx, endIdx);
          }
          if (rangeKey.startsWith('custom:')) {
            const [s, e] = rangeKey.replace('custom:', '').split('_');
            return menuDays.filter((d) => Boolean(d.date && d.date >= s && d.date <= e));
          }
          return menuDays;
        };

        const computeRangeQuantities = (
          days: Array<{ date?: string; slots: Record<string, string> }>
        ) => {
          const quantities = new Map<string, { value: number; isText: boolean; unitType: string }>();
          for (const day of days) {
            if (!day || !day.slots) continue;
            for (const recipeId of Object.values(day.slots)) {
              const recipe = recipesMap.get(recipeId);
              if (!recipe || !Array.isArray(recipe.ing)) continue;
              const serv = typeof recipe.serv === 'number' && recipe.serv > 0 ? recipe.serv : 1;
              const portionFactor = numBatches / serv;
              for (const [name, amount] of recipe.ing) {
                if (!name || !amount) continue;
                const parsed = parseAmountHelper(amount);
                const id = getAggregatedId(name.trim(), parsed.unitType, parsed.baseUnit);
                const val = parsed.value * portionFactor;
                const existing = quantities.get(id);
                if (existing) {
                  existing.value += val;
                } else {
                  quantities.set(id, { value: val, isText: parsed.isText, unitType: parsed.unitType });
                }
              }
            }
          }
          return quantities;
        };

        for (const [key, isChecked] of Object.entries(prevCheckmarks)) {
          if (!isChecked) {
            nextRangeChecked[key] = false;
            continue;
          }
          const lastColon = key.lastIndexOf(':');
          if (lastColon === -1) continue;
          const rangeKey = key.slice(0, lastColon);
          const itemId = key.slice(lastColon + 1);

          if (itemId.startsWith('shop-custom-')) {
            nextRangeChecked[key] = true;
            continue;
          }

          const prevDays = getRangeDays(prevMenu.days || [], rangeKey);
          const nextDays = getRangeDays(nextM.days || [], rangeKey);

          const prevQuantities = computeRangeQuantities(prevDays);
          const nextQuantities = computeRangeQuantities(nextDays);

          const prevItem = prevQuantities.get(itemId);
          const nextItem = nextQuantities.get(itemId);

          const prevVal = prevItem ? prevItem.value : 0;
          const nextVal = nextItem ? nextItem.value : 0;

          const isIncreased = nextVal - prevVal > 1e-6;

          if (isIncreased) {
            nextRangeChecked[key] = false;
          } else {
            nextRangeChecked[key] = isChecked;
          }
        }

        return nextRangeChecked;
      };

      const nextRangeChecked = reconcileRangeCheckmarks(
        currentState.menu,
        nextMenu,
        catalog.recipes,
        currentState.shopping_batches || 1,
        currentState.shopping_range_checked || {}
      );

      const nextState: PilotStateV1 = {
        ...currentState,
        menu: nextMenu,
        shopping_stale: true,
        shopping_range_checked: nextRangeChecked,
      };

      enqueueUserStateSave(nextState);
    },
    [catalog, profile, enqueueUserStateSave]
  );

  const handleRebuildMenu = useCallback(async () => {
    const currentState = stateRef.current;
    if (!profile?.settings || !catalog || !currentState) return;

    try {
      const daysCount = (profile.settings.planDays && [1, 3, 7, 28, 29, 30, 31].includes(profile.settings.planDays as any))
        ? profile.settings.planDays
        : (currentState.menu?.days?.length && [1, 3, 7, 28, 29, 30, 31].includes(currentState.menu.days.length as any)
          ? currentState.menu.days.length
          : 3) as any;
      const targetMonth = currentState.menu?.month || profile.settings.month;
      const isCalendarMonth = daysCount >= 28 || Boolean(targetMonth && (profile.settings.planDays ?? 0) >= 28);

      let activeCatalog = catalog;
      if (isCalendarMonth && targetMonth) {
        const catalogsList = typeof availableCatalogs !== 'undefined' && Array.isArray(availableCatalogs) ? availableCatalogs : [];
        const matchedMeta = catalogsList.find((c) => c.catalog_month === targetMonth);
        if (matchedMeta && matchedMeta.accessible === false) {
          setSyncStatus('error');
          return;
        }
        const targetCatalogId =
          matchedMeta?.catalog_id ||
          (targetMonth === '2026-12' ? 'released-catalog-202612-v1' : 'released-catalog-202611-v1');
        if (catalog.catalog_id !== targetCatalogId) {
          try {
            const fetchedCatalog = await client.getCatalog(targetCatalogId);
            if (fetchedCatalog && fetchedCatalog.recipes && fetchedCatalog.recipes.length > 0) {
              activeCatalog = fetchedCatalog;
              setCatalog(fetchedCatalog);
            } else {
              setSyncStatus('error');
              return;
            }
          } catch {
            setSyncStatus('error');
            return;
          }
        }
      }

      const canonProfile = preferencesToUserProfile(profile.settings);
      const mode = approachToMode(profile.settings.approach);
      const controller = createMenuController(activeCatalog.recipes, activeCatalog.released_ids, {
        isPreview: activeCatalog.test_only,
        catalogId: activeCatalog.catalog_id,
      });

      const newMenu = controller.createUserMenu({
        numDays: daysCount,
        month: isCalendarMonth ? targetMonth : undefined,
        meals: profile.settings.mealsPerDay,
        profile: canonProfile,
        mode,
        catalogId: activeCatalog.catalog_id,
      });

      const nextSelectedDate = resolveSelectedDate(newMenu, currentState.selected_date);

      const reconcileRangeCheckmarks = (
        prevMenu?: { days?: Array<{ date?: string; slots: Record<string, string> }> },
        nextM?: { days?: Array<{ date?: string; slots: Record<string, string> }> },
        recList?: Array<{ id: string; serv?: number; ing?: Array<[string, string]> }>,
        numBatches: number = 1,
        prevCheckmarks: Record<string, boolean> = {}
      ): Record<string, boolean> => {
        const nextRangeChecked: Record<string, boolean> = { ...prevCheckmarks };
        if (!prevMenu || !nextM || !recList || !Array.isArray(recList)) return nextRangeChecked;

        const recipesMap = new Map<string, { serv?: number; ing?: Array<[string, string]> }>();
        for (const r of recList) {
          if (r && r.id) recipesMap.set(r.id, r);
        }

        const slugify = (text: string): string => {
          return text
            .toLowerCase()
            .replace(/[^a-zа-я0-9]+/gi, '-')
            .replace(/^-+|-+$/g, '');
        };

        const normalizeUnit = (rawUnit: string) => {
          const u = rawUnit.toLowerCase().replace(/\.$/, '').trim();
          if (u === 'г' || u === 'гр') return { baseUnit: 'г', unitType: 'weight', scale: 1 };
          if (u === 'кг') return { baseUnit: 'г', unitType: 'weight', scale: 1000 };
          if (u === 'мл') return { baseUnit: 'мл', unitType: 'volume', scale: 1 };
          if (u === 'л') return { baseUnit: 'мл', unitType: 'volume', scale: 1000 };
          if (u === 'шт' || u === 'штук' || u === 'штуки') return { baseUnit: 'шт.', unitType: 'count', scale: 1 };
          if (u.includes('ст') && u.includes('л')) return { baseUnit: 'ст. л.', unitType: 'tbsp', scale: 1 };
          if (u.startsWith('банк')) return { baseUnit: 'банка', unitType: 'can', scale: 1 };
          if (u.startsWith('стейк')) return { baseUnit: 'стейка', unitType: 'steak', scale: 1 };
          if (u.startsWith('нож')) return { baseUnit: 'ножки', unitType: 'leg', scale: 1 };
          return { baseUnit: u || 'ед', unitType: u ? 'custom' : 'text', scale: 1 };
        };

        const parseAmountHelper = (raw: string) => {
          const s = (raw || '').trim();
          const frac = s.match(/^(\d+)\/(\d+)\s*(.*)$/);
          if (frac) {
            const val = parseInt(frac[1], 10) / parseInt(frac[2], 10);
            const u = normalizeUnit(frac[3]);
            return { value: val * u.scale, baseUnit: u.baseUnit, unitType: u.unitType, isText: false };
          }
          const dec = s.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
          if (dec) {
            const val = parseFloat(dec[1].replace(',', '.'));
            const u = normalizeUnit(dec[2]);
            return { value: val * u.scale, baseUnit: u.baseUnit, unitType: u.unitType, isText: false };
          }
          return { value: 0, baseUnit: s, unitType: 'text', isText: true };
        };

        const getAggregatedId = (normName: string, unitType: string, baseUnit: string): string => {
          const slug = slugify(normName);
          return `shop-agg-${slug}${unitType !== 'text' ? `-${unitType}-${slugify(baseUnit)}` : ''}`;
        };

        const getRangeDays = (
          menuDays: Array<{ date?: string; slots: Record<string, string> }>,
          rangeKey: string
        ): Array<{ date?: string; slots: Record<string, string> }> => {
          if (!menuDays || !Array.isArray(menuDays)) return [];
          if (rangeKey === 'all') return menuDays;
          if (rangeKey.startsWith('week-')) {
            const weekIdx = parseInt(rangeKey.replace('week-', ''), 10);
            const startIdx = weekIdx * 7;
            const endIdx = Math.min((weekIdx + 1) * 7, menuDays.length);
            return menuDays.slice(startIdx, endIdx);
          }
          if (rangeKey.startsWith('custom:')) {
            const [s, e] = rangeKey.replace('custom:', '').split('_');
            return menuDays.filter((d) => Boolean(d.date && d.date >= s && d.date <= e));
          }
          return menuDays;
        };

        const computeRangeQuantities = (
          days: Array<{ date?: string; slots: Record<string, string> }>
        ) => {
          const quantities = new Map<string, { value: number; isText: boolean; unitType: string }>();
          for (const day of days) {
            if (!day || !day.slots) continue;
            for (const recipeId of Object.values(day.slots)) {
              const recipe = recipesMap.get(recipeId);
              if (!recipe || !Array.isArray(recipe.ing)) continue;
              const serv = typeof recipe.serv === 'number' && recipe.serv > 0 ? recipe.serv : 1;
              const portionFactor = numBatches / serv;
              for (const [name, amount] of recipe.ing) {
                if (!name || !amount) continue;
                const parsed = parseAmountHelper(amount);
                const id = getAggregatedId(name.trim(), parsed.unitType, parsed.baseUnit);
                const val = parsed.value * portionFactor;
                const existing = quantities.get(id);
                if (existing) {
                  existing.value += val;
                } else {
                  quantities.set(id, { value: val, isText: parsed.isText, unitType: parsed.unitType });
                }
              }
            }
          }
          return quantities;
        };

        for (const [key, isChecked] of Object.entries(prevCheckmarks)) {
          if (!isChecked) {
            nextRangeChecked[key] = false;
            continue;
          }
          const lastColon = key.lastIndexOf(':');
          if (lastColon === -1) continue;
          const rangeKey = key.slice(0, lastColon);
          const itemId = key.slice(lastColon + 1);

          if (itemId.startsWith('shop-custom-')) {
            nextRangeChecked[key] = true;
            continue;
          }

          const prevDays = getRangeDays(prevMenu.days || [], rangeKey);
          const nextDays = getRangeDays(nextM.days || [], rangeKey);

          const prevQuantities = computeRangeQuantities(prevDays);
          const nextQuantities = computeRangeQuantities(nextDays);

          const prevItem = prevQuantities.get(itemId);
          const nextItem = nextQuantities.get(itemId);

          const prevVal = prevItem ? prevItem.value : 0;
          const nextVal = nextItem ? nextItem.value : 0;

          const isIncreased = nextVal - prevVal > 1e-6;

          if (isIncreased) {
            nextRangeChecked[key] = false;
          } else {
            nextRangeChecked[key] = isChecked;
          }
        }

        return nextRangeChecked;
      };

      const nextRangeChecked = reconcileRangeCheckmarks(
        currentState.menu,
        newMenu,
        activeCatalog.recipes,
        currentState.shopping_batches || 1,
        currentState.shopping_range_checked || {}
      );

      const nextState: PilotStateV1 = {
        ...currentState,
        menu: newMenu,
        selected_date: nextSelectedDate,
        shopping_stale: true,
        shopping_range_checked: nextRangeChecked,
      };

      enqueueUserStateSave(nextState);
    } catch {
      setSyncStatus('error');
    }
  }, [profile, catalog, enqueueUserStateSave, availableCatalogs, client]);

  const handleToggleIngredient = useCallback(
    (key: string) => {
      const currentState = stateRef.current;
      if (!currentState) return;
      const nextChecked = {
        ...currentState.checked_ingredients,
        [key]: !currentState.checked_ingredients[key],
      };
      const nextState: PilotStateV1 = {
        ...currentState,
        checked_ingredients: nextChecked,
      };
      enqueueUserStateSave(nextState);
    },
    [enqueueUserStateSave]
  );

  const handleToggleStep = useCallback(
    (key: string) => {
      const currentState = stateRef.current;
      if (!currentState) return;
      const nextChecked = {
        ...currentState.checked_steps,
        [key]: !currentState.checked_steps[key],
      };
      const nextState: PilotStateV1 = {
        ...currentState,
        checked_steps: nextChecked,
      };
      enqueueUserStateSave(nextState);
    },
    [enqueueUserStateSave]
  );

  const handleChangeBatches = useCallback(
    (batches: 1 | 2 | 4) => {
      const currentState = stateRef.current;
      if (!currentState || !currentState.menu) return;
      const currentItems = shoppingItemsRef.current;
      const oldBatches = currentState.shopping_batches;
      const isIncrease = batches > oldBatches;
      let nextShopping = rebuildShoppingFromMenu(
        currentState.menu,
        recipesById,
        currentItems,
        batches
      );
      if (isIncrease) {
        nextShopping = nextShopping.map((it) => ({ ...it, checkedInStore: false }));
      }
      const nextRangeChecked = isIncrease ? {} : (currentState.shopping_range_checked || {});
      const nextState: PilotStateV1 = {
        ...currentState,
        shopping_batches: batches,
        shopping_range_checked: nextRangeChecked,
      };

      setState(nextState);
      stateRef.current = nextState;
      setShoppingItems(nextShopping);
      shoppingItemsRef.current = nextShopping;
      if (userId) writeUserCache(userId, 'state', nextState);

      saveQueue.enqueue(async () => {
        if (stickyErrorRef.current === 'conflict') {
          throw new ConflictError('Предыдущее сохранение завершилось конфликтом версий.');
        }
        if (stickyErrorRef.current === 'error') {
          throw new Error('Предыдущее сохранение завершилось ошибкой.');
        }
        setSyncStatus('saving');
        try {
          // 1. Put shopping first
          const sRes = await client.putShopping({
            schema_version: 1,
            expected_revision: shoppingRevisionRef.current,
            items: nextShopping,
          });
          shoppingRevisionRef.current = sRes.revision;
          setShoppingRevision(sRes.revision);

          // 2. Put user second
          const uRes = await client.putUser({
            schema_version: 1,
            expected_revision: userRevisionRef.current,
            profile: profileRef.current,
            state: nextState,
          });
          userRevisionRef.current = uRes.revision;
          setUserRevision(uRes.revision);

          if (!stickyErrorRef.current) {
            setSyncStatus('saved');
          } else {
            setSyncStatus(stickyErrorRef.current);
          }
        } catch (err) {
          if (err instanceof ConflictError) {
            stickyErrorRef.current = 'conflict';
            setSyncStatus('conflict');
          } else {
            stickyErrorRef.current = stickyErrorRef.current || 'error';
            setSyncStatus(stickyErrorRef.current);
          }
          throw err;
        }
      }).catch(() => {});
    },
    [recipesById, userId, saveQueue, client]
  );

  const handleRefreshShopping = useCallback(async () => {
    saveQueue.enqueue(async () => {
      if (stickyErrorRef.current === 'conflict') {
        throw new ConflictError('Предыдущее сохранение завершилось конфликтом версий.');
      }
      if (stickyErrorRef.current === 'error') {
        throw new Error('Предыдущее сохранение завершилось ошибкой.');
      }
      const currentState = stateRef.current;
      if (!currentState || !currentState.menu) return;
      const currentItems = shoppingItemsRef.current;
      const nextShopping = rebuildShoppingFromMenu(
        currentState.menu,
        recipesById,
        currentItems,
        currentState.shopping_batches
      );

      setSyncStatus('saving');
      try {
        // 1. Put shopping first
        const shopRes = await client.putShopping({
          schema_version: 1,
          expected_revision: shoppingRevisionRef.current,
          items: nextShopping,
        });
        shoppingRevisionRef.current = shopRes.revision;
        setShoppingRevision(shopRes.revision);

        const inFlightItems = shoppingItemsRef.current;
        const origMap = new Map(currentItems.map((x) => [x.id, x]));
        const mergedShopping = nextShopping.map((item) => {
          const inFlight = inFlightItems.find((x) => x.id === item.id);
          if (inFlight) {
            const orig = origMap.get(item.id);
            const checkChanged = !orig || (inFlight.checkedInStore !== orig.checkedInStore || inFlight.alreadyHave !== orig.alreadyHave);
            if (checkChanged) {
              return {
                ...item,
                checkedInStore: inFlight.checkedInStore,
                alreadyHave: inFlight.alreadyHave,
              };
            }
          }
          return item;
        });
        for (const it of inFlightItems) {
          if (it.id.startsWith('shop-custom-') && !mergedShopping.some((x) => x.id === it.id)) {
            mergedShopping.push(it);
          }
        }
        setShoppingItems(mergedShopping);
        shoppingItemsRef.current = mergedShopping;

        // 2. Put user second with shopping_stale: false and reconciled range checkmarks
        const prevRangeChecked = currentState.shopping_range_checked || {};
        const nextRangeChecked: Record<string, boolean> = { ...prevRangeChecked };

        const prevItemMap = new Map(currentItems.map((x) => [x.id, x]));
        const nextItemMap = new Map(nextShopping.map((x) => [x.id, x]));

        const parseVal = (lbl?: string) => {
          if (!lbl) return 0;
          const m = lbl.match(/^(\d+(?:[.,]\d+)?)/);
          return m ? parseFloat(m[1].replace(',', '.')) : 0;
        };

        for (const [key, isChecked] of Object.entries(prevRangeChecked)) {
          if (!isChecked) {
            nextRangeChecked[key] = false;
            continue;
          }
          const lastColon = key.lastIndexOf(':');
          if (lastColon === -1) continue;
          const rangeKey = key.slice(0, lastColon);
          const itemId = key.slice(lastColon + 1);

          if (itemId.startsWith('shop-custom-')) {
            nextRangeChecked[key] = true;
            continue;
          }

          const prevItem = prevItemMap.get(itemId);
          const nextItem = nextItemMap.get(itemId);

          if (!nextItem || !prevItem) {
            nextRangeChecked[key] = false;
            continue;
          }

          const prevVal = parseVal(prevItem.amountLabel);
          const nextVal = parseVal(nextItem.amountLabel);

          // Overall requirement in the menu
          if (rangeKey === 'all') {
            if (nextVal > prevVal) {
              nextRangeChecked[key] = false;
            } else {
              nextRangeChecked[key] = isChecked;
            }
            continue;
          }

          let rangeDays: Array<{ date?: string; slots: Record<string, string> }> = [];
          if (rangeKey.startsWith('week-')) {
            const weekIdx = parseInt(rangeKey.replace('week-', ''), 10);
            const startIdx = weekIdx * 7;
            const endIdx = Math.min((weekIdx + 1) * 7, currentState.menu.days.length);
            rangeDays = currentState.menu.days.slice(startIdx, endIdx);
          } else if (rangeKey.startsWith('custom:')) {
            const [start, end] = rangeKey.replace('custom:', '').split('_');
            rangeDays = currentState.menu.days.filter((d) => Boolean(d.date && d.date >= start && d.date <= end));
          } else {
            rangeDays = currentState.menu.days;
          }

          const prevTitles = new Set(prevItem?.linkedRecipeTitles || []);
          const rangeRecipeTitles = new Set(
            rangeDays
              .flatMap((d) => Object.values(d.slots))
              .map((id) => recipesById[id]?.title)
              .filter(Boolean)
          );

          const hasAddedRecipe = [...rangeRecipeTitles].some(
            (title) => !prevTitles.has(title) && nextItem?.linkedRecipeTitles?.includes(title)
          );

          if (hasAddedRecipe && nextVal > prevVal) {
            nextRangeChecked[key] = false;
          } else {
            nextRangeChecked[key] = isChecked;
          }
        }

        const nextState: PilotStateV1 = {
          ...currentState,
          shopping_stale: false,
          shopping_range_checked: nextRangeChecked,
        };
        const userRes = await client.putUser({
          schema_version: 1,
          expected_revision: userRevisionRef.current,
          profile: profileRef.current,
          state: nextState,
        });
        userRevisionRef.current = userRes.revision;
        setUserRevision(userRes.revision);
        const latestState = stateRef.current;
        if (latestState) {
          const isMenuUnchanged = latestState.menu === currentState.menu;
          const mergedState: PilotStateV1 = {
            ...latestState,
            shopping_stale: !isMenuUnchanged,
            shopping_range_checked: nextRangeChecked,
          };
          setState(mergedState);
          stateRef.current = mergedState;
          if (userId) writeUserCache(userId, 'state', mergedState);
        }

        if (!stickyErrorRef.current) {
          setSyncStatus('saved');
        } else {
          setSyncStatus(stickyErrorRef.current);
        }
      } catch (err: any) {
        const isConflict =
          (typeof ConflictError !== 'undefined' && ConflictError && err instanceof ConflictError) ||
          Boolean(err && (err.status === 409 || err.statusCode === 409 || err.name === 'ConflictError'));
        if (isConflict) {
          stickyErrorRef.current = 'conflict';
          setSyncStatus('conflict');
        } else {
          stickyErrorRef.current = stickyErrorRef.current || 'error';
          setSyncStatus(stickyErrorRef.current);
        }
        throw err;
      }
    }).catch(() => {});
  }, [recipesById, userId, saveQueue, client]);

  const handleToggleCheckedInStore = useCallback(
    (id: string) => {
      const currentItems = shoppingItemsRef.current;
      const nextItems = currentItems.map((item) =>
        item.id === id ? { ...item, checkedInStore: !item.checkedInStore } : item
      );
      enqueueShoppingStateSave(nextItems);
    },
    [enqueueShoppingStateSave]
  );

  const handleToggleAlreadyHave = useCallback(
    (id: string) => {
      const currentItems = shoppingItemsRef.current;
      const nextItems = currentItems.map((item) =>
        item.id === id ? { ...item, alreadyHave: !item.alreadyHave } : item
      );
      enqueueShoppingStateSave(nextItems);
    },
    [enqueueShoppingStateSave]
  );

  const handleAddCustomItem = useCallback(
    (item: PilotShoppingItemV1) => {
      const currentItems = shoppingItemsRef.current;
      const nextItems = [...currentItems, item];
      enqueueShoppingStateSave(nextItems);
    },
    [enqueueShoppingStateSave]
  );

  const handleSelectShoppingRange = useCallback(
    (range: ShoppingRange) => {
      const currentState = stateRef.current;
      if (!currentState) return;
      const nextState: PilotStateV1 = {
        ...currentState,
        shopping_range: range,
      };
      enqueueUserStateSave(nextState);
    },
    [enqueueUserStateSave]
  );

  const handleToggleRangeChecked = useCallback(
    (rangeKey: string, itemId: string) => {
      const currentState = stateRef.current;
      if (!currentState) return;
      const key = `${rangeKey}:${itemId}`;
      const prevChecked = currentState.shopping_range_checked || {};
      const nextChecked = {
        ...prevChecked,
        [key]: !prevChecked[key],
      };
      const nextState: PilotStateV1 = {
        ...currentState,
        shopping_range_checked: nextChecked,
      };
      enqueueUserStateSave(nextState);

      if (rangeKey === 'all') {
        const currentItems = shoppingItemsRef.current;
        const nextItems = currentItems.map((item) =>
          item.id === itemId ? { ...item, checkedInStore: !item.checkedInStore } : item
        );
        enqueueShoppingStateSave(nextItems);
      }
    },
    [enqueueUserStateSave, enqueueShoppingStateSave]
  );

  const handleOpenSettings = useCallback((targetApproach?: 'keto' | 'carnivore') => {
    if (targetApproach) {
      setDraftApproach(targetApproach);
    }
    if (profile?.settings) {
      setDraftConfirmed18(Boolean(profile.settings.confirmed18Plus));
      if (!targetApproach) {
        setDraftApproach(profile.settings.approach || 'keto');
      }
      setDraftRestrictions(profile.settings.restrictions || []);
      setDraftPrepTime(profile.settings.prepTimeMax ?? 0);
      setDraftMealsPerDay((profile.settings.mealsPerDay as any) || 3);
      setDraftPlanDays((profile.settings.planDays as any) || (state?.menu?.days?.length as any) || 30);
      if (profile.settings.month) {
        setDraftMonth(profile.settings.month);
      } else if (state?.menu?.month) {
        setDraftMonth(state.menu.month);
      }
      if (profile.settings.confirmed18Plus) {
        setGatePassed(true);
      }
    }
    setViewHomeBeforeGate(false);
    setPhase('needs_settings');
  }, [profile, state]);

  // Render by Phase
  if (phase === 'init' || phase === 'authenticating' || phase === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-[var(--kb-bg)] text-[var(--kb-text-1)]">
        <div className="max-w-md w-full p-8 bg-white rounded-2xl shadow-sm border border-[#E5DECF] text-center space-y-4">
          <div className="w-10 h-10 border-4 border-[#5F7161] border-t-transparent rounded-full animate-spin mx-auto" />
          <h2 className="text-xl font-bold">
            {phase === 'authenticating' ? 'Авторизация в Telegram...' : 'Загрузка меню и рациона...'}
          </h2>
          <p className="text-xs text-stone-500">
            Подключение к защищённому персональному профилю «Кето Баланс».
          </p>
        </div>
      </div>
    );
  }

  if (phase === 'unauthorized' || phase === 'error' || phase === 'conflict') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-[var(--kb-bg)] text-[var(--kb-text-1)]">
        <div className="max-w-md w-full p-8 bg-white rounded-2xl shadow-sm border border-[#E5DECF] space-y-5">
          <div className="text-center">

            <h2 className="text-xl font-bold mt-2">
              {phase === 'unauthorized'
                ? 'Требуется авторизация'
                : phase === 'conflict'
                ? 'Конфликт данных'
                : 'Ошибка загрузки'}
            </h2>
            <p className="text-sm text-stone-600 mt-2">{errorMessage}</p>
          </div>
          <div className="pt-2 flex flex-col gap-2">
            {phase === 'unauthorized' && <a className="ff-action" href="https://t.me/keto_balance_userbot">Открыть в Telegram</a>}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="ff-proof__help-btn"
            >
              Перезагрузить страницу
            </button>
            <div className="border-t border-stone-200 pt-3">
              <PrivateSupportPage />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'needs_settings') {
    if (showSupport) {
      return (
        <div className="min-h-screen py-8 px-4 bg-[var(--kb-bg)] text-[var(--kb-text-1)]">
          <div className="max-w-lg mx-auto bg-white rounded-2xl border border-[#E5DECF] p-6 sm:p-8 space-y-4 shadow-sm">
            <button
              type="button"
              onClick={() => setShowSupport(false)}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-stone-300 hover:bg-stone-50"
            >
              ← Вернуться назад
            </button>
            <PrivateSupportPage />
          </div>
        </div>
      );
    }

    if (!gatePassed) {
      const handleGateContinue = (selectedApproach: 'keto' | 'carnivore') => {
        setDraftApproach(selectedApproach);
        setDraftConfirmed18(true);
        setGatePassed(true);
        setErrorMessage('');

        if (sessionToken || userId) {
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
          };
          if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;
          if (userId) headers['X-User-Id'] = String(userId);

          fetch('/api/user/consents', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              consents: [
                { consent_type: 'personal_data', version: 'v1.0.0-release', granted: true, source: 'tma_start_gate' },
                { consent_type: 'age_18_plus', version: 'v1.0.0-release', granted: true, source: 'tma_start_gate' },
              ],
            }),
          }).catch((err) => console.warn('Consent recording failed:', err));
        }
      };

      if (viewHomeBeforeGate && catalog) {
        const emptyState: PilotStateV1 = {
          schema_version: 1,
          menu: null,
          selected_date: null,
          checked_ingredients: {},
          checked_steps: {},
          shopping_batches: 1,
          shopping_stale: false,
        };
        const emptyProfile: PilotProfileV1 = {
          settings: {
            confirmed18Plus: false,
            approach: draftApproach,
            restrictions: draftRestrictions,
            prepTimeMax: draftPrepTime,
            mealsPerDay: draftMealsPerDay,
            planDays: draftPlanDays,
            preferenceNote: '',
          },
        };
        return (
          <FoodFirstApp
            catalog={catalog}
            profile={emptyProfile}
            state={emptyState}
            shoppingItems={[]}
            syncStatus="idle"
            onToggleStep={() => {}}
            onToggleIngredient={() => {}}
            onChangeBatches={() => {}}
            onRefreshShopping={() => {}}
            onToggleCheckedInStore={() => {}}
            onToggleAlreadyHave={() => {}}
            onAddCustomItem={() => {}}
            onSelectDate={() => {}}
            onReplaceRecipe={async () => {}}
            onRebuildMenu={async () => {}}
            onOpenSettings={(appr) => {
              if (appr) setDraftApproach(appr);
              setViewHomeBeforeGate(false);
            }}
            subscription={subscription}
            onUpdateSubscription={setSubscription}
            sessionToken={sessionToken || undefined}
          />
        );
      }

      return (
        <StartGateScreen
          approach={draftApproach === 'carnivore' ? 'carnivore' : 'keto'}
          onSelectApproach={(a) => setDraftApproach(a)}
          onGateGranted={(payload) => handleGateContinue(payload.approach)}
          onContinue={handleGateContinue}
          onOpenSupport={() => setShowSupport(true)}
          onViewHome={() => setViewHomeBeforeGate(true)}
        />
      );
    }

    return (
      <div className="min-h-screen py-8 px-4 bg-[var(--kb-bg)] text-[var(--kb-text-1)]">
        <div className="max-w-lg mx-auto bg-white rounded-2xl border border-[#E5DECF] p-6 sm:p-8 space-y-6 shadow-sm">
          <div className="border-b border-stone-200 pb-4 flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <button
                  type="button"
                  data-testid="settings-back-to-home"
                  onClick={() => setViewHomeBeforeGate(true)}
                  className="text-xs text-[#5F7161] hover:underline font-semibold"
                >
                  ← На главную
                </button>
              </div>
              <span className="text-xs font-semibold uppercase tracking-wider text-[#5F7161]">
                Персональный рацион
              </span>
              <h1 className="text-2xl font-bold text-stone-900 mt-1">Настройки питания</h1>
              <p className="text-sm text-stone-600 mt-1">
                Укажи свои предпочтения, чтобы подобрать блюда и собрать покупки.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {subscription?.is_premium ? (
                <span
                  data-testid="header-premium-badge"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 shadow-sm"
                >
                  👑 Premium
                </span>
              ) : (
                <button
                  type="button"
                  data-testid="more-open-paywall-btn"
                  onClick={() => setShowPaywall(true)}
                  className="ff-proof__help-btn"
                >
                  Условия доступа
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowSupport(true)}
                className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-stone-300 hover:bg-stone-50"
              >
                Помощь
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmitSettings} className="space-y-6" data-testid="pilot-settings-form">
            {errorMessage && (
              <div
                className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs sm:text-sm font-medium"
                data-testid="settings-form-error"
                role="alert"
              >
                ⚠️ {errorMessage}
              </div>
            )}
            {/* 18+ confirmation */}
            <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-xl space-y-2">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  data-testid="settings-confirmed-18"
                  checked={draftConfirmed18}
                  onChange={(e) => setDraftConfirmed18(e.target.checked)}
                  className="mt-1 w-4 h-4 text-[#5F7161] rounded border-stone-300 focus:ring-[#5F7161]"
                />
                <span className="text-xs sm:text-sm font-medium text-amber-900 leading-tight">
                  Мне исполнилось 18 лет, у меня нет острых заболеваний и я понимаю, что рацион
                  носит информационный характер.
                </span>
              </label>
            </div>

            {/* Approach */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-600">
                Подход к питанию
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { id: 'keto', title: 'Кето', desc: 'Низкоуглеводный' },
                  { id: 'carnivore', title: 'Карнивор', desc: 'Мясной рацион' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    data-testid={`settings-approach-${item.id}`}
                    onClick={() => setDraftApproach(item.id as any)}
                    className={`p-3 text-left rounded-xl border transition-all ${
                      draftApproach === item.id
                        ? 'border-[#5F7161] bg-[#EDF1E6] text-[#1B211B] font-semibold'
                        : 'border-stone-200 bg-stone-50/50 text-stone-700 hover:bg-stone-50'
                    }`}
                  >
                    <div className="text-sm font-bold">{item.title}</div>
                    <div className="text-xs text-stone-500">{item.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Restrictions */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-600">
                Исключения и ограничения
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {RESTRICTIONS_LIST.map(({ token, label }) => {
                  const checked = draftRestrictions.includes(token);
                  return (
                    <label
                      key={token}
                      className={`p-3 rounded-xl border flex items-center gap-3 cursor-pointer transition-colors ${
                        checked
                          ? 'border-[#5F7161] bg-[#EDF1E6] text-[#1B211B]'
                          : 'border-stone-200 hover:bg-stone-50 text-stone-700'
                      }`}
                    >
                      <input
                        type="checkbox"
                        data-testid={`settings-restriction-${token}`}
                        checked={checked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setDraftRestrictions((prev) => [...prev, token]);
                          } else {
                            setDraftRestrictions((prev) => prev.filter((t) => t !== token));
                          }
                        }}
                        className="w-4 h-4 text-[#5F7161] rounded border-stone-300 focus:ring-[#5F7161]"
                      />
                      <span className="text-xs font-medium">{label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Prep Time Max */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-600">
                Максимум времени у плиты: {draftPrepTime > 0 ? `${draftPrepTime} мин` : 'Без ограничений'}
              </label>
              <div className="flex flex-wrap gap-2">
                {(() => {
                  const standardTimes = [15, 30, 45, 60, 0];
                  const times = (draftPrepTime > 0 && !standardTimes.includes(draftPrepTime))
                    ? [...standardTimes.filter((x) => x !== 0), draftPrepTime, 0].sort((a, b) => (a === 0 ? 1 : b === 0 ? -1 : a - b))
                    : standardTimes;
                  return times.map((t) => (
                    <button
                      key={t}
                      type="button"
                      data-testid={`settings-time-${t}`}
                      onClick={() => setDraftPrepTime(t)}
                      className={`px-3.5 py-2 text-xs font-semibold rounded-xl border transition-all ${
                        draftPrepTime === t
                          ? 'border-[#5F7161] bg-[#EDF1E6] text-[#1B211B]'
                          : 'border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100'
                      }`}
                    >
                      {t > 0 ? `${t} мин` : 'Без лимита'}
                    </button>
                  ));
                })()}
              </div>
            </div>

            {/* Meals Per Day */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-600">
                Приёмов пищи в день
              </label>
              <div className="flex gap-2">
                {([2, 3, 4] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    data-testid={`settings-meals-${m}`}
                    onClick={() => setDraftMealsPerDay(m)}
                    className={`flex-1 py-2 text-xs font-semibold rounded-xl border transition-all ${
                      draftMealsPerDay === m
                        ? 'border-[#5F7161] bg-[#EDF1E6] text-[#1B211B]'
                        : 'border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100'
                    }`}
                  >
                    {m} приёма
                  </button>
                ))}
              </div>
            </div>

            {/* Plan Duration */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-600">
                Срок меню
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {([1, 3, 7] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    data-testid={`settings-days-${d}`}
                    onClick={() => {
                      setDraftPlanDays(d);
                      setDraftMonth('');
                    }}
                    className={`py-2 text-xs font-semibold rounded-xl border transition-all ${
                      draftPlanDays === d
                        ? 'border-[#5F7161] bg-[#EDF1E6] text-[#1B211B]'
                        : 'border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100'
                    }`}
                  >
                    {d === 1 ? '1 день' : d === 3 ? '3 дня' : '7 дней'}
                  </button>
                ))}
                {(() => {
                  const now = new Date();
                  const currYear = now.getFullYear();
                  const currMonthIdx = now.getMonth();
                  const currMonthDays = new Date(currYear, currMonthIdx + 1, 0).getDate();
                  const currMonthKey = `${currYear}-${String(currMonthIdx + 1).padStart(2, '0')}`;
                  const currMonthName = now.toLocaleString('ru-RU', { month: 'long' });
                  const currLabel = currMonthName.charAt(0).toUpperCase() + currMonthName.slice(1);

                  const isCurrSelected = (draftPlanDays >= 28 && draftPlanDays <= 31) && (draftMonth === currMonthKey || !draftMonth);

                  return (
                    <button
                      type="button"
                      data-testid="settings-days-month"
                      onClick={() => {
                        setDraftPlanDays(currMonthDays as any);
                        setDraftMonth(currMonthKey);
                      }}
                      className={`py-2 text-xs font-semibold rounded-xl border transition-all ${
                        isCurrSelected
                          ? 'border-[#5F7161] bg-[#EDF1E6] text-[#1B211B]'
                          : 'border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100'
                      }`}
                    >
                      {currLabel} ({currMonthDays} дн.)
                    </button>
                  );
                })()}
                {(() => {
                  const now = new Date();
                  const nextDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
                  const nextYear = nextDate.getFullYear();
                  const nextMonthIdx = nextDate.getMonth();
                  const nextMonthDays = new Date(nextYear, nextMonthIdx + 1, 0).getDate();
                  const nextMonthKey = `${nextYear}-${String(nextMonthIdx + 1).padStart(2, '0')}`;
                  const nextMonthName = nextDate.toLocaleString('ru-RU', { month: 'long' });
                  const nextLabel = nextMonthName.charAt(0).toUpperCase() + nextMonthName.slice(1);

                  const isNextSelected = (draftPlanDays >= 28 && draftPlanDays <= 31) && draftMonth === nextMonthKey;

                  return (
                    <button
                      type="button"
                      data-testid="settings-days-next-month"
                      onClick={() => {
                        setDraftPlanDays(nextMonthDays as any);
                        setDraftMonth(nextMonthKey);
                      }}
                      className={`py-2 text-xs font-semibold rounded-xl border transition-all ${
                        isNextSelected
                          ? 'border-[#5F7161] bg-[#EDF1E6] text-[#1B211B]'
                          : 'border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100'
                      }`}
                    >
                      {nextLabel} ({nextMonthDays} дн.)
                    </button>
                  );
                })()}
              </div>
            </div>

            {/* Carnivore conflict pre-submit check */}
            {(() => {
              if (draftApproach !== 'carnivore') return null;
              const canon = preferencesToUserProfile({
                confirmed18Plus: draftConfirmed18,
                approach: 'carnivore',
                restrictions: draftRestrictions,
                prepTimeMax: draftPrepTime,
                mealsPerDay: draftMealsPerDay,
                planDays: draftPlanDays,
                preferenceNote: '',
              });
              const pool = catalog.recipes.filter(
                (r) =>
                  (catalog.released_ids.length > 0 ? catalog.released_ids.includes(r.id) : true) &&
                  r.mode === 'carnivore' &&
                  isRecipeAllowed(r, canon)
              );
              if (pool.length < draftMealsPerDay) {
                return (
                  <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-900 space-y-1" data-testid="carnivore-conflict-warning">
                    <p className="font-bold">⚠️ Недостаточно карнивор-блюд для выбранных ограничений</p>
                    <p>
                      {pool.length === 0
                        ? `Карнивор-рецепты для этой комбинации ограничений ещё готовятся. Доступно 0 блюд из ${draftMealsPerDay} требуемых на день.`
                        : `С выбранными ограничениями доступно только ${pool.length} блюд, а требуется минимум ${draftMealsPerDay} на день.`}
                    </p>
                    <p className="text-[11px] text-amber-800">
                      Ваши настройки сохранятся. Для составления меню вы можете выбрать режим «Кето», уменьшить количество приёмов пищи на день или дождаться выхода новых карнивор-рецептов. Пожалуйста, не отменяйте медицинские исключения аллергенов.
                    </p>
                  </div>
                );
              }
              return null;
            })()}

            <button
              type="submit"
              data-testid="submit-settings-btn"
              disabled={!draftConfirmed18}
              className={`w-full py-3.5 px-6 rounded-xl font-bold text-sm uppercase tracking-wider transition-all shadow-sm ${
                draftConfirmed18
                  ? 'bg-[#5F7161] text-white hover:bg-[#4E5E50] cursor-pointer'
                  : 'bg-stone-300 text-stone-500 cursor-not-allowed'
              }`}
            >
              Составить меню и начать →
            </button>
          </form>
        </div>

        <PaywallModal
          isOpen={showPaywall}
          onClose={() => setShowPaywall(false)}
          onSuccess={(sub) => {
            setSubscription(sub);
            setShowPaywall(false);
          }}
          sessionToken={sessionToken}
          currentTier={subscription?.tier}
          availableProducts={subscription?.available_products}
        />
      </div>
    );
  }

  // Ready Phase -> Mount Controlled FoodFirstApp
  if (!catalog || !profile || !state) {
    return null;
  }

  return (
    <FoodFirstApp
      catalog={catalog}
      profile={profile}
      state={state}
      shoppingItems={shoppingItems}
      syncStatus={syncStatus}
      onSelectDate={handleSelectDate}
      onReplaceRecipe={handleReplaceRecipe}
      onRebuildMenu={handleRebuildMenu}
      onToggleIngredient={handleToggleIngredient}
      onToggleStep={handleToggleStep}
      onChangeBatches={handleChangeBatches}
      onRefreshShopping={handleRefreshShopping}
      onToggleCheckedInStore={handleToggleCheckedInStore}
      onToggleAlreadyHave={handleToggleAlreadyHave}
      onAddCustomItem={handleAddCustomItem}
      onSelectShoppingRange={handleSelectShoppingRange}
      onToggleRangeChecked={handleToggleRangeChecked}
      onOpenSettings={handleOpenSettings}
      subscription={subscription}
      onUpdateSubscription={setSubscription}
      sessionToken={sessionToken}
    />
  );
}
