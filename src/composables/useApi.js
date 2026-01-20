import { ref } from 'vue'

// SEU IP (Mantenha o que estava funcionando)
const API_URL = 'http://10.110.21.53:3001' 
//
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

  // Função essencial para atualizar o estoque
  const updateMaterial = (id, data) => request(`/materials/${id}`, {
    method: 'PUT', // Atualiza o objeto completo
    body: JSON.stringify(data)
  })

  const deleteMaterial = (id) => request(`/materials/${id}`, { method: 'DELETE' })
  
  const createMovement = (data) => request('/movements', {
    method: 'POST',
    body: JSON.stringify({ ...data, data: new Date().toISOString() })
  })

  const fetchMovements = () => request('/movements?_sort=data&_order=desc')

  // --- CORREÇÃO DO DASHBOARD ---
  // Agora calculamos os totais reais buscando as movimentações
  const fetchStats = async () => {
    try {
      // Busca materiais e movimentos em paralelo
      const [materialsData, movementsData] = await Promise.all([
        fetchMaterials(),
        request('/movements') // Busca todos sem filtro para contar
      ])

      const matList = Array.isArray(materialsData) ? materialsData : (materialsData.materials || [])
      const movList = Array.isArray(movementsData) ? movementsData : (movementsData.movements || [])

      return {
        totalMaterials: matList.length,
        lowStock: matList.filter(m => Number(m.quantidade) < 10).length,
        // Agora conta de verdade:
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
    updateMaterial, // Precisamos dessa função exportada!
    deleteMaterial,
    fetchStats,
    createMovement,
    fetchMovements,
    isLoading,
    error
  }
}