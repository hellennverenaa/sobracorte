<script setup>
import { ref, onMounted, computed } from "vue";
import { useAuthStore } from "@/stores/auth";
import Layout from "@/components/Layout.vue";
import { Trash2, Edit, Search, UserCheck, Shield, ShieldCheck, Users as UsersIcon, Activity, Eye, CheckCircle, XCircle, Layers } from "lucide-vue-next";
import { api } from '../services/httpClient'
import ConfirmModal from "@/components/ConfirmModal.vue";

const auth = useAuthStore();
const users = ref([]);
const loading = ref(true);
const searchTerm = ref("");
const showEditModal = ref(false);
const editingUser = ref(null);

const notification = ref({ show: false, type: 'success', message: '' });
function showNotification(type, message) {
  notification.value = { show: true, type, message };
  setTimeout(() => { notification.value.show = false; }, 3500);
}

const confirmState = ref({
  show: false,
  title: '',
  message: '',
  confirmText: 'Excluir',
  variant: 'danger',
  loading: false,
  action: null
});

function openConfirmModal({ title, message, confirmText = 'Excluir', variant = 'danger', action }) {
  confirmState.value = {
    show: true,
    title,
    message,
    confirmText,
    variant,
    loading: false,
    action
  };
}

async function handleConfirmedAction() {
  if (typeof confirmState.value.action === 'function') {
    confirmState.value.loading = true;
    try {
      await confirmState.value.action();
    } finally {
      confirmState.value.loading = false;
      confirmState.value.show = false;
    }
  }
}

const roleOptions = [
  { value: "admin", label: "Admin Master", icon: Shield, color: "text-purple-600 bg-purple-100" },
  { value: "admin_setor", label: "Admin de Setor", icon: ShieldCheck, color: "text-indigo-600 bg-indigo-100" },
  { value: "lider", label: "Líder", icon: UserCheck, color: "text-blue-600 bg-blue-100" },
  { value: "movimentador", label: "Movimentador", icon: Activity, color: "text-orange-600 bg-orange-100" },
  { value: "leitor", label: "Leitor", icon: Eye, color: "text-gray-600 bg-gray-100" },
];

const sectorOptions = [
  { value: null, label: "Todos os Setores (Irrestrito)" },
  { value: "CORTE", label: "Corte (Matéria-Prima)" },
  { value: "APOIO", label: "Apoio (Peças Cortadas)" },
  { value: "PRE_FABRICADO", label: "Pré-Fabricado (Solas)" },
  { value: "EXPEDICAO", label: "Cabedais" },
  { value: "MONTAGEM", label: "Montagem" },
  { value: "CONSUMO", label: "Consumo" },
];

const fetchUsers = async () => {
  loading.value = true;
  try {
    const response = await api.get('/users');
    users.value = response.data;
  } catch (error) {
    const errorMsg = error.response?.data?.error || error.message;
    console.error("Erro ao buscar usuários:", errorMsg);
  } finally {
    loading.value = false;
  }
};

const saveUserRole = async () => {
  if (!editingUser.value) return;

  try {
    const payload = {
      role: editingUser.value.role,
      assignedSector: editingUser.value.role === 'admin' ? null : (editingUser.value.assignedSector || null)
    };

    const res = await api.put(`/users/${editingUser.value.id}`, payload);

    const index = users.value.findIndex((u) => u.id === editingUser.value.id);
    if (index !== -1) {
      users.value[index].role = res.data.role;
      users.value[index].assignedSector = res.data.assignedSector;
    }

    showNotification("success", "Permissões e setor vinculados com sucesso!");
    showEditModal.value = false;
  } catch (error) {
    console.error("Erro ao atualizar usuário:", error);
    const errorMsg = error.response?.data?.error || "Erro de conexão ao atualizar usuário.";
    showNotification("error", errorMsg);
  }
};

const openEditModal = (user) => {
  editingUser.value = {
    ...user,
    assignedSector: user.assignedSector || null,
  };
  showEditModal.value = true;
};

const deleteUser = (userTarget) => {
  const userId = typeof userTarget === 'object' ? userTarget.id : userTarget;
  const userName = typeof userTarget === 'object' ? (userTarget.nome || userTarget.usuario) : 'este usuário';

  openConfirmModal({
    title: 'Remover Usuário',
    message: `Tem certeza que deseja remover o usuário "${userName}" do sistema local?`,
    confirmText: 'Sim, Remover',
    variant: 'danger',
    action: async () => {
      try {
        await api.delete(`/users/${userId}`);
        showNotification('success', 'Usuário removido com sucesso!');
        fetchUsers();
      } catch (error) {
        console.error("Erro ao excluir usuário:", error);
        const errorMsg = error.response?.data?.error || "Erro de conexão ao tentar excluir usuário.";
        showNotification('error', errorMsg);
      }
    }
  });
};

const filteredUsers = computed(() => {
  if (!searchTerm.value) return users.value;
  const term = searchTerm.value.toLowerCase();
  return users.value.filter(
    (u) =>
      u.nome?.toLowerCase().includes(term) ||
      u.usuario?.toLowerCase().includes(term) ||
      u.setor?.toLowerCase().includes(term) ||
      u.assignedSector?.toLowerCase().includes(term)
  );
});

const getRoleInfo = (role) => {
  return roleOptions.find((r) => r.value === role) || roleOptions[3];
};

function formatSectorName(sec) {
  const map = {
    CORTE: 'Corte',
    APOIO: 'Apoio',
    PRE_FABRICADO: 'Pré-Fabricado',
    EXPEDICAO: 'Cabedais',
    MONTAGEM: 'Montagem',
    CONSUMO: 'Consumo',
  };
  return sec ? (map[sec] || sec) : 'Todos / Livre';
}

onMounted(() => {
  fetchUsers();
});
</script>

<template>
  <Layout>
    <!-- Toast Notification -->
    <transition name="fade-down">
      <div v-if="notification.show"
        class="fixed top-6 right-6 z-50 px-5 py-3 rounded-xl shadow-xl font-bold text-sm flex items-center gap-2 transition-all"
        :class="notification.type === 'success'
          ? 'bg-emerald-500 text-white'
          : 'bg-red-500 text-white'">
        <CheckCircle v-if="notification.type === 'success'" class="w-4 h-4" />
        <XCircle v-else class="w-4 h-4" />
        {{ notification.message }}
      </div>
    </transition>

    <div class="p-6 max-w-7xl mx-auto">
      <div class="flex justify-between items-center mb-8">
        <div>
          <h1 class="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <UsersIcon class="w-8 h-8 text-blue-600" />
            Gestão de Usuários e RBAC Setorial
          </h1>
          <p class="text-gray-600 mt-1">Gerencie os níveis de acesso e vincule setores de operação para Líderes e Movimentadores</p>
        </div>

        <div class="relative">
          <Search class="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input v-model="searchTerm" type="text" placeholder="Buscar por nome, setor ou matrícula..."
            class="pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none w-64 text-xs" />
        </div>
      </div>

      <div class="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-100">
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead class="bg-gray-50 border-b">
              <tr>
                <th class="px-6 py-4 text-left text-sm font-semibold text-gray-600">Usuário / Nome</th>
                <th class="px-6 py-4 text-left text-sm font-semibold text-gray-600">Setor RH / Função</th>
                <th class="px-6 py-4 text-left text-sm font-semibold text-gray-600">Nível de Acesso</th>
                <th class="px-6 py-4 text-left text-sm font-semibold text-gray-600">Setor Vinculado (RBAC)</th>
                <th class="px-6 py-4 text-center text-sm font-semibold text-gray-600">Ações</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr v-if="loading">
                <td colspan="5" class="px-6 py-8 text-center text-gray-500">Carregando usuários...</td>
              </tr>

              <tr v-else-if="filteredUsers.length === 0">
                <td colspan="5" class="px-6 py-8 text-center text-gray-500">Nenhum usuário encontrado.</td>
              </tr>

              <tr v-for="user in filteredUsers" :key="user.id" class="hover:bg-gray-50 transition-colors">
                <td class="px-6 py-4">
                  <div class="flex items-center gap-3">
                    <div
                      class="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold">
                      {{ user.nome ? user.nome.charAt(0).toUpperCase() : "U" }}
                    </div>
                    <div>
                      <p class="font-medium text-gray-900">{{ user.nome || "Sem Nome" }}</p>
                      <p class="text-xs text-gray-500 font-mono">{{ user.usuario }}</p>
                    </div>
                  </div>
                </td>

                <td class="px-6 py-4">
                  <p class="text-sm font-medium text-gray-800">{{ user.setor || "-" }}</p>
                  <p class="text-xs text-gray-500">{{ user.funcao || "-" }}</p>
                </td>

                <td class="px-6 py-4">
                  <span
                    :class="`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1 w-fit ${getRoleInfo(user.role).color}`">
                    <component :is="getRoleInfo(user.role).icon" class="w-3.5 h-3.5" />
                    {{ getRoleInfo(user.role).label }}
                  </span>
                </td>

                <td class="px-6 py-4">
                  <span
                    v-if="user.role === 'admin'"
                    class="px-2.5 py-1 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200"
                  >
                    Todos os Setores (Master)
                  </span>
                  <span
                    v-else-if="user.assignedSector"
                    class="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200 flex items-center gap-1 w-fit"
                  >
                    <Layers class="w-3 h-3 text-blue-600" />
                    {{ formatSectorName(user.assignedSector) }}
                  </span>
                  <span
                    v-else
                    class="text-xs text-gray-400 font-medium"
                  >
                    Todos / Livre
                  </span>
                </td>

                <td class="px-6 py-4 text-center">
                  <div class="flex justify-center gap-2">
                    <button @click="openEditModal(user)"
                      class="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Editar Permissão e Setor"
                      :disabled="user.usuario === auth.user.usuario"
                      :class="{ 'opacity-50 cursor-not-allowed': user.usuario === auth.user.usuario }">
                      <Edit class="w-5 h-5" />
                    </button>

                    <button @click="deleteUser(user.id)"
                      class="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Remover Usuário"
                      :disabled="user.usuario === auth.user.usuario"
                      :class="{ 'opacity-50 cursor-not-allowed': user.usuario === auth.user.usuario }">
                      <Trash2 class="w-5 h-5" />
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Modal de Edição de Permissões e Setor Vinculado -->
    <div v-if="showEditModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in">
        <div class="bg-gray-50 px-6 py-4 border-b flex justify-between items-center">
          <h3 class="font-bold text-base text-gray-800">Alterar Permissões & Setor RBAC</h3>
          <button @click="showEditModal = false" class="text-gray-400 hover:text-gray-600 font-bold text-lg">&times;</button>
        </div>

        <div class="p-6 space-y-4 text-xs">
          <div>
            <label class="block font-bold text-gray-700 uppercase mb-1">Usuário</label>
            <input type="text" :value="editingUser.nome || editingUser.usuario" disabled
              class="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-gray-600 font-medium cursor-not-allowed" />
          </div>

          <div>
            <label class="block font-bold text-gray-700 uppercase mb-2">Nível de Acesso *</label>
            <div class="space-y-2">
              <label v-for="option in roleOptions" :key="option.value"
                class="flex items-center p-2.5 border rounded-lg cursor-pointer transition-all hover:bg-gray-50"
                :class="{ 'border-blue-500 bg-blue-50 ring-1 ring-blue-500': editingUser.role === option.value }">
                <input type="radio" v-model="editingUser.role" :value="option.value"
                  class="text-blue-600 focus:ring-blue-500 h-4 w-4 mr-3" />
                <div class="flex items-center gap-2">
                  <component :is="option.icon" class="w-4 h-4 text-gray-500" />
                  <span class="font-bold text-gray-800">{{ option.label }}</span>
                </div>
              </label>
            </div>
          </div>

          <!-- Setor Vinculado (RBAC) -->
          <div class="mt-4">
            <label class="block text-xs font-bold text-gray-700 uppercase mb-1">
              Setor Vinculado (RBAC) *
            </label>
            <select
              v-model="editingUser.assignedSector"
              class="w-full px-3 py-2 border rounded-lg uppercase text-sm font-medium focus:ring-2 focus:ring-blue-500 bg-white"
              :disabled="editingUser.role === 'admin'"
            >
              <option :value="null">TODOS OS SETORES / IRRESTRITO (MASTER)</option>
              <option value="CORTE">CORTE (MATÉRIA-PRIMA)</option>
              <option value="APOIO">APOIO (MOLDES / PEÇAS)</option>
              <option value="PRE_FABRICADO">PRÉ-FABRICADO (SOLAS)</option>
              <option value="EXPEDICAO">CABEDAIS</option>
              <option value="MONTAGEM">MONTAGEM (PÉS ÓRFÃOS)</option>
              <option value="CONSUMO">CONSUMO (INSUMOS)</option>
            </select>
            <p v-if="editingUser.role === 'admin'" class="text-xs text-gray-500 mt-1">
              * Administradores Master possuem acesso automático a todos os setores.
            </p>
            <p v-else class="text-[11px] text-gray-500 mt-1">
              * Líderes e Movimentadores ficam restritos às operações de escrita (entrada, movimentação e baixa) neste setor.
            </p>
          </div>
        </div>

        <div class="px-6 py-4 bg-gray-50 border-t flex justify-end gap-3">
          <button @click="showEditModal = false"
            class="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg font-medium transition-colors text-xs">
            Cancelar
          </button>
          <button @click="saveUserRole"
            class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition-colors shadow-sm text-xs">
            Salvar Alterações
          </button>
        </div>
      </div>
    </div>

    <!-- Modal de Confirmação Corporativo -->
    <ConfirmModal
      :show="confirmState.show"
      :title="confirmState.title"
      :message="confirmState.message"
      :confirm-text="confirmState.confirmText"
      :variant="confirmState.variant"
      :loading="confirmState.loading"
      @confirm="handleConfirmedAction"
      @cancel="confirmState.show = false"
    />
  </Layout>
</template>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }

  to {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
