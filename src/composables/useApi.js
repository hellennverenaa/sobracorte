import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'

const API_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/make-server-ed830bfb`
const publicAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export function useApi() {
  const authStore = useAuthStore()
  const isLoading = ref(false)
  const error = ref(null)

  async function request(endpoint, options = {}) {
    isLoading.value = true
    error.value = null

    try {
      const token = authStore.token || publicAnonKey
      
      const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-Access-Token': authStore.token || '',
          ...options.headers
        }
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro na requisição')
      }

      return data
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      isLoading.value = false
    }
  }

  // Stats
  async function fetchStats() {
    return request('/stats')
  }

  // Materials
  async function fetchMaterials(filters) {
    const params = new URLSearchParams()
    if (filters?.tipo) params.append('tipo', filters.tipo)
    if (filters?.search) params.append('search', filters.search)
    
    const query = params.toString() ? `?${params}` : ''
    return request(`/materials${query}`)
  }

  async function createMaterial(material) {
    return request('/materials', {
      method: 'POST',
      body: JSON.stringify(material)
    })
  }

  async function updateMaterial(id, material) {
    return request(`/materials/${id}`, {
      method: 'PUT',
      body: JSON.stringify(material)
    })
  }

  async function deleteMaterial(id) {
    return request(`/materials/${id}`, {
      method: 'DELETE'
    })
  }

  // Transactions
  async function fetchTransactions(filters) {
    const params = new URLSearchParams()
    if (filters?.tipo) params.append('tipo', filters.tipo)
    if (filters?.material_id) params.append('material_id', filters.material_id)
    
    const query = params.toString() ? `?${params}` : ''
    return request(`/transactions${query}`)
  }

  async function createTransaction(transaction) {
    return request('/transactions', {
      method: 'POST',
      body: JSON.stringify(transaction)
    })
  }

  // Admin - Users
  async function fetchUsers() {
    return request('/admin/users')
  }

  async function updateUserRole(userId, role) {
    return request(`/admin/users/${userId}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role })
    })
  }

  return {
    isLoading,
    error,
    request,
    fetchStats,
    fetchMaterials,
    createMaterial,
    updateMaterial,
    deleteMaterial,
    fetchTransactions,
    createTransaction,
    fetchUsers,
    updateUserRole
  }
}
