import { computed, ref } from 'vue'
import { api } from '../services/httpClient'
import { requestErrorMessage } from '../utils/domain'

/** Shared settings data queries. Mutating actions remain in Settings.vue so
 * the confirmation policy stays visible at the call site. */
export function useSettings({ notify = () => {} } = {}) {
  const categories = ref([])
  const units = ref([])
  const locations = ref([])
  const origins = ref([])
  const loadingCategory = ref(false)
  const loadingUnit = ref(false)
  const loadingLocation = ref(false)
  const loadingOrigin = ref(false)
  const error = ref('')

  async function fetchCollection(target, loading, endpoint, message) {
    loading.value = true
    error.value = ''
    try {
      const response = await api.get(endpoint)
      target.value = response.data || []
      return target.value
    } catch (requestError) {
      console.error(`Erro ao carregar ${endpoint}:`, requestError)
      error.value = requestErrorMessage(requestError, message)
      notify(error.value, 'error')
      return null
    } finally {
      loading.value = false
    }
  }

  const fetchCategories = () => fetchCollection(categories, loadingCategory, '/settings/categories', 'Erro ao carregar categorias.')
  const fetchUnits = () => fetchCollection(units, loadingUnit, '/settings/units', 'Erro ao carregar unidades de medida.')
  const fetchLocations = () => fetchCollection(locations, loadingLocation, '/settings/locations', 'Erro ao carregar localizações.')
  const fetchOrigins = () => fetchCollection(origins, loadingOrigin, '/settings/origins', 'Erro ao carregar origens.')

  const loading = computed(() => loadingCategory.value || loadingUnit.value || loadingLocation.value || loadingOrigin.value)
  async function fetchAll() {
    return Promise.all([fetchCategories(), fetchUnits(), fetchLocations(), fetchOrigins()])
  }

  return {
    categories, units, locations, origins,
    loadingCategory, loadingUnit, loadingLocation, loadingOrigin, loading, error,
    fetchCategories, fetchUnits, fetchLocations, fetchOrigins, fetchAll,
  }
}
