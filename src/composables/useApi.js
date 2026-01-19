import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'

// CORREÇÃO: Aponta para o SEU computador na porta do banco de dados
const API_URL = 'http://localhost:3001'

//http://10.110.21.58:3001
export function useApi() {
  const authStore = useAuthStore()
  const isLoading = ref(false)
  const error = ref(null)

  // Função central que faz a conexão
  async function request(endpoint, options = {}) {
    isLoading.value = true
    error.value = null

    try {
      // Monta a URL: http://localhost:3001/materials, etc.
      const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        }
      })

      if (!response.ok) {
        throw new Error(`Erro: ${response.statusText}`)
      }

      const data = await response.json()
      return data
    } catch (err) {
      console.error("Erro de Conexão:", err)
      error.value = "Erro ao conectar com o banco de dados. Verifique se 'npm run db' está rodando."
      throw err
    } finally {
      isLoading.value = false
    }
  }

  // --- MATERIAIS ---
  async function fetchMaterials() {
    return request('/materials')
  }

  async function createMaterial(material) {
    return request('/materials', {
      method: 'POST',
      body: JSON.stringify(material)
    })
  }

  async function updateMaterial(id, material) {
    return request(`/materials/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(material)
    })
  }

  async function deleteMaterial(id) {
    return request(`/materials/${id}`, {
      method: 'DELETE'
    })
  }

  // --- ESTATÍSTICAS (Calculadas manualmente) ---
  async function fetchStats() {
    const materials = await request('/materials')
    const movements = await request('/movements')
    return {
      totalMaterials: materials.length,
      lowStock: materials.filter(m => Number(m.quantidade) < 10).length,
      totalMovements: movements.length,
      totalEntries: movements.filter(m => m.tipo === 'entrada').length
    }
  }

  // --- MOVIMENTAÇÕES ---
  async function fetchMovements() {
    return request('/movements?_sort=data&_order=desc')
  }

  async function createMovement(movement) {
    // 1. Pega material atual
    const material = await request(`/materials/${movement.materialId}`)
    
    // 2. Calcula novo saldo
    const qtdMovimento = Number(movement.quantidade)
    const qtdAtual = Number(material.quantidade)
    let novaQuantidade = qtdAtual

    if (movement.tipo === 'entrada') {
      novaQuantidade = qtdAtual + qtdMovimento
    } else {
      if (qtdAtual < qtdMovimento) throw new Error("Saldo insuficiente no estoque!")
      novaQuantidade = qtdAtual - qtdMovimento
    }

    // 3. Salva no histórico
    await request('/movements', {
      method: 'POST',
      body: JSON.stringify({
        ...movement,
        data: new Date().toISOString()
      })
    })

    // 4. Atualiza o saldo do material
    await request(`/materials/${movement.materialId}`, {
      method: 'PATCH',
      body: JSON.stringify({ quantidade: novaQuantidade })
    })
  }

  return {
    isLoading,
    error,
    fetchMaterials,
    createMaterial,
    updateMaterial,
    deleteMaterial,
    fetchStats,
    fetchMovements,
    createMovement
  }
}