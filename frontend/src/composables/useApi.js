import { ref } from 'vue'
import { api } from '../services/httpClient'

const emptyStats = () => ({ totalMaterials: 0, lowStock: 0, totalMovements: 0, totalEntries: 0 })

export function useApi() {
  const error = ref(null)
  const isLoading = ref(false)

  async function request(endpoint, options = {}) {
    isLoading.value = true
    error.value = null

    try {
      const response = await api.request({
        url: endpoint,
        method: options.method || 'GET',
        data: options.data,
        headers: options.headers,
        params: options.params
      })
      return response.data ?? {}
    } catch (requestError) {
      error.value = requestError.response?.data?.error
        || requestError.response?.data?.message
        || requestError.message
      throw requestError
    } finally {
      isLoading.value = false
    }
  }

  async function fetchStats() {
    try {
      const response = await api.get('/stats')
      return response.data ?? emptyStats()
    } catch (requestError) {
      if (requestError.response?.status !== 429) {
        console.error('Erro ao buscar estatísticas.')
      }
      return emptyStats()
    }
  }

  return {
    request,
    fetchStats,
    fetchDistribuicao: () => request('/dashboard/distribuicao'),
    fetchOrigemSobras: () => request('/dashboard/origem-sobras'),
    fetchTopMateriais: () => request('/dashboard/top-materiais'),
    isLoading,
    error
  }
}
