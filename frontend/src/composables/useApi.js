import { ref } from 'vue'

import { api } from "../utils/ip"

export function useApi() {
  const error = ref(null)
  const isLoading = ref(false)

  async function request(endpoint, options = {}) {
    isLoading.value = true
    error.value = null
    try {
      const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
      const separator = cleanEndpoint.includes('?') ? '&' : '?'
      const timestamp = new Date().getTime()
      const url = `${api}${cleanEndpoint}${separator}t=${timestamp}`

      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          ...options.headers
        },
        ...options
      })

      if (!response.ok) throw new Error(`Erro: ${response.statusText}`)
      const text = await response.text()
      return text ? JSON.parse(text) : {}
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const fetchMaterials = () => request('/materials')
  const createMaterial = (data) => request('/materials', { method: 'POST', body: JSON.stringify(data) })
  const updateMaterial = (id, data) => request(`/materials/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
  const deleteMaterial = (id) => request(`/materials/${id}`, { method: 'DELETE' })

  const fetchStats = async () => {
    try {
      // Agora o Vue bate direto no cofre blindado pedindo os números mastigados!
      const t = new Date().getTime();
      const response = await fetch(`${api}/stats?t=${t}`);

      if (!response.ok) throw new Error('Erro ao buscar stats');
      return await response.json();

    } catch (e) {
      return { totalMaterials: 0, lowStock: 0, totalMovements: 0, totalEntries: 0 }
    }
  }

  const createMovement = (data) => request('/movements', { method: 'POST', body: JSON.stringify(data) })
  const fetchMovements = () => request('/movements')

  const fetchLocations = () => request('/locations')

  return {
    request, fetchMaterials, createMaterial, updateMaterial, deleteMaterial,
    fetchStats, createMovement, fetchMovements, fetchLocations,
    isLoading, error
  }
}