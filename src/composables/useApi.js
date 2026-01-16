import { ref } from 'vue'

const DB_URL = 'http://10.110.21.58:3000'

export function useApi() {
  const loading = ref(false)
  const error = ref(null)

  // --- DASHBOARD & GERAL ---
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
        lowStock: materials.filter(m => Number(m.quantidade) < 10).length || 0,
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

  // --- MATERIAIS ---
  const fetchMaterials = async () => {
    const res = await fetch(`${DB_URL}/materials`)
    if (!res.ok) throw new Error('Erro ao buscar materiais')
    return await res.json()
  }

  const createMaterial = async (material) => {
    const res = await fetch(`${DB_URL}/materials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...material, quantidade: Number(material.quantidade) })
    })
    if (!res.ok) throw new Error('Erro ao criar material')
    return await res.json()
  }

  const updateMaterial = async (id, material) => {
    const res = await fetch(`${DB_URL}/materials/${id}`, {
      method: 'PATCH', // Usamos PATCH para atualizar só o necessário
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(material)
    })
    if (!res.ok) throw new Error('Erro ao atualizar material')
    return await res.json()
  }

  const deleteMaterial = async (id) => {
    const res = await fetch(`${DB_URL}/materials/${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error('Erro ao deletar material')
  }

  // --- MOVIMENTAÇÕES (O CÉREBRO DO ESTOQUE) ---
  const createMovement = async (movement) => {
    loading.value = true
    try {
      // 1. Busca o material atual para saber quanto tem
      const materialRes = await fetch(`${DB_URL}/materials/${movement.materialId}`)
      const material = await materialRes.json()

      const qtdMovimento = Number(movement.quantidade)
      const qtdAtual = Number(material.quantidade)
      let novaQuantidade = qtdAtual

      // 2. Calcula o novo saldo
      if (movement.tipo === 'entrada') {
        novaQuantidade = qtdAtual + qtdMovimento
      } else {
        if (qtdAtual < qtdMovimento) {
          throw new Error(`Saldo insuficiente! Estoque atual: ${qtdAtual}`)
        }
        novaQuantidade = qtdAtual - qtdMovimento
      }

      // 3. Salva a movimentação no histórico
      const newMov = {
        ...movement,
        data: new Date().toISOString(),
        quantidade: qtdMovimento
      }
      
      await fetch(`${DB_URL}/movements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMov)
      })

      // 4. Atualiza o saldo do material
      await updateMaterial(movement.materialId, { quantidade: novaQuantidade })

      return true
    } catch (err) {
      throw err // Repassa o erro para a tela mostrar
    } finally {
      loading.value = false
    }
  }

  const fetchMovements = async () => {
    const res = await fetch(`${DB_URL}/movements?_sort=data&_order=desc`) // Traz os mais recentes primeiro
    if (!res.ok) throw new Error('Erro ao buscar movimentações')
    return await res.json()
  }

  return {
    loading,
    error,
    fetchStats,
    fetchMaterials,
    createMaterial,
    updateMaterial,
    deleteMaterial,
    createMovement,
    fetchMovements
  }
}