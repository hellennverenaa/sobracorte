<template>
  <Layout>
    <div v-if="notification.show" :class="notification.type === 'success'
      ? 'bg-green-100 border-green-400 text-green-700'
      : 'bg-red-100 border-red-400 text-red-700'
      "
      class="fixed top-4 right-4 px-4 py-3 rounded border shadow-lg z-50 flex items-center transition-all duration-300">
      <span class="font-medium">{{ notification.message }}</span>
    </div>


    <div class="flex flex-col h-full">
      <div class="flex flex-col sm:flex-row gap-5 items-center justify-end w-full sm:w-auto ml-auto my-8">

        <label v-if="authStore.user?.role === 'admin'"
          class="cursor-pointer bg-slate-800 text-white px-6 py-2.5 rounded-lg font-bold hover:bg-slate-700 transition flex items-center gap-2 shadow-md relative overflow-hidden group">
          <Upload class="w-5 h-5 group-hover:-translate-y-1 transition-transform" />
          <span v-if="importLoading">Enviando...</span>
          <span v-else>Importar Planilha</span>
          <input type="file" accept=".csv" class="hidden" @change="handleFileUpload" :disabled="importLoading" />
        </label>



        <button v-if="authStore.can('cadastrar_materiais')" @click="openCreateModal"
          class="bg-blue-600 hover:bg-blue-800 text-white px-6 py-2 rounded flex items-center gap-2 shadow-sm transition-colors">
          <span>Novo Material</span>
        </button>
      </div>

      <div v-if="importResult" class="mt-4 p-3 rounded-lg text-sm font-bold flex items-center justify-between"
        :class="importResult.includes('❌') ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'">
        {{ importResult }}
        <button @click="importResult = null" class="underline opacity-70 hover:opacity-100">Fechar</button>
      </div>

      <div class="bg-white p-4 rounded shadow-sm border border-gray-200 mx-4 mb-4 flex gap-4">
        <div class="w-1/3">
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Categoria</label>
          <select v-model="selectedCategory"
            class="w-full border p-2 rounded outline-none focus:border-blue-500 bg-white">
            <option v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</option>
          </select>
        </div>
        <div class="w-2/3">
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Buscar</label>
          <input v-model="search" type="text" placeholder="Pesquise por código ou nome..."
            class="w-full border p-2 rounded outline-none focus:border-blue-500" />
        </div>
      </div>

      <div class="flex-1 overflow-auto px-4 pb-4">
        <div class="bg-white rounded shadow border border-gray-200">
          <table class="w-full text-left border-collapse">
            <thead class="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th class="px-4 py-3 text-xs font-bold number-gray-500 uppercase border-b">Código</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b">Descrição</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-center">Categ.</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-right">Qtd / Medida</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in paginatedMaterials" :key="item.id"
                class="hover:bg-gray-50 border-b last:border-2 transition-colors">
                <td class="px-4 py-3 font-mono text-sm font-bold text-blue-600">{{ item.code }}</td>
                <td class="px-4 py-3 text-sm text-gray-700 font-medium">{{ item.name }}</td>
                <td class="px-4 py-3 text-center">
                  <span
                    class="px-2 py-1 text-xs bg-gray-100 rounded-full font-bold text-gray-600 border border-gray-200">{{
                      item.type }}</span>
                </td>
                <td class="px-4 py-3 text-right font-bold text-gray-800">
                  {{ formatNumber(item.quantity) }}
                  <span class="text-xs bg-blue-50 text-blue-800 px-1 rounded ml-1 border border-blue-100">{{
                    item.unit
                  }}</span>
                </td>
                <td class="px-4 py-3 text-center">
                  <div class="flex items-center justify-center gap-3">

                    <button @click="viewDetails(item)" class="text-gray-400 hover:text-blue-600 transition-colors"
                      title="Visualizar Detalhes">
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24"
                        stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    </button>

                    <button v-if="authStore.can('cadastrar_materiais')" @click="editItem(item)"
                      class="text-gray-400 hover:text-orange-500 transition-colors" title="Editar">
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24"
                        stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>

                    <button v-if="authStore.can('cadastrar_materiais')" @click="confirmDelete(item)"
                      class="text-gray-400 hover:text-red-600 transition-colors" title="Excluir">
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24"
                        stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>

                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="viewingItem" class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
        <div class="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
          <div class="bg-gray-50 px-6 py-4 border-b flex justify-between items-center">
            <h3 class="font-bold text-gray-800">Detalhes do Material</h3>
            <button @click="viewingItem = null" class="text-gray-400 hover:text-gray-600 font-bold text-xl">
              &times;
            </button>
          </div>
          <div class="p-6 space-y-4">
            <div class="flex justify-center mb-2">
              <span
                class="bg-blue-100 text-blue-800 px-3 py-1 rounded text-lg font-mono font-bold border border-blue-200">{{
                  viewingItem.code }}</span>
            </div>
            <div>
              <label class="block text-xs font-bold text-gray-500 uppercase">Nome</label>
              <div class="text-gray-900 font-medium">{{ viewingItem.name }}</div>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-bold text-gray-500 uppercase">Unidade</label>
                <div class="text-gray-900 font-bold">{{ viewingItem.unit }}</div>
              </div>
              <div>
                <label class="block text-xs font-bold text-gray-500 uppercase">Estoque</label>
                <div class="text-gray-900 font-bold">{{ formatNumber(viewingItem.quantity) }}</div>
              </div>
            </div>
            <div>
              <label class="block text-xs font-bold text-gray-500 uppercase">Localização</label>
              <div class="text-gray-900">{{ viewingItem.location || "Não informada" }}</div>
            </div>
            <div>
              <label class="block text-xs font-bold text-gray-500 uppercase">Observação</label>
              <div class="text-gray-900 bg-gray-50 p-2 rounded border border-gray-100 text-sm">
                {{ viewingItem.observation || "Nenhuma observação" }}
              </div>
            </div>
          </div>
          <div class="px-6 py-4 bg-gray-50 text-right">
            <button @click="viewingItem = null"
              class="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-900 text-sm">
              Fechar
            </button>
          </div>
        </div>
      </div>

      <div v-if="showCreateModal"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
        <div class="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
          <h2 class="text-lg font-bold mb-4 text-gray-800">{{ editingItem ? "Editar" : "Novo Material" }}</h2>
          <form @submit.prevent="saveItem" class="space-y-4">
            <div>
              <label class="block number-sm font-bold text-gray-700 mb-1">Código</label>
              <input v-model="form.code" required class="w-full border p-2 rounded outline-none font-mono"
                placeholder="Ex: 1040" />
            </div>

            <div>
              <label class="block text-sm font-bold text-gray-700 mb-1">Descrição</label>
              <input v-model="form.name" required class="w-full border p-2 rounded outline-none"
                placeholder="Digite a descrição do material" />
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-bold text-gray-700 mb-1">Categoria</label>
                <select v-model="form.type" required
                  class="w-full border p-2 rounded bg-white outline-none transition-colors"
                  :class="!form.type ? 'text-gray-400' : 'text-gray-900'">
                  <option value="" disabled selected hidden>Selecione a categoria...</option>
                  <option v-for="cat in categories.filter((c) => c !== 'Todos')" :key="cat" :value="cat"
                    class="text-gray-900">
                    {{ cat }}
                  </option>
                </select>
              </div>

              <div>
                <label class="block text-sm font-bold text-gray-700 mb-1">Unidade</label>
                <select v-model="form.unit" required :disabled="isUnitLocked"
                  class="w-full border p-2 rounded outline-none font-medium transition-colors disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
                  :class="!form.unit ? 'text-gray-400' : 'text-gray-900'">
                  <option value="" disabled selected hidden>Selecione a unidade...</option>
                  <option value="und" class="text-gray-900">Unidade (und)</option>
                  <option value="kg" class="text-gray-900">Quilograma (kg)</option>
                  <option value="m" class="text-gray-900">Metro (m)</option>
                  <option value="m²" class="text-gray-900">Metro Quadrado (m²)</option>
                  <option value="g" class="text-gray-900">Grama (g)</option>
                  <option value="par" class="text-gray-900">Par</option>
                  <option value="cx" class="text-gray-900">Caixa</option>
                  <option value="rl" class="text-gray-900">Rolo</option>
                </select>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-bold text-gray-700 mb-1">Estoque Inicial</label>
                <input type="number" step="0.01" v-model.number="form.quantity"
                  class="w-full border p-2 rounded outline-none" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Localização (Prateleira)</label>
                <select v-model="form.location" required :disabled="!form.type"
                  class="w-full border p-2 rounded bg-white outline-none font-medium transition-colors disabled:bg-gray-50 disabled:cursor-not-allowed"
                  :class="!form.location ? 'text-gray-400' : 'text-gray-900'">
                  <option value="" disabled selected hidden>
                    {{ form.type ? "Selecione a prateleira..." : "Escolha a Categoria primeiro" }}
                  </option>

                  <option v-for="loc in availableLocations" :key="loc" :value="loc" class="text-gray-900">
                    {{ loc }}
                  </option>
                </select>
              </div>
            </div>

            <div>
              <label class="block text-sm font-bold text-gray-700 mb-1">Observação</label>
              <textarea v-model="form.observation" class="w-full border p-2 rounded outline-none h-20 resize-none"
                placeholder="Detalhes adicionais..."></textarea>
            </div>

            <div class="flex justify-end gap-2 mt-4 pt-4 border-t">
              <button type="button" @click="showCreateModal = false"
                class="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200">
                Cancelar
              </button>
              <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Salvar</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </Layout>
</template>

<script setup>
import { ref, computed, onMounted, watch } from "vue";
import Layout from "../components/Layout.vue";
import { Upload } from 'lucide-vue-next'
import { authApi, api } from '../services/httpClient'

// 1. LINHA PARA IMPORTAR:
import { useAuthStore } from '@/stores/auth'

const materials = ref([]);
const search = ref("");
const selectedCategory = ref("Todos");
const showCreateModal = ref(false);
const editingItem = ref(null);
const viewingItem = ref(null);

const showImportModal = ref(false)
const importLoading = ref(false)
const importResult = ref(null)



// 2. ADICIONE ESTA LINHA PARA CRIAR A VARIÁVEL:
const authStore = useAuthStore()

// TAREFA 1: Sistema de Notificações Elegante
const notification = ref({ show: false, type: "", message: "" });

function showNotification(type, message) {
  notification.value = { show: true, type, message };
  setTimeout(() => {
    notification.value.show = false;
  }, 3000);
} // AQUI ESTÁ A CHAVE QUE FALTAVA! SALVADORA DA PÁTRIA!

// 1. PRIMEIRO: Criamos o Form (Isso TEM que vir antes do Computed e do Watch)
const form = ref({ code: "", name: "", type: "", unit: "", quantity: 0, location: "", observation: "" });

// 2. DEPOIS: A Inteligência de Zoneamento (Dicionário)
const mapArmazens = {
  LINHA: ["Gaiola de Linhas", "Estante Linhas A", "Estante Linhas B"],
  AVIAMENTO: ["Gaveteiro Aviamentos", "Prateleira Aviamentos"],
  ELASTICO: ["Prateleira de Elásticos", "Caixas de Elástico"],
  FERRAMENTAIS: ["Armário de Ferramentas", "Sala da Manutenção"],
};

// Prateleiras padrão para todo o resto do estoque (Couro, Tecido, Filme, etc.)
const defaultLocations = ["Rua 03 - Caixote 58 - Nível 01",
"Rua 03 - Caixote 58 - Nível 02",
"Rua 03 - Caixote 58 - Nível 03",
"Rua 03 - Caixote 58 - Nível 04",
"Rua 03 - Caixote 60 - Nível 01",
"Rua 03 - Caixote 60 - Nível 02",
"Rua 03 - Caixote 60 - Nível 03"
 ];

// 3. A MÁGICA COMPUTADA: Muda as opções baseada na Categoria
const availableLocations = computed(() => {
  if (!form.value.type) return []; // Retorna vazio se não escolheu a categoria

  const categoriaSelecionada = String(form.value.type).toUpperCase().trim();

  // Se a categoria for especial (Linha, Aviamento...), puxa do dicionário.
  // Se não for, puxa a lista padrão (defaultLocations).
  return mapArmazens[categoriaSelecionada] || defaultLocations;
});

// 3.5 DICIONÁRIO DE ALMOXARIFADO E BLOQUEIO DA ARQUITETA
const categoriasAlmoxarifadoM2 = [
  "TECIDO", "SINTETICO", "FILME", "EVA", "ESPUMA", "FORRO", "MANTA", "MICROFIBRA"
];
// Couro separado para Metros lineares
const categoriasAlmoxarifadoM = ["COURO"];

// A TRAVA: Computa instantaneamente se o campo de unidade deve ser bloqueado (disabled)
const isUnitLocked = computed(() => {
  return categoriasAlmoxarifadoM2.includes(form.value.type) ||
    categoriasAlmoxarifadoM.includes(form.value.type);
});

// 4. O OBSERVADOR TURBINADO
watch(
  () => form.value.type,
  (newType, oldType) => {
    // Regra 1: Limpa a localização se mudar de ideia
    if (newType !== oldType && oldType !== undefined && oldType !== "") {
      form.value.location = "";
    }

    // Regra 2: Inteligência da Unidade de Medida
    if (newType) {
      const isCreating = !editingItem.value;
      const userChangedCategory = oldType !== "" && oldType !== undefined;

      if (isCreating || userChangedCategory) {
        if (categoriasAlmoxarifadoM2.includes(newType)) {
          form.value.unit = "m²"; // Trava no m²
        } else if (categoriasAlmoxarifadoM.includes(newType)) {
          form.value.unit = "m"; // Trava o Couro no m
        } else if (userChangedCategory) {
          form.value.unit = ""; // Deixa livre para Aviamentos e Linhas
        }
      }
    }
  }
);

const categories = [
  "Todos",
  "TECIDO",
  "LINHA",
  "ELASTICO",
  "AVIAMENTO",
  "COURO",
  "SINTETICO",
  "SOLADO",
  "FILME",
  "EVA",
  "ESPUMA",
  "FORRO",
  "MANTA",
  "MICROFIBRA",
  "FERRAMENTAIS",
  "OUTROS",
];

// Adicionamos o 'config = {}' para aceitar os parâmetros do Dashboard!
async function fetchMaterials(config = {}) {
  try {
    // O Axios faz o GET, junta a baseURL e aplica os parâmetros se existirem
    const response = await api.get('/materials', config);
    
    // O Axios já entrega o JSON mastigado no response.data
    materials.value = response.data;
    
    // Retornamos o dado para caso outra tela (como o Dashboard) esteja chamando
    return response.data; 
    
  } catch (e) {
    console.error("Erro ao buscar materiais:", e);
    // Em caso de erro, garantimos que não quebre a tela retornando um array vazio
    return []; 
  }
}

// Lógica de Leitura de CSV nativa (sem bibliotecas pesadas)
async function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  importLoading.value = true;
  importResult.value = "";

  const reader = new FileReader();
  
  reader.onload = async (e) => {
    try {
      const text = e.target.result;
      const delimiter = text.indexOf(';') !== -1 ? ';' : ',';
      const lines = text.split('\n').filter(line => line.trim() !== '');
      
      if (lines.length < 2) {
         throw new Error("O arquivo CSV está vazio ou não tem cabeçalhos.");
      }

      const items = [];

      for (let i = 1; i < lines.length; i++) {
        // 🚀 MÁGICA 1: Quebra as colunas e ARRANCA todas as aspas duplas!
        const row = lines[i].split(delimiter).map(col => col.replace(/"/g, '').trim());
        
        // 🚀 MÁGICA 2: Limpeza pesada de números Brasileiros
        // Pega o valor, ex: "1.500,50" ou "15"
        let rawQtd = row[2] || '0'; 
        rawQtd = rawQtd.replace(/\./g, ''); // Arranca o ponto de milhar -> "1500,50"
        rawQtd = rawQtd.replace(',', '.');  // Troca a vírgula por ponto -> "1500.50"

        // Agora o mapeamento fica limpinho:
        items.push({
          codigo: row[0] || '',
          nome: row[1] || '',
          quantidade: Number(rawQtd) || 0,
          unidade: row[3] || '',
          tipo: row[4] || ''
        });
      }

      // Envia para o backend
      const response = await api.post('/materials/bulk', { materiais: items });
      
      importResult.value = `Sucesso! ${response.data.inseridos || items.length} materiais importados.`;
      fetchMaterials(); 

    } catch (error) {
      console.error("Erro no CSV:", error);
      const errorMsg = error.response?.data?.error || error.message || "Verifique a formatação do CSV.";
      importResult.value = `❌ Erro ao importar: ${errorMsg}`;
    } finally {
      importLoading.value = false;
      event.target.value = null; 
    }
  };

  reader.readAsText(file);
}

const paginatedMaterials = computed(() => {
  return materials.value
    .filter((m) => {
      const term = search.value.toLowerCase();
      return (
        (selectedCategory.value === "Todos" || m.type === selectedCategory.value) &&
        (m.name.toLowerCase().includes(term) || String(m.code).toLowerCase().includes(term))
      );
    })
    .sort((a, b) => b.id - a.id)
    .slice(0, 50);
});

function formatNumber(num) {
  return Number(num).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

function openCreateModal() {
  editingItem.value = null;
  form.value = { code: "", name: "", type: "", unit: "", quantity: 0, location: "", observation: "" };
  showCreateModal.value = true;
}

function editItem(item) {
  editingItem.value = item;
  form.value = { ...item, location: item.location || "Não definido" };
  showCreateModal.value = true;
}

function viewDetails(item) {
  viewingItem.value = item;
}

async function saveItem() {

  // ESCUDO 1: Bloqueia movimentadores/leitores intrusos
  if (!authStore.can('cadastrar_materiais')) {
    return showNotification("error", "Acesso Negado: Apenas Líderes ou Admins podem salvar materiais.");
  }

  // BARREIRA DE SEGURANÇA (Validações da Arquiteta)
  if (!form.value.code) {
    return showNotification("error", "O código do material é obrigatório!");
  }
  // Verifica se tem alguma letra ou caractere especial misturado nos números
  if (!/^\d+$/.test(form.value.code)) {
    return showNotification("error", "O código deve conter APENAS números!");
  }
  if (!form.value.type) {
    return showNotification("error", "Selecione uma Categoria válida!");
  }
  if (!form.value.unit) {
    return showNotification("error", "A Unidade de Medida é obrigatória!");
  }
  if (!form.value.location) {
    return showNotification("error", "Selecione uma Localização (Prateleira)!");
  }

 try {
    const userJson = localStorage.getItem("user");
    const user = userJson ? JSON.parse(userJson) : null;
    const userId = user ? user.id : 1;

    const payload = { ...form.value, userId };
    if (!editingItem.value) delete payload.id;

    // O Axios resolve o caminho de forma super declarativa!
    if (editingItem.value) {
      // Se tem item sendo editado, faz um PUT na rota específica
      await api.put(`/materials/${editingItem.value.id}`, payload);
    } else {
      // Se é um item novo, faz um POST na rota geral
      await api.post('/materials', payload);
    }

    // Se chegou nesta linha, o status 200/201 (Sucesso) está garantido!
    showNotification(
      "success",
      editingItem.value ? "Material atualizado com sucesso!" : "Material salvo com sucesso!"
    );
    
    showCreateModal.value = false;
    await fetchMaterials();

  } catch (error) {
    console.error("Erro ao salvar/atualizar material:", error);
    
    // Captura o erro real devolvido pelo Prisma/Node.js (Ex: "O código já existe no banco")
    const errorMsg = error.response?.data?.error || "Verifique se o código já existe ou falha de conexão.";
    showNotification("error", `Erro: ${errorMsg}`);
  }
}

async function confirmDelete(item) {
  // ESCUDO 2: Bloqueia movimentadores/leitores intrusos (Intacto!)
  if (!authStore.can('cadastrar_materiais')) {
    return showNotification("error", "Acesso Negado: Apenas Líderes ou Admins podem excluir materiais.");
  }

  if (confirm("Tem certeza? A exclusão será registrada.")) {
    try {
      // AXIOS: Chama o método delete direto, passando apenas a rota final
      await api.delete(`/materials/${item.id}`);
      
      // Se a execução chegou aqui, o status é 200 (Sucesso Garantido!)
      showNotification("success", "Material excluído com sucesso!");
      fetchMaterials();

    } catch (error) {
      console.error("Erro ao excluir:", error);
      
      // Captura a mensagem do backend caso ele impeça a exclusão (ex: material com saldo)
      const errorMsg = error.response?.data?.error || "Erro de conexão ao tentar excluir.";
      showNotification("error", errorMsg);
    }
  }
}

onMounted(fetchMaterials);
</script>
