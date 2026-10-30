import { useState, useEffect, useCallback, useMemo } from 'react';
import type { ScreenId, UserSettingsDraft, ShoppingFixtureItem, GeneratedMenu } from './contract';
import { AppShell } from './AppShell';
import { FoodToday } from './Today';
import { MenuScreen } from './Menu';
import { RecipeScreen } from './Recipe';
import { ShoppingScreen } from './Shopping';
import { toFoodCard, photoForRecipe } from './model';
import { resolveSelectedDay } from './selectedDay';
import { rebuildShoppingFromMenu } from './shoppingFromMenu';
import { resolveDayMenuSlots } from './state';
import { UI_RECIPES, UI_RECIPES_BY_ID, DEFAULT_FOOD_MENU } from './recipesAdapter';
import PrivateSupportPage from '../../pages/PrivateSupportPage';

const STORAGE_KEYS = {
  selectedDay: 'kb_proto_selected_day_v1',
  menu: 'kb_proto_menu_v1',
  shopping: 'kb_proto_shopping_v1',
  shoppingStale: 'kb_proto_shopping_stale_v1',
  checkedIngredients: 'kb_proto_checked_ing_v1',
  checkedSteps: 'kb_proto_checked_steps_v1',
};

function readJsonStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

const DEFAULT_SETTINGS: UserSettingsDraft = {
  confirmed18Plus: true,
  approach: 'keto',
  restrictions: [],
  prepTimeMax: 35,
  mealsPerDay: 3,
  preferenceNote: 'simple_daily',
  remindersOptIn: false,
  currentStep: 1,
  isSaved: true,
};

function getInitialRoute(): { screen: ScreenId; recipeId?: string } {
  try {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const qScreen = params.get('screen')?.toLowerCase();
      const qRecipe = params.get('recipe');
      if (qScreen && ['today', 'menu', 'recipe', 'shopping', 'support'].includes(qScreen)) {
        return { screen: qScreen as ScreenId, recipeId: qRecipe || undefined };
      }
      const hash = window.location.hash.replace(/^#\/?/, '').toLowerCase();
      if (hash.startsWith('recipe')) {
        const parts = hash.split('/');
        return { screen: 'recipe', recipeId: parts[1] || undefined };
      }
      if (['today', 'menu', 'recipe', 'shopping', 'support'].includes(hash)) {
        return { screen: hash as ScreenId };
      }
    }
  } catch {}
  return { screen: 'today' };
}

export function FoodFirstApp() {
  const [initialRoute] = useState(() => getInitialRoute());
  const [navStack, setNavStack] = useState<ScreenId[]>([initialRoute.screen]);
  const currentScreen: ScreenId = navStack[navStack.length - 1] || 'today';

  const [menu, setMenu] = useState<GeneratedMenu>(() =>
    readJsonStorage<GeneratedMenu>(STORAGE_KEYS.menu, DEFAULT_FOOD_MENU)
  );

  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(() => {
    const stored = readJsonStorage<unknown>(STORAGE_KEYS.selectedDay, null);
    const restored = resolveSelectedDay(stored, menu.days);
    return restored ?? 0;
  });

  const [activeRecipeId, setActiveRecipeId] = useState<string>(initialRoute.recipeId || 'k1');

  const [shoppingNeedsRefresh, setShoppingNeedsRefresh] = useState<boolean>(() =>
    readJsonStorage<boolean>(STORAGE_KEYS.shoppingStale, false)
  );

  const [shoppingItems, setShoppingItems] = useState<ShoppingFixtureItem[]>(() => {
    const stored = readJsonStorage<ShoppingFixtureItem[] | null>(STORAGE_KEYS.shopping, null);
    if (stored && stored.length > 0) return stored;
    try {
      return rebuildShoppingFromMenu(menu, UI_RECIPES_BY_ID, []);
    } catch {
      return [];
    }
  });

  const [checkedIngredients, setCheckedIngredients] = useState<Record<string, boolean>>(() =>
    readJsonStorage<Record<string, boolean>>(STORAGE_KEYS.checkedIngredients, {})
  );

  const [checkedSteps, setCheckedSteps] = useState<Record<string, boolean>>(() =>
    readJsonStorage<Record<string, boolean>>(STORAGE_KEYS.checkedSteps, {})
  );

  // Sync state to localStorage
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.selectedDay, JSON.stringify(selectedDayIndex));
    } catch {}
  }, [selectedDayIndex]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.menu, JSON.stringify(menu));
    } catch {}
  }, [menu]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.shopping, JSON.stringify(shoppingItems));
    } catch {}
  }, [shoppingItems]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.shoppingStale, JSON.stringify(shoppingNeedsRefresh));
    } catch {}
  }, [shoppingNeedsRefresh]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.checkedIngredients, JSON.stringify(checkedIngredients));
    } catch {}
  }, [checkedIngredients]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.checkedSteps, JSON.stringify(checkedSteps));
    } catch {}
  }, [checkedSteps]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncHash = () => {
      const raw = window.location.hash.replace(/^#\/?/, '').toLowerCase();
      if (raw.startsWith('recipe')) {
        const parts = raw.split('/');
        if (parts[1]) setActiveRecipeId(parts[1]);
        setNavStack((prev) => (prev[prev.length - 1] === 'recipe' ? prev : [...prev, 'recipe']));
      } else if (['today', 'menu', 'recipe', 'shopping', 'support'].includes(raw)) {
        const scr = raw as ScreenId;
        setNavStack((prev) => (prev[prev.length - 1] === scr ? prev : [...prev, scr]));
      }
    };
    window.addEventListener('hashchange', syncHash);
    return () => window.removeEventListener('hashchange', syncHash);
  }, []);

  const navigateTo = useCallback((screen: ScreenId) => {
    setNavStack((prev) => (prev[prev.length - 1] === screen ? prev : [...prev, screen]));
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, []);

  const navigateBack = useCallback(() => {
    setNavStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, []);

  const handleOpenRecipe = useCallback((recipeId: string) => {
    setActiveRecipeId(recipeId);
    navigateTo('recipe');
  }, [navigateTo]);

  const handleSelectDay = useCallback((dayIdx: number) => {
    setSelectedDayIndex(dayIdx);
  }, []);

  const handleReplaceRecipe = useCallback((dayIndex: number, slotKey: string, nextRecipeId: string) => {
    setMenu((prev) => ({
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
    setShoppingNeedsRefresh(true);
  }, []);

  const handleRefreshShopping = useCallback(() => {
    try {
      const next = rebuildShoppingFromMenu(menu, UI_RECIPES_BY_ID, shoppingItems);
      setShoppingItems(next);
      setShoppingNeedsRefresh(false);
    } catch (e) {
      console.warn('Failed to rebuild shopping items', e);
    }
  }, [menu, shoppingItems]);

  const currentDay = useMemo(
    () => menu.days.find((d) => d.dayIndex === selectedDayIndex) || menu.days[0],
    [menu, selectedDayIndex]
  );

  const resolvedSlots = useMemo(
    () => (currentDay ? resolveDayMenuSlots(currentDay, UI_RECIPES_BY_ID, 3) : []),
    [currentDay]
  );

  const leadRecipe = resolvedSlots[0]?.recipe;
  const primaryCard = useMemo(() => {
    if (!leadRecipe) return null;
    return toFoodCard(
      {
        id: leadRecipe.id,
        title: leadRecipe.title,
        time: leadRecipe.prepMinutes,
        serv: 1,
      },
      photoForRecipe(leadRecipe.id)
    );
  }, [leadRecipe]);

  const otherCards = useMemo(() => {
    return resolvedSlots
      .slice(1)
      .filter((s) => Boolean(s.recipe))
      .map((s) =>
        toFoodCard({
          id: s.recipe!.id,
          title: s.recipe!.title,
          time: s.recipe!.prepMinutes,
          serv: 1,
        })
      );
  }, [resolvedSlots]);

  const activeRecipe = useMemo(
    () => UI_RECIPES_BY_ID[activeRecipeId] || UI_RECIPES[0],
    [activeRecipeId]
  );

  return (
    <AppShell
      activeScreen={currentScreen}
      canGoBack={navStack.length > 1}
      onGoBack={navigateBack}
      onNavigate={navigateTo}
      onOpenSupport={() => navigateTo('support')}
      shoppingNeedsRefresh={shoppingNeedsRefresh}
      selectedDayIndex={selectedDayIndex}
      selectedDayLabel={currentDay?.label || 'День 1'}
    >
      {currentScreen === 'today' && (
        <FoodToday
          dateLabel={currentDay?.label || 'День 1'}
          primary={primaryCard}
          others={otherCards}
          rhythm={resolvedSlots.map(({ slotKey, slotLabel, recipe }) => ({
            key: slotKey,
            label: slotLabel,
            completed: Boolean(recipe && recipe.steps.length > 0 && recipe.steps.every(
              (_, index) => checkedSteps[`${recipe.id}:step:${index}`]
            )),
          }))}
          onOpenRecipe={handleOpenRecipe}
          onChooseMenu={() => navigateTo('menu')}
        />
      )}

      {currentScreen === 'menu' && (
        <MenuScreen
          menu={menu}
          selectedDayIndex={selectedDayIndex}
          onSelectDayIndex={handleSelectDay}
          recipes={UI_RECIPES}
          recipesById={UI_RECIPES_BY_ID}
          settings={DEFAULT_SETTINGS}
          onReplaceRecipe={handleReplaceRecipe}
          onOpenRecipe={handleOpenRecipe}
          onChooseMenuAndGoToShopping={() => {
            handleRefreshShopping();
            navigateTo('shopping');
          }}
        />
      )}

      {currentScreen === 'recipe' && (
        <RecipeScreen
          recipe={activeRecipe}
          checkedIngredients={checkedIngredients}
          onToggleIngredient={(key) =>
            setCheckedIngredients((prev) => ({ ...prev, [key]: !prev[key] }))
          }
          checkedSteps={checkedSteps}
          onToggleStep={(key) =>
            setCheckedSteps((prev) => ({ ...prev, [key]: !prev[key] }))
          }
          onGoBack={navigateBack}
        />
      )}

      {currentScreen === 'shopping' && (
        <ShoppingScreen
          items={shoppingItems}
          menuTitle={menu.title}
          isStaleAfterMenuEdit={shoppingNeedsRefresh}
          onRefreshShoppingFromMenu={handleRefreshShopping}
          onToggleCheckedInStore={(id) =>
            setShoppingItems((prev) =>
              prev.map((it) => (it.id === id ? { ...it, checkedInStore: !it.checkedInStore } : it))
            )
          }
          onToggleAlreadyHave={(id) =>
            setShoppingItems((prev) =>
              prev.map((it) => (it.id === id ? { ...it, alreadyHave: !it.alreadyHave } : it))
            )
          }
          onAddCustomItem={(item) => setShoppingItems((prev) => [...prev, item])}
        />
      )}

      {currentScreen === 'support' && (
        <div className="p-4 max-w-xl mx-auto">
          <button
            type="button"
            onClick={navigateBack}
            className="mb-4 text-xs font-semibold px-3 py-1.5 rounded-lg border border-[var(--kb-border)]"
          >
            ← Вернуться назад
          </button>
          <PrivateSupportPage />
        </div>
      )}
    </AppShell>
  );
}
