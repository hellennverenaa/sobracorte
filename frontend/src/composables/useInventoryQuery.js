import { computed, ref, watch } from 'vue';
import { usePersistedFilters } from './usePersistedFilters';

export function useInventoryQuery(stockStore, authStore, route, initialSector) {
  const { filters, resetFilters } = usePersistedFilters('inventory', {
    search: '', location: '', type: '', stockStatus: '', pageSize: 50, sector: initialSector,
  }, () => authStore.user?.unit?.code || '');
  if (route.query.q !== undefined) filters.value.search = String(route.query.q);
  if (route.query.sector) filters.value.sector = initialSector;
  const search = computed({ get: () => filters.value.search, set: (value) => { filters.value.search = value; } });
  const selectedLocationFilter = computed({ get: () => filters.value.location, set: (value) => { filters.value.location = value; } });
  const selectedTypeFilter = computed({ get: () => filters.value.type, set: (value) => { filters.value.type = value; } });
  const stockStatusFilter = computed({ get: () => filters.value.stockStatus, set: (value) => { filters.value.stockStatus = value; } });
  const pageSize = computed({
    get: () => [50, 100, 200].includes(Number(filters.value.pageSize)) ? Number(filters.value.pageSize) : 50,
    set: (value) => { filters.value.pageSize = [50, 100, 200].includes(Number(value)) ? Number(value) : 50; },
  });
  const activeTab = ref(filters.value.sector);
  const currentPage = ref(Number(route.query.page) || 1);
  watch(activeTab, (sector, previousSector) => {
    filters.value.sector = sector;
    if (previousSector && previousSector !== sector) {
      filters.value.location = '';
      filters.value.type = '';
    }
  }, { flush: 'sync' });
  async function loadData(page = currentPage.value) {
    currentPage.value = page;
    await stockStore.fetchInventory({
      q: search.value,
      sector: activeTab.value,
      page,
      limit: pageSize.value,
      locationId: selectedLocationFilter.value ? Number(selectedLocationFilter.value) : undefined,
      type: selectedTypeFilter.value || undefined,
      stockStatus: stockStatusFilter.value || undefined,
    });
  }
  return {
    search,
    selectedLocationFilter,
    selectedTypeFilter,
    stockStatusFilter,
    pageSize,
    activeTab,
    currentPage,
    loadData,
    resetFilters,
  };
}
