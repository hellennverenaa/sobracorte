import { defineStore } from 'pinia';
import { api } from '@/services/httpClient';
import { requestErrorMessage } from '@/utils/domain';
import { useAuthStore } from '@/stores/auth';

export type SectorType = 'CORTE' | 'APOIO' | 'PRE_FABRICADO' | 'DISTRIBUICAO' | 'EXPEDICAO' | 'MONTAGEM' | 'CONSUMO';

export interface MatchingPair {
  sku: string;
  productName?: string;
  sizeGrade: string;
  color?: string;
  type?: string;
  sector?: SectorType;
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
  pendingOperations: number;
  inventoryRequestId: number;
  matchingPairsRequestId: number;
  historyRequestId: number;
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
    totalDistribuicao?: number;
    totalMontagem: number;
    totalConsumo: number;
  };
  sectors: {
    corte: { total: number; data: any[] };
    apoio: { total: number; data: any[] };
    preFabricado: { total: number; data: any[] };
    expedicao: { total: number; data: any[] };
    distribuicao?: { total: number; data: any[] };
    montagem: { total: number; data: any[] };
    consumo: { total: number; data: any[] };
  };
  filterLocations: Array<{ id: number; name: string; sector?: SectorType | string | null }>;
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
    pendingOperations: 0,
    inventoryRequestId: 0,
    matchingPairsRequestId: 0,
    historyRequestId: 0,
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
      totalConsumo: 0,
    },
    sectors: {
      corte: { total: 0, data: [] },
      apoio: { total: 0, data: [] },
      preFabricado: { total: 0, data: [] },
      expedicao: { total: 0, data: [] },
      montagem: { total: 0, data: [] },
      consumo: { total: 0, data: [] },
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
    loading: (state) => state.pendingOperations > 0,
    currentSectorData(state) {
      switch (state.activeSector) {
        case 'CORTE':
          return state.sectors.corte;
        case 'APOIO':
          return state.sectors.apoio;
        case 'PRE_FABRICADO':
          return state.sectors.preFabricado;
        case 'DISTRIBUICAO':
        case 'EXPEDICAO':
          return state.sectors.distribuicao || state.sectors.expedicao || { total: 0, data: [] };
        case 'MONTAGEM':
          return state.sectors.montagem;
        case 'CONSUMO':
          return state.sectors.consumo;
        default:
          return { total: 0, data: [] };
      }
    },
  },

  actions: {
    resetUnitData() {
      // Não zerar operações em curso: seus finally ainda vão decrementar.
      const pending = this.pendingOperations;
      const inventoryRequestId = this.inventoryRequestId + 1;
      const matchingPairsRequestId = this.matchingPairsRequestId + 1;
      const historyRequestId = this.historyRequestId + 1;
      this.$reset();
      this.pendingOperations = pending;
      this.inventoryRequestId = inventoryRequestId;
      this.matchingPairsRequestId = matchingPairsRequestId;
      this.historyRequestId = historyRequestId;
    },
    /**
     * Busca unificada Round-Trip Único (GET /inventory/search)
     */
    async fetchInventory(params?: { q?: string; sector?: SectorType; page?: number; limit?: number }) {
      const auth = useAuthStore();
      const unitCode = auth.user?.unit?.code;
      const requestId = ++this.inventoryRequestId;
      this.pendingOperations++;
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
        if (requestId !== this.inventoryRequestId || unitCode !== auth.user?.unit?.code) return;
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
        if (requestId !== this.inventoryRequestId || unitCode !== auth.user?.unit?.code) return;
        console.error('Erro ao carregar estoque:', err);
        this.error = requestErrorMessage(err, 'Erro ao carregar dados do estoque.');
      } finally {
        this.pendingOperations--;
      }
    },

    /**
     * Cadastro em lote de itens por setor (POST /inventory/batch)
     */
    async createBatch(items: any[]) {
      this.pendingOperations++;
      this.error = null;
      try {
        const response = await api.post('/inventory/batch', { items });
        await this.fetchInventory();
        return response.data;
      } catch (err: any) {
        console.error('Erro ao cadastrar lote:', err);
        const msg = requestErrorMessage(err, 'Erro ao processar cadastro em lote.');
        this.error = msg;
        throw new Error(msg);
      } finally {
        this.pendingOperations--;
      }
    },

    /**
     * Busca de pares prontos para casar multi-setor (GET /inventory/mounting/matching-pairs)
     */
    async fetchMatchingPairs(sector: SectorType = 'MONTAGEM', search: string = '') {
      const auth = useAuthStore();
      const unitCode = auth.user?.unit?.code;
      const requestId = ++this.matchingPairsRequestId;
      this.pendingOperations++;
      this.error = null;
      try {
        const response = await api.get('/inventory/mounting/matching-pairs', {
          params: { sector, q: search },
        });
        if (requestId !== this.matchingPairsRequestId || unitCode !== auth.user?.unit?.code) return;
        this.matchingPairs = response.data.pairs || [];
        this.matchingPairsCount = response.data.totalMatchingPairsCount || 0;
      } catch (err: any) {
        if (requestId !== this.matchingPairsRequestId || unitCode !== auth.user?.unit?.code) return;
        console.error('Erro ao buscar pares casáveis:', err);
        this.error = requestErrorMessage(err, 'Erro ao consultar pares casáveis.');
      } finally {
        this.pendingOperations--;
      }
    },

    /**
     * Execução atômica de casamento de par (POST /inventory/mounting/execute-match)
     */
    async executeMatch(payload: {
      leftStockItemId: number;
      rightStockItemId: number;
      quantity: number;
      sector?: SectorType;
      reason?: string;
    }) {
      this.pendingOperations++;
      this.error = null;
      try {
        const response = await api.post('/inventory/mounting/execute-match', payload);
        const sec = payload.sector || 'MONTAGEM';
        await Promise.all([this.fetchMatchingPairs(sec), this.fetchInventory({ sector: sec })]);
        return response.data;
      } catch (err: any) {
        console.error('Erro ao executar casamento:', err);
        const msg = requestErrorMessage(err, 'Erro ao executar casamento de par.');
        this.error = msg;
        throw new Error(msg);
      } finally {
        this.pendingOperations--;
      }
    },

    /**
     * Registro de movimentação (Entrada, Saída, Refugo, Transferência) (POST /inventory/movements)
     */
    async createMovement(payload: {
      stockItemId: number;
      sector?: SectorType;
      type: 'ENTRADA' | 'SAIDA' | 'REFUGO' | 'TRANSFERENCIA';
      quantity: number;
      locationId?: number;
      destinationLocationId?: number;
      origem?: string;
      reason?: string;
    }) {
      this.pendingOperations++;
      this.error = null;
      try {
        const response = await api.post('/inventory/movements', payload);
        await this.fetchInventory();
        return response.data;
      } catch (err: any) {
        console.error('Erro ao registrar movimentação:', err);
        const msg = requestErrorMessage(err, 'Erro ao registrar movimentação.');
        this.error = msg;
        throw new Error(msg);
      } finally {
        this.pendingOperations--;
      }
    },

    /**
     * Consulta do Histórico de Auditoria (GET /inventory/movements/history)
     */
    async fetchHistory(params?: any) {
      const auth = useAuthStore();
      const unitCode = auth.user?.unit?.code;
      const requestId = ++this.historyRequestId;
      this.pendingOperations++;
      this.error = null;
      try {
        const response = await api.get('/inventory/movements/history', { params });
        if (requestId !== this.historyRequestId || unitCode !== auth.user?.unit?.code) return;
        this.history = response.data;
      } catch (err: any) {
        if (requestId !== this.historyRequestId || unitCode !== auth.user?.unit?.code) return;
        console.error('Erro ao buscar histórico:', err);
        this.error = requestErrorMessage(err, 'Erro ao buscar histórico de auditoria.');
      } finally {
        this.pendingOperations--;
      }
    },

    setActiveSector(sector: SectorType) {
      this.activeSector = sector;
    },
  },
});
