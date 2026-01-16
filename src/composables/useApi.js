import { ref } from 'vue'

// Importante: Use o mesmo endereço que você colocou no auth.js
// Se estiver usando IP (ex: 192.168...), coloque aqui também.
const DB_URL = 'http://10.110.21.58:3000'

export function useApi() {
  const loading = ref(false)
  const error = ref(null)

  // --- DASHBOARD ---
  const fetchStats = async () => {
    loading.value = true
    try {
      const [materialsRes, movementsRes] = await Promise.all([
        fetch(`${DB_URL}/materials`),
        fetch(`${DB_URL}/movements`)
      ])
      const materials = await materialsRes.json()
      const movements = await movementsRes.json()

      return {
        totalMaterials: materials.length || 0,
        lowStock: materials.filter(m => m.quantidade < 10).length || 0,
        totalMovements: movements.length || 0,
        totalEntries: movements.filter(m => m.tipo === 'entrada').length || 0
      }
    } catch (err) {
      console.error(err)
      return { totalMaterials: 0, lowStock: 0, totalMovements: 0, totalEntries: 0 }
    } finally {
      loading.value = false
    }
  }

  // --- MATERIAIS (CRUD) ---
  
  // 1. Buscar todos
  const fetchMaterials = async () => {
    const res = await fetch(`${DB_URL}/materials`)
    if (!res.ok) throw new Error('Erro ao buscar materiais')
    return await res.json()
  }

  // 2. Criar novo
  const createMaterial = async (material) => {
    const res = await fetch(`${DB_URL}/materials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(material)
    })
    if (!res.ok) throw new Error('Erro ao criar material')
    return await res.json()
  }

  // 3. Atualizar existente
  const updateMaterial = async (id, material) => {
    const res = await fetch(`${DB_URL}/materials/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(material)
    })
    if (!res.ok) throw new Error('Erro ao atualizar material')
    return await res.json()
  }

  // 4. Deletar
  const deleteMaterial = async (id) => {
    const res = await fetch(`${DB_URL}/materials/${id}`, {
      method: 'DELETE'
    })
    if (!res.ok) throw new Error('Erro ao deletar material')
  }

  return {
    loading,
    error,
    fetchStats,
    fetchMaterials,
    createMaterial,
    updateMaterial,
    deleteMaterial
  }
}