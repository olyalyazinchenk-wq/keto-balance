import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { KetoClient, ApiError, ConflictError, UnauthorizedError } from './api/ketoClient';
import { resolveTelegramLaunchAuth } from './tma/launchAuth';
import type {
  PilotCatalogV1,
  PilotPreferencesV1,
  PilotProfileV1,
  PilotStateV1,
  PilotShoppingItemV1,
  PilotRestrictionToken,
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
  const [draftPlanDays, setDraftPlanDays] = useState<1 | 3 | 7>(3);
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

  // Auth & bootstrap
  useEffect(() => {
    client.onUnauthorized = () => {
      setPhase('unauthorized');
      setErrorMessage('Сессия завершена или недействительна. Пожалуйста, откройте бот заново.');
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

    if (!initData && demoUserId === null) {
      setPhase('unauthorized');
      setErrorMessage('Ожидание авторизации Telegram. Откройте приложение через кнопку в боте «КетоБаланс».');
      return;
    }

    let isMounted = true;
    setPhase('authenticating');

    (async () => {
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

        const [catData, userData, shopData, subData] = await Promise.all([
          client.getCatalog(),
          client.getUser(),
          client.getShopping(),
          fetchSubscription(session.session_token).catch((err) => {
            console.warn('[PilotApp] Failed to fetch subscription on init:', err);
            return null;
          }),
        ]);

        if (!isMounted) return;
        if (subData) {
          setSubscription(subData);
        }
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
            });
            const validNumDays = (currentProfile.settings.planDays === 1 || currentProfile.settings.planDays === 7
              ? currentProfile.settings.planDays
              : (currentState.menu.days?.length === 1 || currentState.menu.days?.length === 7
                ? currentState.menu.days.length
                : 3)) as 1 | 3 | 7;
            try {
              const rebuiltMenu = controller.createUserMenu({
                numDays: validNumDays,
                meals: currentProfile.settings.mealsPerDay,
                profile: canonProfile,
                mode: approachToMode(currentProfile.settings.approach),
              });
              currentState = {
                ...currentState,
                menu: rebuiltMenu,
                selected_date: rebuiltMenu.days[0]?.date || null,
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
          });
          const planDays = (currentProfile.settings.planDays === 1 || currentProfile.settings.planDays === 7)
            ? currentProfile.settings.planDays
            : 3;
          let genMenu;
          try {
            genMenu = controller.createUserMenu({
              numDays: planDays,
              meals: currentProfile.settings.mealsPerDay,
              profile: canonProfile,
              mode: approachToMode(currentProfile.settings.approach),
            });
          } catch (genErr: any) {
            setPhase('error');
            setErrorMessage(genErr.message || 'Не удалось составить меню из доступных рецептов.');
            return;
          }

          const initState: PilotStateV1 = {
            schema_version: 1,
            menu: genMenu,
            selected_date: genMenu.days[0]?.date || null,
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
    })();

    return () => {
      isMounted = false;
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
      preferenceNote: 'simple_daily',
    };

    const newProfile: PilotProfileV1 = { settings: newSettings };
    const canonProfile = preferencesToUserProfile(newSettings);

    const controller = createMenuController(catalog.recipes, catalog.released_ids, {
      isPreview: catalog.test_only,
    });

    let genMenu;
    try {
      genMenu = controller.createUserMenu({
        numDays: draftPlanDays,
        meals: draftMealsPerDay,
        profile: canonProfile,
        mode: approachToMode(draftApproach),
      });
    } catch (genErr: any) {
      setErrorMessage(genErr.message || 'Не удалось составить меню из доступных рецептов. Попробуйте изменить параметры или ограничения.');
      return;
    }

    const initState: PilotStateV1 = {
      schema_version: 1,
      menu: genMenu,
      selected_date: genMenu.days[0]?.date || null,
      checked_ingredients: {},
      checked_steps: {},
      shopping_batches: 1,
      shopping_stale: false,
    };

    const initialShopping = rebuildShoppingFromMenu(genMenu, recipesById, [], 1);

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
      const nextState: PilotStateV1 = {
        ...currentState,
        menu: nextMenu,
        shopping_stale: true,
      };

      enqueueUserStateSave(nextState);
    },
    [catalog, profile, enqueueUserStateSave]
  );

  const handleRebuildMenu = useCallback(async () => {
    const currentState = stateRef.current;
    if (!profile?.settings || !catalog || !currentState) return;

    try {
      const canonProfile = preferencesToUserProfile(profile.settings);
      const mode = approachToMode(profile.settings.approach);
      const controller = createMenuController(catalog.recipes, catalog.released_ids, {
        isPreview: catalog.test_only,
      });

      const daysCount = (profile.settings.planDays === 1 || profile.settings.planDays === 7
        ? profile.settings.planDays
        : (currentState.menu?.days?.length === 1 || currentState.menu?.days?.length === 7
          ? currentState.menu.days.length
          : 3)) as 1 | 3 | 7;
      const newMenu = controller.createUserMenu({
        numDays: daysCount,
        meals: profile.settings.mealsPerDay,
        profile: canonProfile,
        mode,
      });

      const nextState: PilotStateV1 = {
        ...currentState,
        menu: newMenu,
        selected_date: newMenu.days[0]?.date || null,
        shopping_stale: true,
      };

      enqueueUserStateSave(nextState);
    } catch {
      setSyncStatus('error');
    }
  }, [profile, catalog, enqueueUserStateSave]);

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
    (batches: 1 | 2) => {
      const currentState = stateRef.current;
      if (!currentState || !currentState.menu) return;
      const currentItems = shoppingItemsRef.current;
      const nextShopping = rebuildShoppingFromMenu(
        currentState.menu,
        recipesById,
        currentItems,
        batches
      );
      const nextState: PilotStateV1 = {
        ...currentState,
        shopping_batches: batches,
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
          if (!mergedShopping.some((x) => x.id === it.id)) {
            mergedShopping.push(it);
          }
        }
        setShoppingItems(mergedShopping);
        shoppingItemsRef.current = mergedShopping;

        // 2. Put user second with shopping_stale: false
        const nextState: PilotStateV1 = { ...currentState, shopping_stale: false };
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

  const handleOpenSettings = useCallback(() => {
    if (profile?.settings) {
      setDraftConfirmed18(Boolean(profile.settings.confirmed18Plus));
      setDraftApproach(profile.settings.approach || 'keto');
      setDraftRestrictions(profile.settings.restrictions || []);
      setDraftPrepTime(profile.settings.prepTimeMax ?? 0);
      setDraftMealsPerDay((profile.settings.mealsPerDay as any) || 3);
      setDraftPlanDays((profile.settings.planDays as any) || (state?.menu?.days?.length as any) || 3);
      if (profile.settings.confirmed18Plus) {
        setGatePassed(true);
      }
    }
    setPhase('needs_settings');
  }, [profile, state]);

  // Render by Phase
  if (phase === 'init' || phase === 'authenticating' || phase === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-[#F7F2E9] text-[#2B2620]">
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
      <div className="min-h-screen flex items-center justify-center p-6 bg-[#F7F2E9] text-[#2B2620]">
        <div className="max-w-md w-full p-8 bg-white rounded-2xl shadow-sm border border-[#E5DECF] space-y-5">
          <div className="text-center">
            <span className="text-3xl">⚠️</span>
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
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full py-2.5 px-4 bg-[#5F7161] text-white rounded-xl font-semibold text-sm hover:bg-[#4E5E50] transition-colors"
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
        <div className="min-h-screen py-8 px-4 bg-[#F7F2E9] text-[#2B2620]">
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

      return (
        <StartGateScreen
          approach={draftApproach === 'carnivore' ? 'carnivore' : 'keto'}
          onSelectApproach={(a) => setDraftApproach(a)}
          onGateGranted={(payload) => handleGateContinue(payload.approach)}
          onContinue={handleGateContinue}
          onOpenSupport={() => setShowSupport(true)}
        />
      );
    }

    return (
      <div className="min-h-screen py-8 px-4 bg-[#F7F2E9] text-[#2B2620]">
        <div className="max-w-lg mx-auto bg-white rounded-2xl border border-[#E5DECF] p-6 sm:p-8 space-y-6 shadow-sm">
          <div className="border-b border-stone-200 pb-4 flex items-start justify-between gap-4">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-[#5F7161]">
                Персональный рацион
              </span>
              <h1 className="text-2xl font-bold text-stone-900 mt-1">Настройки питания</h1>
              <p className="text-sm text-stone-600 mt-1">
                Укажи свои предпочтения, чтобы составить безопасное и вкусное меню.
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
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-sm hover:from-amber-600 active:scale-95 transition-all cursor-pointer"
                >
                  ⭐ Premium
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
                {[15, 30, 45, 60, 0].map((t) => (
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
                ))}
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
              <div className="flex gap-2">
                {([1, 3, 7] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    data-testid={`settings-days-${d}`}
                    onClick={() => setDraftPlanDays(d)}
                    className={`flex-1 py-2 text-xs font-semibold rounded-xl border transition-all ${
                      draftPlanDays === d
                        ? 'border-[#5F7161] bg-[#EDF1E6] text-[#1B211B]'
                        : 'border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100'
                    }`}
                  >
                    {d === 1 ? '1 день' : d === 3 ? '3 дня' : '7 дней'}
                  </button>
                ))}
              </div>
            </div>

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
      onOpenSettings={handleOpenSettings}
      subscription={subscription}
      onUpdateSubscription={setSubscription}
      sessionToken={sessionToken}
    />
  );
}
