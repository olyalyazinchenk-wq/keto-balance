import React, { useEffect, useMemo, useState, useCallback } from 'react';
import type {
  DietApproach,
  GeneratedMenu,
  KetoBalanceIntegrationCallbacks,
  ManualDiaryEntry,
  ScreenId,
  ShoppingFixtureItem,
  SupportTransportState,
  UserSettingsDraft,
  VisualDirection,
} from './types/ketoBalanceContract';
import {
  DEMO_GENERATED_MENU,
  DEMO_RECIPES,
  DEMO_RECIPES_BY_ID,
  DEMO_SHOPPING_FIXTURE,
  INITIAL_SETTINGS_DRAFT,
} from './data/ketoBalanceFixtures';
import {
  popNavigationStack,
  pushNavigationStack,
} from './utils/ketoBalanceState';
import {
  getTelegramSDK,
  syncTelegramViewportVariables,
} from './utils/telegramWebApp';
import { AppShell } from './components/kb/AppShell';
import {
  SettingsScreen,
  StartScreen,
} from './components/kb/StartAndSettingsScreens';
import {
  MenuScreen,
  TodayScreen,
} from './components/kb/TodayAndMenuScreens';
import {
  RecipeCookingScreen,
  ShoppingScreen,
} from './components/kb/RecipeAndShoppingScreens';
import {
  AccessOfferScreen,
  ManualDiaryScreen,
  MoreScreen,
  SupportScreen,
} from './components/kb/DiarySupportMoreScreens';

const STORAGE_KEYS = {
  settings: 'kb_proto_settings_v1',
  menuChosen: 'kb_proto_menu_chosen_v1',
  generatedMenu: 'kb_proto_menu_v1',
  shopping: 'kb_proto_shopping_v1',
  shoppingStale: 'kb_proto_shopping_stale_v1',
  diary: 'kb_proto_diary_v1',
  checkedIngredients: 'kb_proto_checked_ing_v1',
  checkedSteps: 'kb_proto_checked_steps_v1',
};

const VALID_SCREENS: ScreenId[] = [
  'start',
  'settings',
  'today',
  'menu',
  'recipe',
  'shopping',
  'diary',
  'support',
  'more',
  'access',
];

function readJsonStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export interface KetoBalanceAppProps {
  integrationCallbacks?: KetoBalanceIntegrationCallbacks;
}

export default function App({ integrationCallbacks }: KetoBalanceAppProps = {}) {
  const initialUrlParams = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const rawScreen = params.get('screen') as ScreenId | null;
    const screen: ScreenId =
      rawScreen && VALID_SCREENS.includes(rawScreen) ? rawScreen : 'start';
    const dir: VisualDirection = params.get('dir') === 'B' ? 'B' : 'A';
    const theme: 'light' | 'dark' =
      params.get('theme') === 'dark' ? 'dark' : 'light';
    const forceChosen = params.get('chosen') === '1';
    const forceFirstVisit = params.get('chosen') === '0';
    return { screen, dir, theme, forceChosen, forceFirstVisit };
  }, []);

  const [navStack, setNavStack] = useState<ScreenId[]>([
    initialUrlParams.screen,
  ]);
  const currentScreen: ScreenId = navStack[navStack.length - 1] || 'today';

  const [visualDirection, setVisualDirection] = useState<VisualDirection>(
    initialUrlParams.dir
  );
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>(
    initialUrlParams.theme
  );

  const [settingsDraft, setSettingsDraft] = useState<UserSettingsDraft>(() =>
    readJsonStorage<UserSettingsDraft>(
      STORAGE_KEYS.settings,
      INITIAL_SETTINGS_DRAFT
    )
  );

  const [isMenuChosen, setIsMenuChosen] = useState<boolean>(() => {
    if (initialUrlParams.forceChosen) return true;
    if (initialUrlParams.forceFirstVisit) return false;
    return readJsonStorage<boolean>(STORAGE_KEYS.menuChosen, false);
  });

  const [generatedMenu, setGeneratedMenu] = useState<GeneratedMenu>(() =>
    readJsonStorage<GeneratedMenu>(
      STORAGE_KEYS.generatedMenu,
      DEMO_GENERATED_MENU
    )
  );

  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(1);
  const [activeRecipeId, setActiveRecipeId] = useState<string>(
    'kb-rec-eggs-avocado'
  );

  const [checkedIngredients, setCheckedIngredients] = useState<
    Record<string, boolean>
  >(() =>
    readJsonStorage<Record<string, boolean>>(STORAGE_KEYS.checkedIngredients, {})
  );
  const [checkedSteps, setCheckedSteps] = useState<Record<string, boolean>>(() =>
    readJsonStorage<Record<string, boolean>>(STORAGE_KEYS.checkedSteps, {})
  );

  const [shoppingItems, setShoppingItems] = useState<ShoppingFixtureItem[]>(() =>
    readJsonStorage<ShoppingFixtureItem[]>(
      STORAGE_KEYS.shopping,
      DEMO_SHOPPING_FIXTURE
    )
  );
  const [shoppingNeedsRefresh, setShoppingNeedsRefresh] = useState<boolean>(() =>
    readJsonStorage<boolean>(STORAGE_KEYS.shoppingStale, false)
  );

  // Дневник по умолчанию действительно пустой (никаких предзаполненных за пользователя записей)
  const [diaryEntries, setDiaryEntries] = useState<ManualDiaryEntry[]>(() =>
    readJsonStorage<ManualDiaryEntry[]>(STORAGE_KEYS.diary, [])
  );
  const [selectedDiaryDate, setSelectedDiaryDate] =
    useState<string>('2026-10-28');

  const [supportTransportState, setSupportTransportState] =
    useState<SupportTransportState>('idle');

  // Автосохранение черновика настроек и локального состояния
  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEYS.settings,
        JSON.stringify(settingsDraft)
      );
    } catch {
      // ignore
    }
  }, [settingsDraft]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEYS.menuChosen,
        JSON.stringify(isMenuChosen)
      );
    } catch {
      // ignore
    }
  }, [isMenuChosen]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEYS.generatedMenu,
        JSON.stringify(generatedMenu)
      );
    } catch {
      // ignore
    }
  }, [generatedMenu]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEYS.shopping,
        JSON.stringify(shoppingItems)
      );
    } catch {
      // ignore
    }
  }, [shoppingItems]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEYS.shoppingStale,
        JSON.stringify(shoppingNeedsRefresh)
      );
    } catch {
      // ignore
    }
  }, [shoppingNeedsRefresh]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEYS.diary,
        JSON.stringify(diaryEntries)
      );
    } catch {
      // ignore
    }
  }, [diaryEntries]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEYS.checkedIngredients,
        JSON.stringify(checkedIngredients)
      );
    } catch {
      // ignore
    }
  }, [checkedIngredients]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEYS.checkedSteps,
        JSON.stringify(checkedSteps)
      );
    } catch {
      // ignore
    }
  }, [checkedSteps]);

  // Синхронизация Telegram WebApp safe-area / viewport
  useEffect(() => {
    syncTelegramViewportVariables();
    const tg = getTelegramSDK();
    try {
      tg?.ready?.();
      tg?.expand?.();
    } catch {
      // ignore
    }
    const handleResize = () => {
      syncTelegramViewportVariables();
    };
    window.addEventListener('resize', handleResize);
    tg?.onEvent?.('viewportChanged', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      tg?.offEvent?.('viewportChanged', handleResize);
    };
  }, []);

  const navigateTo = useCallback((next: ScreenId) => {
    setNavStack((prev) => pushNavigationStack(prev, next));
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, []);

  const navigateBack = useCallback(() => {
    setNavStack((prev) => popNavigationStack(prev).nextStack);
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, []);

  // Привязка системной кнопки BackButton в Telegram WebApp к реальному стеку экранов
  useEffect(() => {
    const tg = getTelegramSDK();
    if (!tg?.BackButton) return;
    const canGoBack = navStack.length > 1;
    try {
      if (canGoBack) {
        tg.BackButton.show();
        tg.BackButton.onClick(navigateBack);
      } else {
        tg.BackButton.hide();
      }
    } catch {
      // ignore
    }
    return () => {
      try {
        tg.BackButton?.offClick(navigateBack);
      } catch {
        // ignore
      }
    };
  }, [navStack.length, navigateBack]);

  const handlePatchSettingsDraft = useCallback(
    (patch: Partial<UserSettingsDraft>) => {
      setSettingsDraft((prev) => ({
        ...prev,
        ...patch,
      }));
    },
    []
  );

  const activeRecipe = useMemo(
    () => DEMO_RECIPES_BY_ID[activeRecipeId] || DEMO_RECIPES[0],
    [activeRecipeId]
  );

  // Точки интеграции (Integration Seams)
  const handleStartQuestionnaire = (approach: DietApproach) => {
    setSettingsDraft((prev) => ({
      ...prev,
      confirmed18Plus: true,
      approach,
      currentStep: 1,
    }));
    navigateTo('settings');
  };

  const handleExploreWithoutQuestionnaire = () => {
    setSettingsDraft((prev) => ({
      ...prev,
      confirmed18Plus: true,
      approach: 'explore',
    }));
    setIsMenuChosen(true);
    navigateTo('today');
  };

  const handleSaveAndOpenMenu = () => {
    setSettingsDraft((prev) => ({
      ...prev,
      isSaved: true,
    }));
    setIsMenuChosen(true);
    integrationCallbacks?.onChooseMenu?.(generatedMenu);
    navigateTo('menu');
  };

  const handleOpenRecipe = (recipeId: string) => {
    setActiveRecipeId(recipeId);
    navigateTo('recipe');
  };

  const handleReplaceRecipe = (
    dayIndex: number,
    slotKey: string,
    nextRecipeId: string
  ) => {
    setGeneratedMenu((prev) => ({
      ...prev,
      days: prev.days.map((day) =>
        day.dayIndex === dayIndex
          ? {
              ...day,
              slots: {
                ...day.slots,
                [slotKey]: nextRecipeId,
              },
            }
          : day
      ),
    }));
    // Честное состояние: изменение меню помечает список покупок как требующий обновления
    setShoppingNeedsRefresh(true);
    integrationCallbacks?.onReplaceRecipe?.(dayIndex, slotKey, nextRecipeId);
  };

  const handleToggleCheckedInStore = (id: string) => {
    setShoppingItems((prev) => {
      const next = prev.map((it) =>
        it.id === id ? { ...it, checkedInStore: !it.checkedInStore } : it
      );
      integrationCallbacks?.onUpdateShopping?.(next);
      return next;
    });
  };

  const handleToggleAlreadyHave = (id: string) => {
    setShoppingItems((prev) => {
      const next = prev.map((it) =>
        it.id === id ? { ...it, alreadyHave: !it.alreadyHave } : it
      );
      integrationCallbacks?.onUpdateShopping?.(next);
      return next;
    });
  };

  const handleRefreshShoppingFromMenu = () => {
    setShoppingNeedsRefresh(false);
    integrationCallbacks?.onUpdateShopping?.(shoppingItems);
  };

  const handleSaveDiaryEntry = (
    payload: Omit<ManualDiaryEntry, 'id'>,
    editingId?: string
  ) => {
    if (editingId) {
      const updatedEntry: ManualDiaryEntry = {
        id: editingId,
        ...payload,
      };
      setDiaryEntries((prev) =>
        prev.map((entry) => (entry.id === editingId ? updatedEntry : entry))
      );
      integrationCallbacks?.onSaveDiaryEntry?.(updatedEntry);
    } else {
      const newEntry: ManualDiaryEntry = {
        id: `diary-${Date.now()}`,
        ...payload,
      };
      setDiaryEntries((prev) => [newEntry, ...prev]);
      integrationCallbacks?.onSaveDiaryEntry?.(newEntry);
    }
  };

  const handleDeleteDiaryEntry = (id: string) => {
    setDiaryEntries((prev) => prev.filter((e) => e.id !== id));
  };

  const handleOpenSupportAction = (topic: string, _userNote: string) => {
    // Отсутствие токена в песочнице = транспорт отключён, статус «демо».
    // Никакого dev-bypass с verified: true или ложного перехода в 'confirmed'.
    integrationCallbacks?.onOpenSupport?.({
      fromScreen: currentScreen,
      draftSaved: true,
      topic,
    });
  };

  const handleClearLocalData = () => {
    Object.values(STORAGE_KEYS).forEach((k) => {
      try {
        window.localStorage.removeItem(k);
      } catch {
        // ignore
      }
    });
    setSettingsDraft(INITIAL_SETTINGS_DRAFT);
    setIsMenuChosen(false);
    setGeneratedMenu(DEMO_GENERATED_MENU);
    setShoppingItems(DEMO_SHOPPING_FIXTURE);
    setShoppingNeedsRefresh(false);
    setDiaryEntries([]);
    setCheckedIngredients({});
    setCheckedSteps({});
  };

  // Контекстная подпись возврата на экране поддержки
  const previousScreen =
    navStack.length > 1 ? navStack[navStack.length - 2] : 'today';
  const supportReturnLabel =
    previousScreen === 'settings'
      ? `Вернуться к шагу ${settingsDraft.currentStep} анкеты`
      : previousScreen === 'start'
      ? 'Вернуться на стартовый экран'
      : 'Вернуться назад';

  return (
    <AppShell
      activeScreen={currentScreen}
      canGoBack={navStack.length > 1}
      onGoBack={navigateBack}
      onNavigate={navigateTo}
      onOpenSupport={() => navigateTo('support')}
      visualDirection={visualDirection}
      onChangeVisualDirection={setVisualDirection}
      theme={themeMode}
      onToggleTheme={() =>
        setThemeMode((prev) => (prev === 'light' ? 'dark' : 'light'))
      }
      shoppingNeedsRefresh={shoppingNeedsRefresh}
    >
      {currentScreen === 'start' && (
        <StartScreen
          draft={settingsDraft}
          onUpdateDraft={handlePatchSettingsDraft}
          onStartQuestionnaire={handleStartQuestionnaire}
          onExploreWithoutQuestionnaire={handleExploreWithoutQuestionnaire}
          onOpenSupportBeforeQuestionnaire={() => navigateTo('support')}
        />
      )}

      {currentScreen === 'settings' && (
        <SettingsScreen
          draft={settingsDraft}
          onUpdateDraft={handlePatchSettingsDraft}
          onSaveAndOpenMenu={handleSaveAndOpenMenu}
          onOpenSupportFromSettings={() => navigateTo('support')}
        />
      )}

      {currentScreen === 'today' && (
        <TodayScreen
          visualDirection={visualDirection}
          isMenuChosen={isMenuChosen}
          onToggleFirstVisitState={setIsMenuChosen}
          menu={generatedMenu}
          selectedDayIndex={selectedDayIndex}
          recipesById={DEMO_RECIPES_BY_ID}
          settings={settingsDraft}
          onNavigateToMenu={() => {
            setIsMenuChosen(true);
            navigateTo('menu');
          }}
          onNavigateToSettings={() => navigateTo('settings')}
          onOpenRecipe={handleOpenRecipe}
          onNavigateToShopping={() => navigateTo('shopping')}
          onNavigateToDiary={() => navigateTo('diary')}
        />
      )}

      {currentScreen === 'menu' && (
        <MenuScreen
          visualDirection={visualDirection}
          menu={generatedMenu}
          selectedDayIndex={selectedDayIndex}
          onSelectDayIndex={setSelectedDayIndex}
          recipes={DEMO_RECIPES}
          recipesById={DEMO_RECIPES_BY_ID}
          settings={settingsDraft}
          onReplaceRecipe={handleReplaceRecipe}
          onOpenRecipe={handleOpenRecipe}
          onChooseMenuAndGoToShopping={() => {
            setIsMenuChosen(true);
            integrationCallbacks?.onChooseMenu?.(generatedMenu);
            navigateTo('shopping');
          }}
          onEditSettings={() => navigateTo('settings')}
        />
      )}

      {currentScreen === 'recipe' && (
        <RecipeCookingScreen
          recipe={activeRecipe}
          checkedIngredients={checkedIngredients}
          onToggleIngredient={(key) =>
            setCheckedIngredients((prev) => ({
              ...prev,
              [key]: !prev[key],
            }))
          }
          checkedSteps={checkedSteps}
          onToggleStep={(key) =>
            setCheckedSteps((prev) => ({
              ...prev,
              [key]: !prev[key],
            }))
          }
          onLogCookedMealToDiary={() => navigateTo('diary')}
        />
      )}

      {currentScreen === 'shopping' && (
        <ShoppingScreen
          items={shoppingItems}
          menuTitle={generatedMenu.title}
          isStaleAfterMenuEdit={shoppingNeedsRefresh}
          onRefreshShoppingFromMenu={handleRefreshShoppingFromMenu}
          onToggleCheckedInStore={handleToggleCheckedInStore}
          onToggleAlreadyHave={handleToggleAlreadyHave}
        />
      )}

      {currentScreen === 'diary' && (
        <ManualDiaryScreen
          selectedDate={selectedDiaryDate}
          onChangeDate={setSelectedDiaryDate}
          entries={diaryEntries}
          onSaveEntry={handleSaveDiaryEntry}
          onDeleteEntry={handleDeleteDiaryEntry}
          onOpenMenu={() => navigateTo('menu')}
        />
      )}

      {currentScreen === 'support' && (
        <SupportScreen
          transportState={supportTransportState}
          onChangeTransportState={setSupportTransportState}
          onOpenSupportAction={handleOpenSupportAction}
          onReturnBack={navigateBack}
          returnContextLabel={supportReturnLabel}
        />
      )}

      {currentScreen === 'more' && (
        <MoreScreen
          recipes={DEMO_RECIPES}
          onOpenRecipe={handleOpenRecipe}
          onOpenSettings={() => navigateTo('settings')}
          onOpenSupport={() => navigateTo('support')}
          onOpenAccess={() => navigateTo('access')}
          onClearLocalData={handleClearLocalData}
        />
      )}

      {currentScreen === 'access' && (
        <AccessOfferScreen
          onRequestAccess={(tier) =>
            integrationCallbacks?.onRequestAccess?.(tier)
          }
          onOpenSupport={() => navigateTo('support')}
          onReturnBack={navigateBack}
        />
      )}
    </AppShell>
  );
}
