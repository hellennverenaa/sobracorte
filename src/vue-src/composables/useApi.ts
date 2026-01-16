import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'

const API_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/make-server-ed830bfb`
const publicAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export function useApi() {
  const authStore = useAuthStore()
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  async function request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
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

      return data as T
    } catch (err: any) {
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
  async function fetchMaterials(filters?: { tipo?: string; search?: string }) {
    const params = new URLSearchParams()
    if (filters?.tipo) params.append('tipo', filters.tipo)
    if (filters?.search) params.append('search', filters.search)
    
    const query = params.toString() ? `?${params}` : ''
    return request(`/materials${query}`)
  }

  async function createMaterial(material: any) {
    return request('/materials', {
      method: 'POST',
      body: JSON.stringify(material)
    })
  }

  async function updateMaterial(id: string, material: any) {
    return request(`/materials/${id}`, {
      method: 'PUT',
      body: JSON.stringify(material)
    })
  }

  async function deleteMaterial(id: string) {
    return request(`/materials/${id}`, {
      method: 'DELETE'
    })
  }

  // Transactions
  async function fetchTransactions(filters?: { tipo?: string; material_id?: string }) {
    const params = new URLSearchParams()
    if (filters?.tipo) params.append('tipo', filters.tipo)
    if (filters?.material_id) params.append('material_id', filters.material_id)
    
    const query = params.toString() ? `?${params}` : ''
    return request(`/transactions${query}`)
  }

  async function createTransaction(transaction: any) {
    return request('/transactions', {
      method: 'POST',
      body: JSON.stringify(transaction)
    })
  }

  // Admin - Users
  async function fetchUsers() {
    return request('/admin/users')
  }

  async function updateUserRole(userId: string, role: 'admin' | 'operador') {
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
