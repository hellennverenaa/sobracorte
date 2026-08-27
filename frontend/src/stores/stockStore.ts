import { defineStore } from 'pinia';
import { api } from '@/services/httpClient';

export type SectorType = 'CORTE' | 'APOIO' | 'PRE_FABRICADO' | 'EXPEDICAO' | 'MONTAGEM';

export interface MatchingPair {
  sku: string;
  sizeGrade: string;
  leftFootStockItemId: number;
  leftQuantity: number;
  leftLocations: string;
  rightFootStockItemId: number;
  rightQuantity: number;
  rightLocations: string;
  formablePairs: number;
}

export interface StockState {
  activeSector: SectorType;
  searchQuery: string;
  loading: boolean;
  error: string | null;
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  metrics: {
    totalItems: number;
    totalCorte: number;
    totalApoio: number;
    totalPreFabricado: number;
    totalExpedicao: number;
    totalMontagem: number;
  };
  sectors: {
    corte: { total: number; data: any[] };
    apoio: { total: number; data: any[] };
    preFabricado: { total: number; data: any[] };
    expedicao: { total: number; data: any[] };
    montagem: { total: number; data: any[] };
  };
  filterLocations: Array<{ id: number; name: string }>;
  filterOrigins: Array<{ id: number; name: string }>;
  filterCategories: Array<{ id: number; name: string }>;
  matchingPairs: MatchingPair[];
  matchingPairsCount: number;
  history: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    data: any[];
  };
}

export const useStockStore = defineStore('stock', {
  state: (): StockState => ({
    activeSector: 'CORTE',
    searchQuery: '',
    loading: false,
    error: null,
    pagination: {
      total: 0,
      page: 1,
      limit: 50,
      totalPages: 1,
    },
    metrics: {
      totalItems: 0,
      totalCorte: 0,
      totalApoio: 0,
      totalPreFabricado: 0,
      totalExpedicao: 0,
      totalMontagem: 0,
    },
    sectors: {
      corte: { total: 0, data: [] },
      apoio: { total: 0, data: [] },
      preFabricado: { total: 0, data: [] },
      expedicao: { total: 0, data: [] },
      montagem: { total: 0, data: [] },
    },
    filterLocations: [],
    filterOrigins: [],
    filterCategories: [],
    matchingPairs: [],
    matchingPairsCount: 0,
    history: {
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 1,
      data: [],
    },
  }),

  getters: {
    currentSectorData(state) {
      switch (state.activeSector) {
        case 'CORTE':
          return state.sectors.corte;
        case 'APOIO':
          return state.sectors.apoio;
        case 'PRE_FABRICADO':
          return state.sectors.preFabricado;
        case 'EXPEDICAO':
          return state.sectors.expedicao;
        case 'MONTAGEM':
          return state.sectors.montagem;
        default:
          return { total: 0, data: [] };
      }
    },
  },

  actions: {
    /**
     * Busca unificada Round-Trip Único (GET /inventory/search)
     */
    async fetchInventory(params?: { q?: string; sector?: SectorType; page?: number; limit?: number }) {
      this.loading = true;
      this.error = null;
      try {
        const targetSector = params?.sector ?? this.activeSector;
        const queryParams = {
          q: params?.q ?? this.searchQuery,
          sector: targetSector,
          page: params?.page ?? this.pagination.page,
          limit: params?.limit ?? this.pagination.limit,
        };

        const response = await api.get('/inventory/search', { params: queryParams });
        const data = response.data;

        this.metrics = data.metrics;
        this.sectors = data.sectors;
        if (data.pagination) {
          this.pagination = data.pagination;
        }
        this.filterLocations = data.filterOptions?.locations || [];
        this.filterOrigins = data.filterOptions?.origins || [];
        this.filterCategories = data.filterOptions?.categories || [];
      } catch (err: any) {
        console.error('Erro ao carregar estoque:', err);
        this.error = err.response?.data?.error || 'Erro ao carregar dados do estoque.';
      } finally {
        this.loading = false;
      }
    },

    /**
     * Cadastro em lote de itens por setor (POST /inventory/batch)
     */
    async createBatch(items: any[]) {
      this.loading = true;
      this.error = null;
      try {
        const response = await api.post('/inventory/batch', { items });
        await this.fetchInventory();
        return response.data;
      } catch (err: any) {
        console.error('Erro ao cadastrar lote:', err);
        const msg = err.response?.data?.error || 'Erro ao processar cadastro em lote.';
        this.error = msg;
        throw new Error(msg);
      } finally {
        this.loading = false;
      }
    },

    /**
     * Busca de pares prontos para casar na Montagem (GET /inventory/mounting/matching-pairs)
     */
    async fetchMatchingPairs() {
      this.loading = true;
      this.error = null;
      try {
        const response = await api.get('/inventory/mounting/matching-pairs');
        this.matchingPairs = response.data.pairs || [];
        this.matchingPairsCount = response.data.totalMatchingPairsCount || 0;
      } catch (err: any) {
        console.error('Erro ao buscar pares casáveis:', err);
        this.error = err.response?.data?.error || 'Erro ao consultar pares casáveis.';
      } finally {
        this.loading = false;
      }
    },

    /**
     * Execução atômica de casamento de par (POST /inventory/mounting/execute-match)
     */
    async executeMatch(payload: {
      leftStockItemId: number;
      rightStockItemId: number;
      quantity: number;
      reason?: string;
    }) {
      this.loading = true;
      this.error = null;
      try {
        const response = await api.post('/inventory/mounting/execute-match', payload);
        await Promise.all([this.fetchMatchingPairs(), this.fetchInventory()]);
        return response.data;
      } catch (err: any) {
        console.error('Erro ao executar casamento:', err);
        const msg = err.response?.data?.error || 'Erro ao executar casamento de par.';
        this.error = msg;
        throw new Error(msg);
      } finally {
        this.loading = false;
      }
    },

    /**
     * Registro de movimentação (Entrada, Saída, Refugo, Transferência) (POST /inventory/movements)
     */
    async createMovement(payload: {
      stockItemId: number;
      type: 'ENTRADA' | 'SAIDA' | 'REFUGO' | 'TRANSFERENCIA';
      quantity: number;
      locationId?: number;
      destinationLocationId?: number;
      origem?: string;
      reason?: string;
    }) {
      this.loading = true;
      this.error = null;
      try {
        const response = await api.post('/inventory/movements', payload);
        await this.fetchInventory();
        return response.data;
      } catch (err: any) {
        console.error('Erro ao registrar movimentação:', err);
        const msg = err.response?.data?.error || 'Erro ao registrar movimentação.';
        this.error = msg;
        throw new Error(msg);
      } finally {
        this.loading = false;
      }
    },

    /**
     * Consulta do Histórico de Auditoria (GET /inventory/movements/history)
     */
    async fetchHistory(params?: any) {
      this.loading = true;
      this.error = null;
      try {
        const response = await api.get('/inventory/movements/history', { params });
        this.history = response.data;
      } catch (err: any) {
        console.error('Erro ao buscar histórico:', err);
        this.error = err.response?.data?.error || 'Erro ao buscar histórico de auditoria.';
      } finally {
        this.loading = false;
      }
    },

    setActiveSector(sector: SectorType) {
      this.activeSector = sector;
    },
  },
});
