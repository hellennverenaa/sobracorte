import { ref } from 'vue'

const HOST = window.location.hostname
const API_URL = `http://${HOST}:3001`
////http://10.110.21.53:3001

export function useApi() {
  const error = ref(null)
  const isLoading = ref(false)

  // Função base
  async function request(endpoint, options = {}) {
    isLoading.value = true
    error.value = null
    try {
      const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
      const separator = cleanEndpoint.includes('?') ? '&' : '?'
      const timestamp = new Date().getTime()
      const url = `${API_URL}${cleanEndpoint}${separator}t=${timestamp}`
      
      const response = await fetch(url, {
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
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

  // --- MATERIAIS & MOVIMENTAÇÃO (JÁ EXISTIAM) ---
  async function fetchCount(resource, filters = '') {
    try {
      const t = new Date().getTime()
      const url = `${API_URL}/${resource}?_page=1&_limit=1&${filters}&t=${t}`
      const response = await fetch(url)
      const totalHeader = response.headers.get('X-Total-Count')
      if (totalHeader) return Number(totalHeader)
      
      const fallback = await fetch(`${API_URL}/${resource}?${filters}&t=${t}`)
      const data = await fallback.json()
      return Array.isArray(data) ? data.length : 0
    } catch (e) { return 0 }
  }

  const fetchMaterials = (params = '') => request(`/materials?_sort=data_cadastro&_order=desc&${params}`)
  const createMaterial = (data) => request('/materials', { method: 'POST', body: JSON.stringify(data) })
  const updateMaterial = (id, data) => request(`/materials/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
  const deleteMaterial = (id) => request(`/materials/${id}`, { method: 'DELETE' })
  
  const createMovement = (data) => request('/movements', { method: 'POST', body: JSON.stringify({ ...data, data: new Date().toISOString() }) })
  const fetchMovements = () => request('/movements?_sort=id&_order=desc&_limit=200')

  const fetchStats = async () => {
    try {
      const [totalMaterials, lowStock, totalMovements, totalEntries] = await Promise.all([
        fetchCount('materials'),
        fetchCount('materials', 'quantidade_lte=10'),
        fetchCount('movements'),
        fetchCount('movements', 'tipo=entrada')
      ])
      return { totalMaterials, lowStock, totalMovements, totalEntries }
    } catch (e) { return { totalMaterials: 0, lowStock: 0, totalMovements: 0, totalEntries: 0 } }
  }

  // --- NOVAS FUNÇÕES DE USUÁRIOS ---
  const fetchUsers = () => request('/users')
  const updateUser = (id, data) => request(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
  const deleteUser = (id) => request(`/users/${id}`, { method: 'DELETE' })
  
  return {
    request, fetchMaterials, createMaterial, updateMaterial, deleteMaterial,
    fetchStats, createMovement, fetchMovements,
    // Exportando as novas:
    fetchUsers, updateUser, deleteUser,
    isLoading, error
  }
}