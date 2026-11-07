import {
  generateMenu, replacementCandidates, type GenerateMenuOptions,
} from '../domain/menu';
import type { Recipe, UserProfile } from '../domain/types';
import { selectReleasedRecipes } from '../domain/releaseCatalog';
import { RECIPES } from '../data/recipes';
import { RELEASED_RECIPE_IDS, PREVIEW_RECIPE_IDS } from '../data/releasedRecipeIds';

export interface ReplacementRequest {
  currentId: string;
  dayIds: string[];
  profile?: UserProfile | null;
  preferredCat?: string;
  mode: 'keto' | 'carnivore';
}

export function createMenuController(
  catalog: readonly Recipe[],
  releasedIds: readonly string[],
  options?: { isPreview?: boolean; previewPool?: readonly string[]; catalogId?: string }
) {
  const getEffectiveIds = () => {
    if (releasedIds.length > 0) return releasedIds;
    if (options?.isPreview) {
      const pool = options.previewPool || PREVIEW_RECIPE_IDS;
      return pool.filter((id) => catalog.some((r) => r.id === id));
    }
    return releasedIds;
  };
  const getReleasedRecipes = () => selectReleasedRecipes(catalog, getEffectiveIds());
  return {
    getReleasedRecipes,
    createUserMenu(opts: GenerateMenuOptions) {
      return generateMenu(getReleasedRecipes(), {
        ...opts,
        catalogId: opts.catalogId || options?.catalogId || "released-catalog-202611-v1",
      });
    },
    createUserReplacementCandidates(request: ReplacementRequest) {
      const recipes = getReleasedRecipes();
      if (request.mode !== 'keto' && request.mode !== 'carnivore') {
        throw new Error('Недопустимый режим замены.');
      }
      if (!recipes.some((recipe) => recipe.id === request.currentId)) {
        throw new Error('Текущее блюдо больше не допущено; пересобери меню.');
      }
      return replacementCandidates(
        request.currentId, request.dayIds, recipes,
        request.profile, request.preferredCat, request.mode
      );
    },
  };
}

const liveController = createMenuController(RECIPES, RELEASED_RECIPE_IDS);
export const createUserMenu = liveController.createUserMenu;
export const createUserReplacementCandidates =
  liveController.createUserReplacementCandidates;
export const getReleasedRecipes = liveController.getReleasedRecipes;

const previewController = createMenuController(RECIPES, PREVIEW_RECIPE_IDS);
export const createPreviewUserMenu = previewController.createUserMenu;
export const createPreviewReplacementCandidates =
  previewController.createUserReplacementCandidates;
export const getPreviewReleasedRecipes = previewController.getReleasedRecipes;
