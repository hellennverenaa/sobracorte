import { ref } from 'vue'
import { api } from '../services/httpClient'

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
        params: options.params,
        signal: options.signal
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

  async function fetchDashboardSummary(options = {}) {
    const response = await api.get('/dashboard/summary', { signal: options.signal })
    return response.data?.data ?? response.data
  }

  return {
    request,
    fetchDashboardSummary,
    isLoading,
    error
  }
}
