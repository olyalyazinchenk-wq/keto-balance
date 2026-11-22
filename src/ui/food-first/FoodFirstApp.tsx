import { useAppNavigation, type NavigationMemory } from './navigation';
import { Progress } from './Progress';
import { Lifehacks } from './Lifehacks';
import { DailyTip } from './DailyTip';
import { useState, useEffect, useCallback, useMemo } from 'react';
import type { ScreenId, UserSettingsDraft, RecipeViewModel } from './contract';
import type { PilotCatalogV1, PilotProfileV1, PilotStateV1, PilotShoppingItemV1, ShoppingRange } from '../../api/pilotTypes';
import type { SubscriptionState } from '../../types/subscription';
import { AppShell } from './AppShell';

import { PaywallModal } from './PaywallModal';
import { FoodToday } from './Today';
import { EditorialCatalog, EditorialCompass } from './EditorialCatalog';
import { MenuScreen } from './Menu';
import { RecipeScreen } from './Recipe';
import { ShoppingScreen } from './Shopping';
import { KitchenTimerWidget } from './KitchenTimerWidget';
import type { ActiveKitchenTimer } from './kitchenTimerState';
import { loadActiveTimer, saveActiveTimer, clearActiveTimer } from './kitchenTimerState';
import { timerDeadline, remainingTimerSeconds } from './kitchenTimer';
import { triggerHaptic } from '../../tma/telegram';
import { toFoodCard, photoForRecipe } from './model';
import { meetsStandardKetoIngredients } from '../../domain/ketoMenuPolicy';
import { resolveDayMenuSlots } from './state';
import { toRecipeViewModel } from './recipesAdapter';
import { recipeShoppingPrefix } from './shoppingFromMenu';
import { preferencesToUserProfile } from '../../adapters/pilotState';
import { isRecipeAllowed } from '../../domain/eligibility';
import { PREVIEW_RECIPE_IDS } from '../../data/releasedRecipeIds';
import PrivateSupportPage from '../../pages/PrivateSupportPage';
import { EducationGuides } from './EducationGuides';
import { KetoRules, PrivacyInfo } from './ClientInfo';

export interface FoodFirstAppProps {
  navigationMemory?: NavigationMemory;
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
  onAddRecipeToShopping?: (recipe: RecipeViewModel, portions: 1 | 2 | 4) => Promise<boolean>;
  onSelectShoppingRange?: (range: ShoppingRange) => void;
  onToggleRangeChecked?: (rangeKey: string, itemId: string) => void;
  onOpenSettings?: (targetApproach?: 'keto' | 'carnivore') => void;
  subscription?: SubscriptionState | null;
  subscriptionError?: string;
  onRetrySubscription?: () => void;
  onUpdateSubscription?: (sub: SubscriptionState) => void;
  sessionToken?: string;
  userId?: number | null;
}

function getInitialRoute(): { screen: ScreenId; recipeId?: string } {
  try {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const qScreen = params.get('screen')?.toLowerCase();
      const qRecipe = params.get('recipe');
      if (qScreen && ['today', 'catalog', 'compass', 'menu', 'recipe', 'shopping', 'support', 'diary', 'more', 'rules', 'education', 'guides', 'lifehacks', 'progress'].includes(qScreen)) {
        return { screen: qScreen as ScreenId, recipeId: qRecipe || undefined };
      }
      const hash = window.location.hash.replace(/^#\/?/, '').toLowerCase();
      if (hash.startsWith('recipe')) {
        const parts = hash.split('/');
        return { screen: 'recipe', recipeId: parts[1] || undefined };
      }
      if (['today', 'catalog', 'compass', 'menu', 'recipe', 'shopping', 'support', 'diary', 'more', 'rules', 'education', 'guides', 'lifehacks', 'progress'].includes(hash)) {
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
  onAddRecipeToShopping,
  onSelectShoppingRange,
  onToggleRangeChecked,
  onOpenSettings: openSettings,
  navigationMemory,
  subscription,
  subscriptionError,
  onRetrySubscription,
  onUpdateSubscription,
  sessionToken,
  userId,
}: FoodFirstAppProps) {
  const isLegacyPlan = Boolean(state.menu && (state.menu.mode !== 'keto' || profile.settings?.approach !== 'keto'));
  const [initialRoute] = useState(() => getInitialRoute());
  const { entries: navEntries, current: currentRoute, navigateTo, navigateBack, saveScroll } = useAppNavigation(initialRoute, navigationMemory);
  const currentScreen = currentRoute.screen;
  const [learningBack, setLearningBack] = useState<(() => void) | null>(null);
  const registerLearningBack = useCallback((back: (() => void) | null) => setLearningBack(() => back), []);
  const [visited, setVisited] = useState<Set<ScreenId>>(() => new Set([currentScreen]));
  useEffect(() => { setVisited(prev => prev.has(currentScreen) ? prev : new Set([...prev, currentScreen])); }, [currentScreen]);
  const onOpenSettings = openSettings ? (approach?: 'keto' | 'carnivore') => { saveScroll(); openSettings(approach); } : undefined;

  // Lifted Kitchen Timer State
  const [activeTimer, setActiveTimer] = useState<ActiveKitchenTimer | null>(() => {
    return loadActiveTimer(userId);
  });

  useEffect(() => {
    setActiveTimer(loadActiveTimer(userId));
  }, [userId]);

  useEffect(() => {
    if (!activeTimer || activeTimer.isPaused || activeTimer.isCompleted || activeTimer.deadline === null) {
      return;
    }

    const refresh = () => {
      if (!activeTimer || activeTimer.isPaused || activeTimer.deadline === null) return;
      const remaining = remainingTimerSeconds(activeTimer.deadline);
      if (remaining <= 0) {
        const completed: ActiveKitchenTimer = {
          ...activeTimer,
          remainingSeconds: 0,
          deadline: null,
          isCompleted: true,
        };
        saveActiveTimer(completed);
        setActiveTimer(completed);
        triggerHaptic('notification_success');
      } else if (remaining !== activeTimer.remainingSeconds) {
        const updated: ActiveKitchenTimer = {
          ...activeTimer,
          remainingSeconds: remaining,
        };
        saveActiveTimer(updated);
        setActiveTimer(updated);
      }
    };

    const intervalId = window.setInterval(refresh, 1000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('pageshow', refresh);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('pageshow', refresh);
    };
  }, [activeTimer]);

  const handleStartTimer = useCallback(
    (recipeId: string, recipeTitle: string, minutes: number, stepIndex?: number) => {
      triggerHaptic('selection');
      const totalSec = minutes * 60;
      const deadline = timerDeadline(totalSec);
      const newTimer: ActiveKitchenTimer = {
        userId: userId !== undefined && userId !== null ? String(userId) : 'anonymous',
        recipeId,
        recipeTitle,
        stepIndex,
        label: stepIndex !== undefined ? `Шаг ${stepIndex + 1} · ${minutes} мин` : `Таймер · ${minutes} мин`,
        totalDurationSeconds: totalSec,
        deadline,
        remainingSeconds: totalSec,
        isPaused: false,
        isCompleted: false,
        startedAt: Date.now(),
      };
      saveActiveTimer(newTimer);
      setActiveTimer(newTimer);
    },
    [userId]
  );

  const handlePauseTimer = useCallback(() => {
    if (!activeTimer || activeTimer.isPaused) return;
    triggerHaptic('selection');
    const remaining = activeTimer.deadline ? remainingTimerSeconds(activeTimer.deadline) : activeTimer.remainingSeconds;
    const updated: ActiveKitchenTimer = {
      ...activeTimer,
      remainingSeconds: remaining,
      deadline: null,
      isPaused: true,
      isCompleted: remaining <= 0,
    };
    saveActiveTimer(updated);
    setActiveTimer(updated);
  }, [activeTimer]);

  const handleResumeTimer = useCallback(() => {
    if (!activeTimer || !activeTimer.isPaused || activeTimer.remainingSeconds <= 0) return;
    triggerHaptic('selection');
    const deadline = timerDeadline(activeTimer.remainingSeconds);
    const updated: ActiveKitchenTimer = {
      ...activeTimer,
      deadline,
      isPaused: false,
      isCompleted: false,
    };
    saveActiveTimer(updated);
    setActiveTimer(updated);
  }, [activeTimer]);

  const handleStopTimer = useCallback(() => {
    triggerHaptic('impact_light');
    clearActiveTimer(userId);
    setActiveTimer(null);
  }, [userId]);

  // Subscription state and Paywall modal control
  const [localSubscription, setLocalSubscription] = useState<SubscriptionState | null>(
    subscription || null
  );

  useEffect(() => {
    setLocalSubscription(subscription || null);
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

  const handleOpenRecipe = useCallback((recipeId: string) => {
    setActiveRecipeId(recipeId);
    navigateTo('recipe', recipeId);
  }, [navigateTo]);

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
      if (isLegacyPlan) { onOpenSettings?.('keto'); return; }
      if (!isPremium) { handleOpenPaywall(); return; }
      const targetDay = state.menu.days[dayIndex];
      if (targetDay) {
        onReplaceRecipe(targetDay.date, slotKey, nextRecipeId);
      }
    },
    [state.menu, onReplaceRecipe, isPremium, handleOpenPaywall, isLegacyPlan, onOpenSettings]
  );

  // Hash synchronization
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncHash = () => {
      const raw = window.location.hash.replace(/^#\/?/, '').toLowerCase();
      if (raw.startsWith('recipe')) {
        const parts = raw.split('/');
        if (parts[1]) setActiveRecipeId(parts[1]);
        navigateTo('recipe', parts[1]);
      } else if (['today', 'catalog', 'compass', 'menu', 'recipe', 'shopping', 'support', 'diary', 'more', 'rules', 'education', 'guides', 'lifehacks', 'progress'].includes(raw)) {
        const scr = raw as ScreenId;
        navigateTo(scr);
      }
    };
    window.addEventListener('hashchange', syncHash);
    return () => window.removeEventListener('hashchange', syncHash);
  }, [navigateTo]);

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
      title: isLegacyPlan ? 'Сохранённый рацион' : 'Кето-рацион',
      days: state.menu.days.map((d, idx) => ({
        dayIndex: idx,
        date: d.date,
        label: `День ${idx + 1}`,
        slots: d.slots,
      })),
    };
  }, [state.menu, isLegacyPlan]);

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
      return 'Данные изменились на другом устройстве. Откройте приложение заново.';
    }
    if (syncStatus === 'error') {
      return 'Не удалось сохранить изменения. Проверьте соединение и повторите действие.';
    }
    if (syncStatus === 'saving') {
      return 'Сохраняем изменения…';
    }
    if (state.shopping_stale) {
      return 'Меню изменилось. Обновите список покупок.';
    }
    return '';
  }, [syncStatus, state.shopping_stale]);

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
  const [recipePortions, setRecipePortions] = useState<Record<string, 1 | 2 | 4>>({});
  const [recipeShoppingConfirmation, setRecipeShoppingConfirmation] = useState<{
    recipeId: string;
    yieldNote: string;
    saved: boolean;
  } | null>(null);
  const displayedRecipeId = currentRoute.recipeId || activeRecipeId;
  const activeRecipe = recipesById[displayedRecipeId];
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

  const editorialRecipes = useMemo(() => {
    if (profile.settings && canonProfile.mode !== 'keto') return [];
    const admittedIds = new Set(effectiveCatalogIds);
    return catalog.recipes
      .filter(recipe => recipe.mode === 'keto' && admittedIds.has(recipe.id) &&
        isRecipeAllowed(recipe, canonProfile) && meetsStandardKetoIngredients(recipe))
      .map(recipe => recipesById[recipe.id]);
  }, [catalog.recipes, effectiveCatalogIds, canonProfile, profile.settings, recipesById]);

  const isRenderingRecipeScreenForTimer = currentScreen === 'recipe' &&
    Boolean(activeRecipe && isRecipeEligible && displayedRecipeId === activeTimer?.recipeId);
  const showFloatingTimer = Boolean(activeTimer && !isRenderingRecipeScreenForTimer);

  return (
    <AppShell
      activeScreen={currentScreen}
      canGoBack={navEntries.length > 1 || currentScreen !== 'today'}
      onGoBack={learningBack && ['education', 'guides'].includes(currentScreen) ? learningBack : navigateBack}
      onNavigate={navigateTo}
      onOpenSupport={() => navigateTo('support')}
      shoppingNeedsRefresh={state.shopping_stale}
      selectedDayIndex={selectedDayIndex}
      selectedDayLabel={selectedDayLabel}
      hasFloatingTimer={showFloatingTimer}
    >
      {subscriptionError && <aside className="ff-proof__notice" role="alert" data-testid="subscription-error">
        <p>{subscriptionError}</p>
        <button type="button" className="ff-proof__help-btn" onClick={onRetrySubscription}>Проверить доступ ещё раз</button>
      </aside>}
      {/* Notice header */}
      {isLegacyPlan && <aside className="ff-proof__notice" role="note" data-testid="legacy-plan-notice">
        <p>Ваш прежний рацион сохранён. В этой версии доступно только кето. Чтобы перейти на него, составьте новое меню. Индивидуальные исключения сохранятся.</p>
        {onOpenSettings && <button type="button" className="ff-proof__help-btn" data-testid="legacy-plan-create-keto"
          onClick={() => onOpenSettings('keto')}>Составить кето-меню</button>}
      </aside>}
      {noticeText && <aside className="ff-proof__notice" data-testid="pilot-sync-banner" role="status" aria-live="polite">
        {noticeText}
      </aside>}

      {(currentScreen === 'today' || visited.has('today')) && (
        <div hidden={currentScreen !== 'today'}>
        <FoodToday
          sessionToken={sessionToken}
          onOpenLearning={(screen) => navigateTo(screen)}
          onOpenCompass={() => navigateTo('compass')}
          onOpenCatalog={() => navigateTo('catalog')}
          catalogHighlights={editorialRecipes.flatMap(recipe => {
            const photo = photoForRecipe(recipe.id);
            return photo ? [toFoodCard({ id: recipe.id, title: recipe.title, minutes: recipe.prepMinutes }, photo)] : [];
          }).slice(0, 5)}
          onNavigate={navigateTo}
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
        </div>
      )}

      {(currentScreen === 'catalog' || visited.has('catalog')) && (
        <div hidden={currentScreen !== 'catalog'}>
          <EditorialCatalog recipes={editorialRecipes} onOpenRecipe={handleOpenRecipe} />
        </div>
      )}
      {(currentScreen === 'compass' || visited.has('compass')) && (
        <div hidden={currentScreen !== 'compass'}>
          <EditorialCompass recipes={editorialRecipes} onOpenRecipe={handleOpenRecipe} />
        </div>
      )}

      {(currentScreen === 'menu' || visited.has('menu')) && (
        <div hidden={currentScreen !== 'menu'}>
        <MenuScreen
          menu={viewGeneratedMenu}
          selectedDayIndex={selectedDayIndex}
          onSelectDayIndex={handleSelectDay}
          recipes={uiRecipes}
          recipesById={recipesById}
          settings={settingsDraft}
          onReplaceRecipe={handleReplaceSlot}
          allowRecipeChanges={!isLegacyPlan}
          onOpenRecipe={handleOpenRecipe}
          onChooseMenuAndGoToShopping={() => {
            onRefreshShopping();
            navigateTo('shopping');
          }}
          onEditSettings={onOpenSettings ? () => onOpenSettings() : undefined}
          onRebuildMenu={isLegacyPlan ? undefined : async () => { if (!isPremium) { handleOpenPaywall(); return; } await onRebuildMenu(); }}
          catalogRecipes={catalog.recipes}
          admittedRecipeIds={effectiveCatalogIds}
        />
        </div>
      )}

      {currentScreen === 'recipe' && (
        activeRecipe && isRecipeEligible ? (
          <RecipeScreen
            key={activeRecipe.id}
            recipe={activeRecipe}
            selectedPortions={recipePortions[activeRecipe.id] ?? 1}
            onSelectPortions={portions => setRecipePortions(prev => ({ ...prev, [activeRecipe.id]: portions }))}
            checkedIngredients={state.checked_ingredients}
            onToggleIngredient={onToggleIngredient}
            checkedSteps={state.checked_steps}
            onToggleStep={onToggleStep}
            onOpenShopping={onAddRecipeToShopping && (portions => {
              const confirmation = {
                recipeId: activeRecipe.id,
                yieldNote: activeRecipe.portionsVariants[portions]?.yieldNote ?? '',
                saved: false,
              };
              setRecipeShoppingConfirmation(confirmation);
              void onAddRecipeToShopping(activeRecipe, portions).then(saved => {
                setRecipeShoppingConfirmation(current => current === confirmation ? { ...confirmation, saved } : current);
              });
              navigateTo('shopping', activeRecipe.id);
            })}
            activeTimer={activeTimer}
            onStartTimer={handleStartTimer}
            onPauseTimer={handlePauseTimer}
            onResumeTimer={handleResumeTimer}
            onStopTimer={handleStopTimer}
          />
        ) : (
          <div className="p-8 max-w-xl mx-auto text-center space-y-4" data-testid="recipe-unavailable-notice">
            <h2 className="text-xl font-bold">Блюдо недоступно</h2>
            <p className="text-sm text-stone-600">
              {!activeRecipe
                ? 'Рецепт сейчас недоступен. Вернитесь к меню и выберите другое блюдо.'
                : 'Выбранное блюдо не подходит под ваши настройки питания.'}
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

      {currentScreen === 'shopping' && currentRoute.recipeId && (
        <ShoppingScreen
          key={currentRoute.recipeId}
          items={shoppingItems.filter(item => item.id.startsWith(recipeShoppingPrefix(currentRoute.recipeId ?? '')))}
          menuTitle={activeRecipe?.title ?? 'Покупки для блюда'}
          addedRecipeYield={recipeShoppingConfirmation?.recipeId === currentRoute.recipeId && recipeShoppingConfirmation.saved
            ? recipeShoppingConfirmation.yieldNote : undefined}
          isStaleAfterMenuEdit={false}
          onRefreshShoppingFromMenu={onRefreshShopping}
          onToggleCheckedInStore={onToggleCheckedInStore}
          onToggleAlreadyHave={onToggleAlreadyHave}
        />
      )}

      {(currentScreen === 'shopping' || visited.has('shopping')) && (
        <div hidden={currentScreen !== 'shopping' || Boolean(currentRoute.recipeId)}>
        <ShoppingScreen
          items={shoppingItems}
          menuTitle={state.menu ? (isLegacyPlan ? 'Сохранённое меню' : 'Кето-рацион') : 'Список покупок'}
          isStaleAfterMenuEdit={state.shopping_stale}
          onRefreshShoppingFromMenu={onRefreshShopping}
          portionsMultiplier={state.shopping_batches}
          onChangePortionsMultiplier={onChangeBatches}
          onToggleCheckedInStore={onToggleCheckedInStore}
          onToggleAlreadyHave={onToggleAlreadyHave}
          onAddCustomItem={onAddCustomItem}
          menuDays={state.menu?.days}
          recipesById={recipesById}
          savedRange={state.shopping_range}
          onSelectRange={onSelectShoppingRange}
          rangeCheckmarks={state.shopping_range_checked}
          onToggleRangeChecked={onToggleRangeChecked}
        />
        </div>
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
          <PrivateSupportPage sessionToken={sessionToken} />
        </div>
      )}

      {currentScreen === 'more' && (
        <div className="ff-more" data-testid="more-screen">
          <h1>Ещё</h1>
          <section aria-label="Настройки и помощь">
            <h2>Твоё питание</h2>
            {onOpenSettings && <button type="button" className="ff-more-link" data-testid="more-open-settings-btn" onClick={() => onOpenSettings()}>Настройки питания<span aria-hidden="true">→</span></button>}
            <button type="button" className="ff-more-link" data-testid="more-open-progress" onClick={() => navigateTo('progress')}>Мой прогресс · вес и объёмы<span aria-hidden="true">→</span></button>
            <DailyTip showButton={true} />
            <button type="button" className="ff-more-link" data-testid="more-open-lifehacks" onClick={() => navigateTo('lifehacks')}>Лайфхаки · биодобавки<span aria-hidden="true">→</span></button>
            <button type="button" className="ff-more-link" onClick={() => navigateTo('support')}>Помощь и личный вопрос Ольге<span aria-hidden="true">→</span></button>
          </section>
          <section className="ff-access" aria-label="Аккаунт и доступ">
            <p className="ff-kicker">Аккаунт и доступ</p>
            <h2>{isPremium ? 'Подписка активна' : 'Базовый доступ'}</h2>
            {isPremium && localSubscription?.expires_at && <p>Действует до {new Date(localSubscription.expires_at).toLocaleDateString('ru-RU')}</p>}
            <button type="button" className="ff-action" data-testid="more-open-paywall-btn" onClick={handleOpenPaywall}>Условия доступа и подписка</button>
          </section>
          <KetoRules />
          <PrivacyInfo />
          <EducationGuides sessionToken={sessionToken} onOpenSettings={onOpenSettings} onNavigate={navigateTo} />
        </div>
      )}


      {(['rules', 'education', 'guides'] as const).map(screen =>
        (currentScreen === screen || visited.has(screen)) && (
          <div key={screen} hidden={currentScreen !== screen} className="ff-more" data-testid={`${screen}-screen`}>
            <h1>{screen === 'rules' ? 'Правила кето' : screen === 'education' ? 'Обучение' : 'Микрогайды'}</h1>
            {screen === 'education' && (
              <section className="ff-client-info" aria-label="Как пользоваться КетоБалансом">
                <h2>Как пользоваться КетоБалансом</h2>
                <ol>
                  <li>Отметьте продукты, которые нужно исключить, в настройках питания.</li>
                  <li>Откройте КетоКомпас или каталог и выберите рецепт.</li>
                  <li>Укажите количество порций, затем откройте покупки через меню.</li>
                </ol>
                <button type="button" className="ff-proof__help-btn" onClick={() => navigateTo('rules')}>Посмотреть правила кето</button>
              </section>
            )}
            {screen === 'rules' ? <KetoRules initiallyOpen /> : <EducationGuides kind={screen} active={currentScreen === screen} onDetailChange={registerLearningBack} sessionToken={sessionToken} onOpenSettings={onOpenSettings} onNavigate={navigateTo} />}
          </div>
        )
      )}

      {(currentScreen === 'progress' || currentScreen === 'diary' || visited.has('progress') || visited.has('diary')) && <div hidden={currentScreen !== 'progress' && currentScreen !== 'diary'}><Progress key={sessionToken || 'anonymous'} sessionToken={sessionToken} active={currentScreen === 'progress' || currentScreen === 'diary'} /></div>}

      {(currentScreen === 'lifehacks' || visited.has('lifehacks')) && <div hidden={currentScreen !== 'lifehacks'}><Lifehacks /></div>}

      <PaywallModal
        isOpen={isPaywallOpen}
        onClose={handleClosePaywall}
        onSuccess={handlePaymentSuccess}
        sessionToken={sessionToken}
        currentTier={localSubscription?.tier}
        availableProducts={localSubscription?.available_products}
        paymentsEnabled={localSubscription?.payments_enabled}
      />

      {showFloatingTimer && activeTimer && (
        <KitchenTimerWidget
          timer={activeTimer}
          onOpenRecipe={handleOpenRecipe}
          onPauseTimer={handlePauseTimer}
          onResumeTimer={handleResumeTimer}
          onStopTimer={handleStopTimer}
        />
      )}
    </AppShell>
  );
}
