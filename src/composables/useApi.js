import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'

const API_URL = 'http://10.110.20.181:3001'
////http://10.110.20.181:3001

export function useApi() {
  const authStore = useAuthStore()
  const isLoading = ref(false)
  const error = ref(null)

  async function request(endpoint, options = {}) {
    isLoading.value = true
    error.value = null
    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...options.headers }
      })
      if (!response.ok) throw new Error(`Erro: ${response.statusText}`)
      return await response.json()
    } catch (err) {
      console.error("Erro API:", err)
      error.value = "Erro de conexão."
      throw err
    } finally {
      isLoading.value = false
    }
  }

  // --- FUNÇÕES BÁSICAS ---
  async function fetchMaterials() { return request('/materials') }
  
  async function createMaterial(material) {
    return request('/materials', { method: 'POST', body: JSON.stringify(material) })
  }
  
  async function updateMaterial(id, material) {
    return request(`/materials/${id}`, { method: 'PATCH', body: JSON.stringify(material) })
  }
  
  async function deleteMaterial(id) {
    return request(`/materials/${id}`, { method: 'DELETE' })
  }

  async function fetchMovements() {
    return request('/movements?_sort=data&_order=desc')
  }

  // --- O CORAÇÃO DO DASHBOARD (CORRIGIDO) ---
  async function fetchStats() {
    try {
      const [matData, movData] = await Promise.all([
        request('/materials'),
        request('/movements')
      ])

      // CORREÇÃO: Garante que estamos lendo listas, não importa o formato
      const materials = Array.isArray(matData) ? matData : (matData.materials || [])
      const movements = Array.isArray(movData) ? movData : (movData.movements || [])

      return {
        totalMaterials: materials.length,
        // Conta materiais com menos de 10 unidades
        lowStock: materials.filter(m => Number(m.quantidade || 0) < 10).length,
        totalMovements: movements.length,
        // Conta quantas entradas houveram
        totalEntries: movements.filter(m => m.tipo === 'entrada').length
      }
    } catch (e) {
      console.error("Erro ao calcular stats", e)
      return { totalMaterials: 0, lowStock: 0, totalMovements: 0, totalEntries: 0 }
    }
  }

  async function createMovement(movement) {
    const material = await request(`/materials/${movement.materialId}`)
    const qtdMov = Number(movement.quantidade)
    const qtdAtual = Number(material.quantidade || 0)
    let novaQtd = qtdAtual

    if (movement.tipo === 'entrada') novaQtd = qtdAtual + qtdMov
    else {
      if (qtdAtual < qtdMov) throw new Error("Saldo insuficiente!")
      novaQtd = qtdAtual - qtdMov
    }

    await request('/movements', {
      method: 'POST',
      body: JSON.stringify({ ...movement, data: new Date().toISOString() })
    })

    await request(`/materials/${movement.materialId}`, {
      method: 'PATCH',
      body: JSON.stringify({ quantidade: novaQtd })
    })
  }

  return {
    isLoading, error, fetchMaterials, createMaterial, updateMaterial, 
    deleteMaterial, fetchStats, fetchMovements, createMovement
  }
}