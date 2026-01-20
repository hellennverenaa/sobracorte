import { ref } from 'vue'

// ATENÇÃO: Se o seu IP mudar, mude APENAS AQUI.
const API_URL = 'http://10.110.20.66:3001' 

export function useApi() {
  const error = ref(null)
  const isLoading = ref(false)

  // Função Genérica "Carteiro" (Essa é a que estava faltando exportar ou estava quebrada)
  async function request(endpoint, options = {}) {
    isLoading.value = true
    error.value = null
    
    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        },
        ...options
      })

      if (!response.ok) {
        throw new Error(`Erro na requisição: ${response.statusText}`)
      }

      // Tenta ler como JSON, se não der, retorna vazio
      const text = await response.text()
      return text ? JSON.parse(text) : {}
      
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      isLoading.value = false
    }
  }

  // Funções Específicas (Usam o carteiro acima)
  const fetchMaterials = () => request('/materials')
  
  const createMaterial = (data) => request('/materials', {
    method: 'POST',
    body: JSON.stringify(data)
  })

  const updateMaterial = (id, data) => request(`/materials/${id}`, {
    method: 'PUT', // ou PATCH
    body: JSON.stringify(data)
  })

  const deleteMaterial = (id) => request(`/materials/${id}`, {
    method: 'DELETE'
  })
  
  const fetchStats = async () => {
    // Implementação simplificada para dashboard
    const materials = await fetchMaterials()
    const list = Array.isArray(materials) ? materials : (materials.materials || [])
    return {
      totalMaterials: list.length,
      lowStock: list.filter(m => Number(m.quantidade) < 10).length,
      totalMovements: 0, // Placeholder
      totalEntries: 0    // Placeholder
    }
  }
  
  const createMovement = (data) => request('/movements', {
    method: 'POST',
    body: JSON.stringify({ ...data, data: new Date().toISOString() })
  })

  const fetchMovements = () => request('/movements?_sort=data&_order=desc')

  // IMPORTANTE: Retornar o 'request' aqui embaixo
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