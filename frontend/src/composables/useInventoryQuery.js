import { computed, ref, watch } from 'vue';
import { usePersistedFilters } from './usePersistedFilters';

export function useInventoryQuery(stockStore, authStore, route, initialSector) {
  const { filters, resetFilters } = usePersistedFilters('inventory', {
    search: '', location: '', sector: initialSector,
  }, () => authStore.user?.unit?.code || '');
  if (route.query.q !== undefined) filters.value.search = String(route.query.q);
  if (route.query.sector) filters.value.sector = initialSector;
  const search = computed({ get: () => filters.value.search, set: (value) => { filters.value.search = value; } });
  const selectedLocationFilter = computed({ get: () => filters.value.location, set: (value) => { filters.value.location = value; } });
  const activeTab = ref(filters.value.sector);
  const currentPage = ref(Number(route.query.page) || 1);
  watch(activeTab, (sector) => { filters.value.sector = sector; });
  async function loadData(page = currentPage.value) {
    currentPage.value = page;
    await stockStore.fetchInventory({ q: search.value, sector: activeTab.value, page, limit: 50 });
  }
  return { search, selectedLocationFilter, activeTab, currentPage, loadData, resetFilters };
}
