import { DailyTip } from './DailyTip';
import { useState, useEffect, useCallback, useMemo } from 'react';
import type { ScreenId, UserSettingsDraft, RecipeViewModel } from './contract';
import type { PilotCatalogV1, PilotProfileV1, PilotStateV1, PilotShoppingItemV1 } from '../../api/pilotTypes';
import type { SubscriptionState } from '../../types/subscription';
import { AppShell } from './AppShell';

import { PaywallModal } from './PaywallModal';
import { FoodToday } from './Today';
import { MenuScreen } from './Menu';
import { RecipeScreen } from './Recipe';
import { ShoppingScreen } from './Shopping';
import { toFoodCard, photoForRecipe } from './model';
import { resolveDayMenuSlots } from './state';
import { toRecipeViewModel } from './recipesAdapter';
import { preferencesToUserProfile } from '../../adapters/pilotState';
import { isRecipeAllowed } from '../../domain/eligibility';
import { PREVIEW_RECIPE_IDS } from '../../data/releasedRecipeIds';
import PrivateSupportPage from '../../pages/PrivateSupportPage';
import { EducationGuides } from './EducationGuides';

export interface FoodFirstAppProps {
  catalog: PilotCatalogV1;
  profile: PilotProfileV1;
  state: PilotStateV1;
  shoppingItems: PilotShoppingItemV1[];
  syncStatus: 'idle' | 'saving' | 'saved' | 'error' | 'conflict';
  onSelectDate: (date: string) => void;
  onReplaceRecipe: (date: string, slotKey: string, nextRecipeId: string) => Promise<void>;
  onRebuildMenu: () => Promise<void>;
  onToggleIngredient: (key: string) => void;
  onToggleStep: (key: string) => void;
  onChangeBatches: (batches: 1 | 2 | 4) => void;
  onRefreshShopping: () => void;
  onToggleCheckedInStore: (id: string) => void;
  onToggleAlreadyHave: (id: string) => void;
  onAddCustomItem: (item: PilotShoppingItemV1) => void;
  onOpenSettings?: (targetApproach?: 'keto' | 'carnivore') => void;
  subscription?: SubscriptionState | null;
  onUpdateSubscription?: (sub: SubscriptionState) => void;
  sessionToken?: string;
}

function getInitialRoute(): { screen: ScreenId; recipeId?: string } {
  try {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const qScreen = params.get('screen')?.toLowerCase();
      const qRecipe = params.get('recipe');
      if (qScreen && ['today', 'menu', 'recipe', 'shopping', 'support', 'diary', 'more'].includes(qScreen)) {
        return { screen: qScreen as ScreenId, recipeId: qRecipe || undefined };
      }
      const hash = window.location.hash.replace(/^#\/?/, '').toLowerCase();
      if (hash.startsWith('recipe')) {
        const parts = hash.split('/');
        return { screen: 'recipe', recipeId: parts[1] || undefined };
      }
      if (['today', 'menu', 'recipe', 'shopping', 'support', 'diary', 'more'].includes(hash)) {
        return { screen: hash as ScreenId };
      }
    }
  } catch {}
  return { screen: 'today' };
}

export function FoodFirstApp({
  catalog,
  profile,
  state,
  shoppingItems,
  syncStatus,
  onSelectDate,
  onReplaceRecipe,
  onRebuildMenu,
  onToggleIngredient,
  onToggleStep,
  onChangeBatches,
  onRefreshShopping,
  onToggleCheckedInStore,
  onToggleAlreadyHave,
  onAddCustomItem,
  onOpenSettings,
  subscription,
  onUpdateSubscription,
  sessionToken,
}: FoodFirstAppProps) {
  const [initialRoute] = useState(() => getInitialRoute());
  const [navStack, setNavStack] = useState<ScreenId[]>([initialRoute.screen]);
  const currentScreen: ScreenId = navStack[navStack.length - 1] || 'today';

  // Subscription state and Paywall modal control
  const [localSubscription, setLocalSubscription] = useState<SubscriptionState | null>(
    subscription || null
  );

  useEffect(() => {
    if (subscription) {
      setLocalSubscription(subscription);
    }
  }, [subscription]);

  const [isPaywallOpen, setIsPaywallOpen] = useState<boolean>(false);

  const handleOpenPaywall = useCallback(() => {
    setIsPaywallOpen(true);
  }, []);

  const handleClosePaywall = useCallback(() => {
    setIsPaywallOpen(false);
  }, []);

  const handlePaymentSuccess = useCallback(
    (updatedSub: SubscriptionState) => {
      setLocalSubscription(updatedSub);
      if (onUpdateSubscription) {
        onUpdateSubscription(updatedSub);
      }
      setIsPaywallOpen(false);
    },
    [onUpdateSubscription]
  );

  const isPremium = Boolean(localSubscription?.is_premium);

  const [activeRecipeId, setActiveRecipeId] = useState<string>(
    initialRoute.recipeId || (state.menu?.days[0]?.slots?.breakfast || 'k1')
  );

  // Compute UI recipe representations strictly from admitted catalog
  const recipesById = useMemo<Record<string, RecipeViewModel>>(() => {
    const map: Record<string, RecipeViewModel> = {};
    for (const r of catalog.recipes) {
      map[r.id] = toRecipeViewModel(r);
    }
    return map;
  }, [catalog.recipes]);

  const uiRecipes = useMemo<RecipeViewModel[]>(() => {
    return Object.values(recipesById);
  }, [recipesById]);

  // Current day calculation
  const currentDay = useMemo(() => {
    if (!state.menu || !state.menu.days || state.menu.days.length === 0) return null;
    if (state.selected_date) {
      const found = state.menu.days.find((d) => d.date === state.selected_date);
      if (found) return found;
    }
    return state.menu.days[0];
  }, [state.menu, state.selected_date]);

  const selectedDayIndex = useMemo(() => {
    if (!state.menu || !currentDay) return 0;
    const idx = state.menu.days.findIndex((d) => d.date === currentDay.date);
    return idx >= 0 ? idx : 0;
  }, [state.menu, currentDay]);

  const selectedDayLabel = useMemo(() => {
    return `День ${selectedDayIndex + 1}`;
  }, [selectedDayIndex]);

  // Navigation handlers
  const navigateTo = useCallback((screen: ScreenId) => {
    setNavStack((prev) => (prev[prev.length - 1] === screen ? prev : [...prev, screen]));
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, []);

  const navigateBack = useCallback(() => {
    setNavStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, []);

  const handleOpenRecipe = useCallback(
    (recipeId: string) => {
      setActiveRecipeId(recipeId);
      navigateTo('recipe');
    },
    [navigateTo]
  );

  const handleSelectDay = useCallback(
    (dayIdx: number) => {
      if (!state.menu) return;
      const targetDay = state.menu.days[dayIdx];
      if (targetDay) {
        onSelectDate(targetDay.date);
      }
    },
    [state.menu, onSelectDate]
  );

  const handleReplaceSlot = useCallback(
    (dayIndex: number, slotKey: string, nextRecipeId: string) => {
      if (!state.menu) return;
      const targetDay = state.menu.days[dayIndex];
      if (targetDay) {
        onReplaceRecipe(targetDay.date, slotKey, nextRecipeId);
      }
    },
    [state.menu, onReplaceRecipe]
  );

  // Hash synchronization
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncHash = () => {
      const raw = window.location.hash.replace(/^#\/?/, '').toLowerCase();
      if (raw.startsWith('recipe')) {
        const parts = raw.split('/');
        if (parts[1]) setActiveRecipeId(parts[1]);
        setNavStack((prev) => (prev[prev.length - 1] === 'recipe' ? prev : [...prev, 'recipe']));
      } else if (['today', 'menu', 'recipe', 'shopping', 'support', 'diary', 'more'].includes(raw)) {
        const scr = raw as ScreenId;
        setNavStack((prev) => (prev[prev.length - 1] === scr ? prev : [...prev, scr]));
      }
    };
    window.addEventListener('hashchange', syncHash);
    return () => window.removeEventListener('hashchange', syncHash);
  }, []);

  // Prepare Day Menu presentation
  const viewDayMenu = useMemo(() => {
    if (!currentDay) return null;
    return {
      dayIndex: selectedDayIndex,
      date: currentDay.date,
      label: selectedDayLabel,
      slots: currentDay.slots,
    };
  }, [currentDay, selectedDayIndex, selectedDayLabel]);

  const viewGeneratedMenu = useMemo(() => {
    if (!state.menu) {
      return { created: 1, title: 'Кето-меню', days: [] };
    }
    return {
      created: state.menu.created || 1,
      title: state.menu.mode === 'carnivore' ? 'Карнивор-рацион' : 'Кето-рацион',
      days: state.menu.days.map((d, idx) => ({
        dayIndex: idx,
        date: d.date,
        label: `День ${idx + 1}`,
        slots: d.slots,
      })),
    };
  }, [state.menu]);

  const resolvedSlots = useMemo(() => {
    if (!viewDayMenu) return [];
    return resolveDayMenuSlots(viewDayMenu, recipesById, profile.settings?.mealsPerDay || 3);
  }, [viewDayMenu, recipesById, profile.settings?.mealsPerDay]);

  const canonProfile = useMemo(() => {
    return preferencesToUserProfile(profile.settings || null);
  }, [profile.settings]);

  const effectiveCatalogIds = useMemo(() => {
    if (catalog.released_ids && catalog.released_ids.length > 0) return catalog.released_ids;
    if (catalog.test_only) return PREVIEW_RECIPE_IDS;
    return [];
  }, [catalog.released_ids, catalog.test_only]);

  const leadRecipe = resolvedSlots[0]?.recipe;
  const primaryCard = useMemo(() => {
    if (!leadRecipe) return null;
    const catRecipe = catalog.recipes.find((r) => r.id === leadRecipe.id);
    if (!catRecipe) return null;
    if (!effectiveCatalogIds.includes(catRecipe.id)) return null;
    if (canonProfile.mode && catRecipe.mode !== canonProfile.mode) return null;
    if (!isRecipeAllowed(catRecipe, canonProfile)) return null;

    const serv = typeof catRecipe.serv === 'number' && catRecipe.serv > 0 ? catRecipe.serv : 1;
    return toFoodCard(
      {
        id: leadRecipe.id,
        title: leadRecipe.title,
        time: leadRecipe.prepMinutes,
        serv,
      },
      photoForRecipe(leadRecipe.id)
    );
  }, [leadRecipe, catalog.recipes, effectiveCatalogIds, canonProfile]);

  const otherCards = useMemo(() => {
    return resolvedSlots
      .slice(1)
      .filter((s) => Boolean(s.recipe))
      .map((s) => {
        const catRecipe = catalog.recipes.find((r) => r.id === s.recipe!.id);
        if (!catRecipe || !effectiveCatalogIds.includes(catRecipe.id)) return null;
        if (canonProfile.mode && catRecipe.mode !== canonProfile.mode) return null;
        if (!isRecipeAllowed(catRecipe, canonProfile)) return null;
        const serv = typeof catRecipe.serv === 'number' && catRecipe.serv > 0 ? catRecipe.serv : 1;
        return toFoodCard({
          id: s.recipe!.id,
          title: s.recipe!.title,
          time: s.recipe!.prepMinutes,
          serv,
        }, photoForRecipe(s.recipe!.id));
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);
  }, [resolvedSlots, catalog.recipes, effectiveCatalogIds, canonProfile]);

  // Notice text for AppShell
  const noticeText = useMemo(() => {
    if (syncStatus === 'conflict') {
      return 'Конфликт версий. Обновите страницу';
    }
    if (syncStatus === 'error') {
      return 'Ошибка синхронизации с сервером';
    }
    if (syncStatus === 'saving') {
      return 'Сохранение изменений на сервере...';
    }
    if (state.shopping_stale) {
      return 'Список покупок не согласован с меню · требуется обновление';
    }
    if (catalog.test_only) {
      return 'Тестовый каталог · синтетические данные';
    }
    return '';
  }, [catalog.test_only, syncStatus, state.shopping_stale]);

  // View settings draft for MenuScreen
  const settingsDraft: UserSettingsDraft = useMemo(() => {
    return {
      confirmed18Plus: profile.settings?.confirmed18Plus ?? true,
      approach: profile.settings?.approach ?? 'keto',
      restrictions: profile.settings?.restrictions ?? [],
      prepTimeMax: profile.settings?.prepTimeMax ?? 35,
      mealsPerDay: profile.settings?.mealsPerDay ?? 3,
      preferenceNote: profile.settings?.preferenceNote ?? '',
      remindersOptIn: false,
      currentStep: 1,
      isSaved: true,
    };
  }, [profile.settings]);

  // Active recipe for RecipeScreen and eligibility check
  const activeRecipe = recipesById[activeRecipeId];
  const isRecipeEligible = useMemo(() => {
    if (!activeRecipe) return false;
    const catRecipe = catalog.recipes.find((r) => r.id === activeRecipe.id);
    if (!catRecipe) return false;

    // 1. Verify membership in admitted/released pool
    const effectiveIds = catalog.released_ids && catalog.released_ids.length > 0
      ? catalog.released_ids
      : (catalog.test_only ? PREVIEW_RECIPE_IDS : []);
    if (!effectiveIds.includes(catRecipe.id)) return false;

    // 2. Verify profile mode and canonical restrictions
    if (profile.settings) {
      const canon = preferencesToUserProfile(profile.settings);
      if (catRecipe.mode !== canon.mode) return false;
      if (!isRecipeAllowed(catRecipe, canon)) return false;
    }
    return true;
  }, [activeRecipe, catalog.recipes, catalog.released_ids, catalog.test_only, profile.settings]);

  return (
    <AppShell
      activeScreen={currentScreen}
      canGoBack={navStack.length > 1}
      onGoBack={navigateBack}
      onNavigate={navigateTo}
      onOpenSupport={() => navigateTo('support')}
      shoppingNeedsRefresh={state.shopping_stale}
      selectedDayIndex={selectedDayIndex}
      selectedDayLabel={selectedDayLabel}
    >
      {/* Notice header */}
      {noticeText && <aside className="ff-proof__notice" data-testid="pilot-sync-banner" role="status" aria-live="polite">
        {noticeText}
      </aside>}

      {currentScreen === 'today' && (
        <FoodToday
          dateLabel={selectedDayLabel}
          primary={primaryCard}
          others={otherCards}
          rhythm={resolvedSlots.map(({ slotKey, slotLabel, recipe }) => ({
            key: slotKey,
            label: slotLabel,
            completed: Boolean(
              recipe &&
                recipe.steps.length > 0 &&
                recipe.steps.every((_, idx) => state.checked_steps[`${recipe.id}:step:${idx}`])
            ),
          }))}
          hasMenu={Boolean(state.menu && state.menu.days && state.menu.days.length > 0)}
          onOpenRecipe={handleOpenRecipe}
          onChooseMenu={() => {
            if (state.menu && state.menu.days && state.menu.days.length > 0) {
              navigateTo('menu');
            } else if (onOpenSettings) {
              onOpenSettings();
            }
          }}
          onOpenSettings={onOpenSettings}
          onOpenPaywall={handleOpenPaywall}
          isPremium={isPremium}
          localSubscription={localSubscription}
          onNavigateToSupport={() => navigateTo('support')}
          onSelectApproach={(approach) => {
            if (onOpenSettings) onOpenSettings(approach);
          }}
        />
      )}

      {currentScreen === 'menu' && (
        <MenuScreen
          menu={viewGeneratedMenu}
          selectedDayIndex={selectedDayIndex}
          onSelectDayIndex={handleSelectDay}
          recipes={uiRecipes}
          recipesById={recipesById}
          settings={settingsDraft}
          onReplaceRecipe={handleReplaceSlot}
          onOpenRecipe={handleOpenRecipe}
          onChooseMenuAndGoToShopping={() => {
            onRefreshShopping();
            navigateTo('shopping');
          }}
          onEditSettings={onOpenSettings ? () => onOpenSettings() : undefined}
          onRebuildMenu={onRebuildMenu}
          catalogRecipes={catalog.recipes}
          admittedRecipeIds={effectiveCatalogIds}
        />
      )}

      {currentScreen === 'recipe' && (
        activeRecipe && isRecipeEligible ? (
          <RecipeScreen
            recipe={activeRecipe}
            checkedIngredients={state.checked_ingredients}
            onToggleIngredient={onToggleIngredient}
            checkedSteps={state.checked_steps}
            onToggleStep={onToggleStep}
            onGoBack={navigateBack}
          />
        ) : (
          <div className="p-8 max-w-xl mx-auto text-center space-y-4" data-testid="recipe-unavailable-notice">
            <h2 className="text-xl font-bold">Блюдо недоступно</h2>
            <p className="text-sm text-stone-600">
              {!activeRecipe
                ? `Рецепт (ID: ${activeRecipeId}) не найден в допущенном каталоге.`
                : 'Выбранное блюдо не подходит под ограничения вашего профиля питания или режим диеты.'}
            </p>
            <button
              type="button"
              onClick={navigateBack}
              className="px-4 py-2 bg-[#5F7161] text-white rounded-xl text-xs font-semibold"
            >
              ← Вернуться к меню
            </button>
          </div>
        )
      )}

      {currentScreen === 'shopping' && (
        <ShoppingScreen
          items={shoppingItems}
          menuTitle={state.menu ? (state.menu.mode === 'carnivore' ? 'Карнивор-меню' : 'Кето-рацион') : 'Список покупок'}
          isStaleAfterMenuEdit={state.shopping_stale}
          onRefreshShoppingFromMenu={onRefreshShopping}
          portionsMultiplier={state.shopping_batches}
          onChangePortionsMultiplier={onChangeBatches}
          onToggleCheckedInStore={onToggleCheckedInStore}
          onToggleAlreadyHave={onToggleAlreadyHave}
          onAddCustomItem={onAddCustomItem}
          menuDays={state.menu?.days}
          recipesById={recipesById}
        />
      )}

      {currentScreen === 'support' && (
        <div className="p-4 max-w-xl mx-auto space-y-4">
          <button
            type="button"
            onClick={navigateBack}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-[var(--kb-border)]"
          >
            ← Вернуться назад
          </button>
          <PrivateSupportPage />
        </div>
      )}

      {(currentScreen === 'more' || currentScreen === 'diary') && (
        <div className="ff-more" data-testid={currentScreen === 'diary' ? 'diary-screen' : 'more-screen'}>
          <h1>{currentScreen === 'diary' ? 'Дневник' : 'Ещё'}</h1>
          <section aria-label="Настройки и помощь">
            <h2>Твоё питание</h2>
            {onOpenSettings && <button type="button" className="ff-more-link" onClick={() => onOpenSettings()}>Настройки питания и ограничения<span aria-hidden="true">→</span></button>}
            <DailyTip showButton={true} />
            <button type="button" className="ff-more-link" onClick={() => navigateTo('support')}>Помощь и личный вопрос Ольге<span aria-hidden="true">→</span></button>
          </section>
          <section className="ff-access" aria-label="Аккаунт и доступ">
            <p className="ff-kicker">Аккаунт и доступ</p>
            <h2>{isPremium ? 'Подписка активна' : 'Базовый доступ'}</h2>
            {isPremium && localSubscription?.expires_at && <p>Действует до {new Date(localSubscription.expires_at).toLocaleDateString('ru-RU')}</p>}
            <button type="button" className="ff-action" data-testid="more-open-paywall-btn" onClick={handleOpenPaywall}>Условия доступа и подписка</button>
          </section>
          <section><h2>Дневник появится позже</h2><p>Личные записи пока недоступны. Сейчас здесь можно найти материалы о питании.</p></section>
          <EducationGuides />
        </div>
      )}

      <PaywallModal
        isOpen={isPaywallOpen}
        onClose={handleClosePaywall}
        onSuccess={handlePaymentSuccess}
        sessionToken={sessionToken}
        currentTier={localSubscription?.tier}
        availableProducts={localSubscription?.available_products}
      />
    </AppShell>
  );
}
