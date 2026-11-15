import type { PilotCatalogV1 } from '../api/pilotTypes';

type MonthlyCatalogMetadata = {
  catalog_id: string;
  catalog_month?: string;
  accessible: boolean;
};

/** New monthly plans require an exact, explicitly accessible registry entry. */
export async function loadMonthlyCatalog(
  month: string | undefined,
  registry: readonly MonthlyCatalogMetadata[],
  current: PilotCatalogV1,
  fetchCatalog: (id: string) => Promise<PilotCatalogV1>,
): Promise<PilotCatalogV1> {
  const metadata = month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)
    ? registry.find(entry => entry.catalog_month === month)
    : undefined;
  if (!metadata?.catalog_id || metadata.accessible !== true) {
    throw new Error('Месячная подборка не подтверждена или недоступна.');
  }
  const selected = current.catalog_id === metadata.catalog_id
    ? current
    : await fetchCatalog(metadata.catalog_id);
  if (!selected || selected.catalog_id !== metadata.catalog_id ||
      selected.catalog_month !== month || selected.access === 'preview' ||
      !Array.isArray(selected.recipes) || selected.recipes.length === 0) {
    throw new Error('Ответ каталога не соответствует выбранному месяцу.');
  }
  return selected;
}
