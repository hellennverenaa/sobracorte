import { ref } from 'vue'

// TRUQUE: Mesmo esquema, pega o IP automaticamente
const HOST = window.location.hostname
const API_URL = `http://${HOST}:3001`
//http://10.110.21.53:3001

export function useApi() {
  const error = ref(null)
  const isLoading = ref(false)

  async function request(endpoint, options = {}) {
    isLoading.value = true
    error.value = null
    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        headers: { 'Content-Type': 'application/json', ...options.headers },
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
  
  const createMaterial = (data) => request('/materials', {
    method: 'POST',
    body: JSON.stringify(data)
  })

  const updateMaterial = (id, data) => request(`/materials/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  })

  const deleteMaterial = (id) => request(`/materials/${id}`, { method: 'DELETE' })
  
  const createMovement = (data) => request('/movements', {
    method: 'POST',
    body: JSON.stringify({ ...data, data: new Date().toISOString() })
  })

  const fetchMovements = () => request('/movements?_sort=data&_order=desc')

  const fetchStats = async () => {
    try {
      const [materialsData, movementsData] = await Promise.all([
        fetchMaterials(),
        request('/movements')
      ])

      const matList = Array.isArray(materialsData) ? materialsData : (materialsData.materials || [])
      const movList = Array.isArray(movementsData) ? movementsData : (movementsData.movements || [])

      return {
        totalMaterials: matList.length,
        lowStock: matList.filter(m => Number(m.quantidade) < 10).length,
        totalMovements: movList.length,
        totalEntries: movList.filter(m => m.tipo === 'entrada').length
      }
    } catch (e) {
      console.error("Erro ao calcular estatísticas", e)
      return { totalMaterials: 0, lowStock: 0, totalMovements: 0, totalEntries: 0 }
    }
  }
  
  return {
    request, 
    fetchMaterials,
    createMaterial,
    updateMaterial,
    deleteMaterial,
    fetchStats,
    createMovement,
    fetchMovements,
    isLoading,
    error
  }
}