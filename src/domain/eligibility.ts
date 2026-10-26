import type { Recipe, UserProfile } from "./types";

export function normalizeStr(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type AllergyCategory = "eggs" | "dairy" | "fish" | "nuts";

const KNOWN_ALLERGY_MAP: Record<string, AllergyCategory> = {
  "яйца": "eggs",
  "яйцо": "eggs",
  "яйца куриные": "eggs",
  "яица": "eggs",
  "яицо": "eggs",
  "яичные": "eggs",
  "яица куриные": "eggs",
  "egg": "eggs",
  "eggs": "eggs",

  "молочные продукты": "dairy",
  "молочные": "dairy",
  "молочка": "dairy",
  "молоко": "dairy",
  "лактоза": "dairy",
  "dairy": "dairy",
  "milk": "dairy",

  "рыба": "fish",
  "рыбные продукты": "fish",
  "рыбные": "fish",
  "fish": "fish",

  "орехи": "nuts",
  "орех": "nuts",
  "nuts": "nuts",
  "nut": "nuts",
};

const DAIRY_KEYWORDS = [
  "сыр",
  "сливк",
  "сметан",
  "творог",
  "моцарелл",
  "сливочное масло",
  "топленое масло",
  "топлен",
  "молок",
  "лактоз",
  "маскарпон",
  "пармезан",
  "рикотт",
  "сулугун",
  "брынз",
  "йогурт",
  "кефир",
  "ряженк",
];

const FISH_KEYWORDS = [
  "горбуш",
  "скумбри",
  "семг",
  "тунец",
  "рыб",
  "лосос",
  "треск",
  "форел",
  "минтай",
  "сельд",
  "селедк",
  "шпрот",
  "сардин",
];

const NUTS_KEYWORDS = [
  "орех",
  "миндал",
  "фундук",
  "кешью",
  "пекан",
  "грецк",
  "арахис",
  "фисташк",
  "макадам",
];

function containsAnyKeyword(text: string, keywords: string[]): boolean {
  return keywords.some(kw => text.includes(kw));
}

function ingredientHasAllergen(ingNorm: string, cat: AllergyCategory): boolean {
  switch (cat) {
    case "eggs":
      return ingNorm.includes("яиц") || ingNorm.includes("яичн") || ingNorm.includes("яйц");
    case "dairy":
      return containsAnyKeyword(ingNorm, DAIRY_KEYWORDS);
    case "fish":
      return containsAnyKeyword(ingNorm, FISH_KEYWORDS);
    case "nuts":
      return containsAnyKeyword(ingNorm, NUTS_KEYWORDS);
  }
}

function ingredientHasDisliked(ingNorm: string, disNorm: string): boolean {
  if (disNorm === "печень и субпродукты" || disNorm === "субпродукты" || disNorm === "печень") {
    return (
      ingNorm.includes("печень") ||
      ingNorm.includes("сердц") ||
      ingNorm.includes("субпродукт") ||
      ingNorm.includes("костный бульон")
    );
  }
  if (disNorm === "грибы" || disNorm === "гриб") {
    return ingNorm.includes("гриб") || ingNorm.includes("шампиньон");
  }
  if (disNorm === "рыба") {
    return containsAnyKeyword(ingNorm, FISH_KEYWORDS);
  }
  if (disNorm === "авокадо") {
    return ingNorm.includes("авокадо");
  }
  if (disNorm === "брокколи") {
    return ingNorm.includes("брокколи");
  }
  if (disNorm === "лук") {
    return ingNorm === "лук" || ingNorm.startsWith("лук ") || ingNorm.includes(" лук");
  }
  if (disNorm === "болгарский перец" || disNorm === "перец") {
    return ingNorm.includes("болгарский перец") || ingNorm.includes("перец болгарский");
  }
  if (disNorm === "морепродукты" || disNorm === "морепродукт") {
    return (
      ingNorm.includes("креветк") ||
      ingNorm.includes("кальмар") ||
      ingNorm.includes("миди") ||
      ingNorm.includes("осьминог") ||
      ingNorm.includes("гребешк") ||
      ingNorm.includes("морепродукт")
    );
  }
  // Для прочих пользовательских продуктов
  return ingNorm.includes(disNorm);
}

export function isRecipeAllowed(recipe: Recipe, profile?: UserProfile | null): boolean {
  // 1. Проверка валидности рецепта и непроверенного состава
  if (!recipe || typeof recipe !== "object") return false;
  if (!recipe.id || typeof recipe.id !== "string") return false;
  if (!recipe.title || typeof recipe.title !== "string") return false;
  if (recipe.mode !== "keto" && recipe.mode !== "carnivore") return false;
  if (recipe.kcal !== undefined && (typeof recipe.kcal !== "number" || isNaN(recipe.kcal) || recipe.kcal < 0)) return false;
  if (recipe.p !== undefined && (typeof recipe.p !== "number" || isNaN(recipe.p) || recipe.p < 0)) return false;
  if (recipe.f !== undefined && (typeof recipe.f !== "number" || isNaN(recipe.f) || recipe.f < 0)) return false;
  if (recipe.nc !== undefined && (typeof recipe.nc !== "number" || isNaN(recipe.nc) || recipe.nc < 0)) return false;
  if (!Array.isArray(recipe.ing) || recipe.ing.length === 0) return false;

  for (const item of recipe.ing) {
    if (!Array.isArray(item) || item.length < 2) return false;
    const [ingName, ingAmt] = item;
    if (typeof ingName !== "string" || !ingName.trim()) return false;
    const normName = ingName.toLowerCase();
    if (normName.includes("[уточнить]") || normName.includes("[уточнить")) return false;
    if (typeof ingAmt === "string" && (ingAmt.toLowerCase().includes("[уточнить]") || ingAmt.toLowerCase().includes("[уточнить"))) return false;
  }

  if (!profile) return true;

  // 2. Проверка повреждённых ограничений в профиле
  if (profile.allergyNote !== undefined && profile.allergyNote !== null) {
    if (typeof profile.allergyNote !== "string") return false;
    if (profile.allergyNote.trim().length > 0) return false;
  }

  if (profile.allergies !== undefined && profile.allergies !== null) {
    if (!Array.isArray(profile.allergies)) return false;
    for (const a of profile.allergies) {
      if (typeof a !== "string") return false;
    }
  }

  if (profile.disliked !== undefined && profile.disliked !== null) {
    if (!Array.isArray(profile.disliked)) return false;
    for (const d of profile.disliked) {
      if (typeof d !== "string") return false;
    }
  }

  // 3. Проверка аллергий
  const allergies = Array.isArray(profile.allergies) ? profile.allergies : [];
  const activeCategories: AllergyCategory[] = [];
  
  for (const rawAllergy of allergies) {
    const norm = normalizeStr(rawAllergy);
    if (!norm) continue;
    const category = KNOWN_ALLERGY_MAP[norm];
    if (!category) {
      // Неизвестная категория аллергии запрещает автоматический подбор
      return false;
    }
    if (!activeCategories.includes(category)) {
      activeCategories.push(category);
    }
  }

  const disliked = Array.isArray(profile.disliked) ? profile.disliked : [];
  const normDisliked = disliked
    .map(d => (typeof d === "string" ? normalizeStr(d) : ""))
    .filter(Boolean);

  // 4. Проверяем ингредиенты рецепта
  for (const [ingName] of recipe.ing) {
    const ingNorm = normalizeStr(ingName);

    // При активных аллергиях непроверенный/неизвестный состав блокирует рекомендацию
    if (activeCategories.length > 0) {
      if (
        ingNorm.includes("неизвестн") ||
        ingNorm.includes("состав") ||
        ingNorm.includes("непроверен") ||
        ingNorm.includes("не проверен") ||
        ingNorm.includes("секретн")
      ) {
        return false;
      }
    }

    for (const cat of activeCategories) {
      if (ingredientHasAllergen(ingNorm, cat)) {
        return false;
      }
    }

    for (const dis of normDisliked) {
      if (ingredientHasDisliked(ingNorm, dis)) {
        return false;
      }
    }
  }

  return true;
}
