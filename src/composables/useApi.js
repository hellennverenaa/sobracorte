import { ref } from 'vue'

const HOST = window.location.hostname
const API_URL = `http://${HOST}:3001`
////http://10.110.21.53:3001

export function useApi() {
  const error = ref(null)
  const isLoading = ref(false)

  // Função base de requisição
  async function request(endpoint, options = {}) {
    isLoading.value = true
    error.value = null
    try {
      const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
      
      // MANTIDO O ANTI-CACHE (Essencial para você ver os dados novos)
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

  async function fetchCount(resource, filters = '') {
    try {
      const t = new Date().getTime()
      const url = `${API_URL}/${resource}?_page=1&_limit=1&${filters}&t=${t}`
      
      const response = await fetch(url)
      const totalHeader = response.headers.get('X-Total-Count')
      
      if (totalHeader !== null && totalHeader !== undefined) {
        return Number(totalHeader)
      }

      const fallbackUrl = `${API_URL}/${resource}?${filters}&t=${t}`
      const fallbackResponse = await fetch(fallbackUrl)
      const data = await fallbackResponse.json()
      return Array.isArray(data) ? data.length : 0

    } catch (e) {
      return 0
    }
  }

  // --- CORREÇÃO DA ORDEM AQUI ---
  // Voltei para 'data_cadastro'. É a única forma garantida de mostrar os recém-criados no topo.
  // Os itens antigos (sem data) ficarão no final da lista.
  const fetchMaterials = (params = '') => request(`/materials?_sort=data_cadastro&_order=desc&${params}`)
  
  const createMaterial = (data) => request('/materials', {
    method: 'POST',
    body: JSON.stringify(data)
  })

  const updateMaterial = (id, data) => request(`/materials/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data)
  })

  const deleteMaterial = (id) => request(`/materials/${id}`, { method: 'DELETE' })
  
  const createMovement = (data) => request('/movements', {
    method: 'POST',
    body: JSON.stringify({ ...data, data: new Date().toISOString() })
  })

  const fetchMovements = () => request('/movements?_sort=data&_order=desc&_limit=200')

  const fetchStats = async () => {
    try {
      const [totalMaterials, lowStock, totalMovements, totalEntries] = await Promise.all([
        fetchCount('materials'),
        fetchCount('materials', 'quantidade_lte=10'),
        fetchCount('movements'),
        fetchCount('movements', 'tipo=entrada')
      ])

      return { totalMaterials, lowStock, totalMovements, totalEntries }
    } catch (e) {
      console.error("Erro estatísticas", e)
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