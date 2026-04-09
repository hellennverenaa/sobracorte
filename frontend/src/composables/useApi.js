import { ref } from 'vue'

import { api } from "../services/httpClient"

export function useApi() {
  const error = ref(null)
  const isLoading = ref(false)

  async function request(endpoint, options = {}) {
    isLoading.value = true;
    error.value = null;

    try {
      const timestamp = new Date().getTime();

      // 1. O Axios usa 'data' em vez de 'body'. 
      // Se alguma tela enviar 'body', nós adaptamos aqui para não quebrar nada.
      let requestData = options.data;
      if (options.body) {
        // Se vier como JSON.stringify (padrão do fetch), desfazemos para objeto
        requestData = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
      }

      // 2. Fazemos a requisição. O Axios já junta a baseURL com o endpoint sozinho.
      const response = await api.request({
        url: endpoint,
        method: options.method || 'GET',
        data: requestData,
        headers: {
          'Cache-Control': 'no-cache',
          ...options.headers
        },
        params: {
          t: timestamp, // O Axios coloca o '?' ou '&' automaticamente
          ...options.params
        }
      });

      // 3. O Axios já faz o JSON.parse() sozinho e entrega tudo no response.data!
      return response.data || {};

    } catch (err) {
      // 4. O Axios já "explode" (cai no catch) automaticamente se der erro 400, 401, 500.
      // Ele guarda a resposta do backend dentro de err.response
      const errorMsg = err.response?.data?.error || err.response?.data?.message || err.message;

      error.value = errorMsg;
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  const fetchMaterials = () => request('/materials')
  const createMaterial = (data) => request('/materials', { method: 'POST', body: JSON.stringify(data) })
  const updateMaterial = (id, data) => request(`/materials/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
  const deleteMaterial = (id) => request(`/materials/${id}`, { method: 'DELETE' })

 const fetchStats = async () => {
  try {
    // O Axios faz o GET, junta a URL, resolve o JSON e os interceptadores injetam o Token!
    const response = await api.get('/stats', {
      params: { 
        t: new Date().getTime() // Cache-busting feito do jeito elegante
      }
    });

    return response.data;

  } catch (e) {
    console.error('Erro ao buscar stats:', e);
    // Se o backend cair ou o token expirar, devolvemos zerado para não quebrar os cards na tela
    return { totalMaterials: 0, lowStock: 0, totalMovements: 0, totalEntries: 0 };
  }
}
  const createMovement = (data) => request('/movements', { method: 'POST', body: JSON.stringify(data) })
  const fetchMovements = () => request('/movements')

  const fetchLocations = () => request('/locations')

  return {
    request, fetchMaterials, createMaterial, updateMaterial, deleteMaterial,
    fetchStats, createMovement, fetchMovements, fetchLocations,
    isLoading, error
  }
}