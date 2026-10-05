<script setup>
import { ref, onMounted, computed, watch } from "vue";
import { useAuthStore } from "@/stores/auth";
import Layout from "@/components/Layout.vue";
import { Trash2, Edit, Search, UserCheck, Shield, ShieldCheck, Users as UsersIcon, Activity, Eye, Layers } from "lucide-vue-next";
import { api } from '../services/httpClient'
import ConfirmModal from "@/components/ConfirmModal.vue";
import ToastNotification from "@/components/ToastNotification.vue";
import { useToast } from "@/composables/useToast";
import { useConfirmModal } from "@/composables/useConfirmModal";
import { formatDate } from "@/utils/format";
import { formatSectorName, SECTOR_OPTIONS } from "@/utils/domain";

const auth = useAuthStore();
const users = ref([]);
const loading = ref(true);
const searchTerm = ref("");
const showEditModal = ref(false);
const editingUser = ref(null);
const showSubsectorModal = ref(false);
const subsectorTarget = ref(null);
const availableSubsectors = ref([]);
const selectedSubsectorIds = ref([]);
const loadingSubsectorAccess = ref(false);
const savingSubsectorAccess = ref(false);
watch(() => editingUser.value?.role, role => {
  if (role === 'admin') {
    if (editingUser.value) editingUser.value.assignedSector = null;
  }
});

const { notification, showNotification } = useToast(3500);
const { confirmState, openConfirmModal, handleConfirmedAction } = useConfirmModal();

const roleOptions = [
  { value: "admin", label: "Admin Master", description: "Acesso irrestrito a todos os setores, configurações globais e aprovações", icon: Shield, color: "text-purple-600 bg-purple-100" },
  { value: "admin_setor", label: "Admin de Setor", description: "Gestor e aprovador de requisições restrito ao seu setor atribuído", icon: ShieldCheck, color: "text-indigo-600 bg-indigo-100" },
  { value: "lider", label: "Líder", description: "Liderança de linha operacional (movimentações de estoque e solicitações)", icon: UserCheck, color: "text-blue-600 bg-blue-100" },
  { value: "movimentador", label: "Movimentador", description: "Operador de estoque físico e transferências do setor", icon: Activity, color: "text-orange-600 bg-orange-100" },
  { value: "leitor", label: "Leitor", description: "Acesso de consulta ao estoque e abertura de solicitações", icon: Eye, color: "text-gray-600 bg-gray-100" },
];

const assignableRoles = computed(() => roleOptions.filter(option => option.value !== 'admin' || auth.user?.isGlobalAdmin));
const canManageUser = user => user.role !== 'admin' || auth.user?.isGlobalAdmin === true;

const sectorOptions = SECTOR_OPTIONS
  .filter(sector => sector.id !== 'TODOS')
  .map(sector => ({ value: sector.id, label: sector.shortLabel || sector.label }));

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

const showAuditModal = ref(false);
const auditLogs = ref([]);
const loadingAudit = ref(false);

const openAuditModal = async () => {
  showAuditModal.value = true;
  loadingAudit.value = true;
  try {
    const res = await api.get('/users/audit');
    auditLogs.value = res.data;
  } catch (err) {
    console.error('Erro ao carregar auditoria:', err);
    showNotification('error', 'Erro ao carregar histórico de auditoria.');
  } finally {
    loadingAudit.value = false;
  }
};

const saveUserRole = async () => {
  if (!editingUser.value) return;
  if (!['admin', 'leitor'].includes(editingUser.value.role) && !editingUser.value.assignedSector) {
    showNotification("error", "Selecione um setor específico para este perfil.");
    return;
  }

  try {
    const payload = {
      role: editingUser.value.role,
      assignedSector: editingUser.value.role === 'admin' ? null : (editingUser.value.assignedSector || null),
      expectedRole: editingUser.value._originalRole,
    };

    const res = await api.put(`/users/${editingUser.value.id}`, payload);

    showNotification("success", "Permissões e setor vinculados com sucesso!");
    showEditModal.value = false;
    await fetchUsers();
  } catch (error) {
    console.error("Erro ao atualizar usuário:", error);
    const errorMsg = error.response?.data?.error || "Erro de conexão ao atualizar usuário.";
    showNotification("error", errorMsg);
    if (error.response?.status === 409) {
      fetchUsers();
    }
  }
};

const openEditModal = (user) => {
  if (!canManageUser(user)) return;
  editingUser.value = {
    ...user,
    assignedSector: user.assignedSector || user.linkedSector || null,
    _originalRole: user.persistedRole || user.role,
  };
  showEditModal.value = true;
};

const deleteUser = (userTarget) => {
  if (typeof userTarget === 'object' && !canManageUser(userTarget)) return;
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
      u.assignedSector?.toLowerCase().includes(term) ||
      u.linkedSector?.toLowerCase().includes(term)
  );
});

const getRoleInfo = (role) => {
  return roleOptions.find((r) => r.value === role) || roleOptions[3];
};

const normalizeSubsectorSector = sector => sector === 'EXPEDICAO' || sector === 'CABEDAIS' ? 'DISTRIBUICAO' : sector;
const subsectorTargetSector = computed(() => normalizeSubsectorSector(
  subsectorTarget.value?.linkedSector || subsectorTarget.value?.assignedSector || '',
));
const visibleSubsectors = computed(() => {
  const sector = subsectorTargetSector.value;
  return availableSubsectors.value.filter(subsector => !sector || normalizeSubsectorSector(subsector.sector) === sector);
});
const subsectorGroups = computed(() => {
  const groups = new Map();
  for (const subsector of visibleSubsectors.value) {
    const sector = normalizeSubsectorSector(subsector.sector);
    if (!groups.has(sector)) groups.set(sector, []);
    groups.get(sector).push(subsector);
  }
  return [...groups.entries()].map(([sector, subsectors]) => ({
    sector,
    label: formatSectorName(sector),
    subsectors: subsectors.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
  }));
});

const openSubsectorAccess = async user => {
  if (!canManageUser(user) || user.subsectorAccess?.mode !== 'EXPLICIT') return;
  subsectorTarget.value = user;
  selectedSubsectorIds.value = (user.subsectorIds || []).map(Number);
  availableSubsectors.value = [];
  showSubsectorModal.value = true;
  loadingSubsectorAccess.value = true;
  try {
    const response = await api.get('/settings/subsectors', { params: { includeArchived: true } });
    availableSubsectors.value = response.data || [];
  } catch (error) {
    showNotification('error', error.response?.data?.error || 'Erro ao carregar subsetores disponíveis.');
  } finally {
    loadingSubsectorAccess.value = false;
  }
};

const saveSubsectorAccess = async () => {
  if (!subsectorTarget.value || savingSubsectorAccess.value) return;
  savingSubsectorAccess.value = true;
  try {
    await api.put(`/users/${subsectorTarget.value.id}/subsector-access`, {
      subsectorIds: selectedSubsectorIds.value.map(Number),
    });
    showNotification('success', `Acessos de subsetor atualizados para ${subsectorTarget.value.nome || subsectorTarget.value.usuario}.`);
    showSubsectorModal.value = false;
    await fetchUsers();
  } catch (error) {
    showNotification('error', error.response?.data?.error || 'Erro ao salvar os acessos de subsetor.');
    if (error.response?.status === 409) await fetchUsers();
  } finally {
    savingSubsectorAccess.value = false;
  }
};

onMounted(() => {
  fetchUsers();
});
</script>

<template>
  <Layout>
    <ToastNotification :notification="notification" />

    <div class="p-6 max-w-7xl mx-auto">
      <div class="flex justify-between items-center mb-8">
        <div>
          <h1 class="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <UsersIcon class="w-8 h-8 text-blue-600" />
            Gestão de Usuários e RBAC Setorial
          </h1>
          <p class="text-gray-600 mt-1">Gerencie os níveis de acesso e vincule setores de operação para Líderes e Movimentadores</p>
        </div>

        <div class="flex items-center gap-3">
          <button @click="openAuditModal"
            class="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition flex items-center gap-1.5 border border-slate-200 shadow-sm cursor-pointer">
            <ShieldCheck class="w-4 h-4 text-indigo-600" />
            Auditoria de Permissões
          </button>

          <div class="relative">
            <Search class="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input v-model="searchTerm" type="text" placeholder="Buscar por nome, setor ou matrícula..."
              class="pl-9 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none w-64 text-xs bg-white" />
          </div>
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
                <th class="px-6 py-4 text-left text-sm font-semibold text-gray-600">Escopo de subsetores</th>
                <th class="px-6 py-4 text-center text-sm font-semibold text-gray-600">Ações</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr v-if="loading">
                <td colspan="6" class="px-6 py-8 text-center text-gray-500">Carregando usuários...</td>
              </tr>

              <tr v-else-if="filteredUsers.length === 0">
                <td colspan="6" class="px-6 py-8 text-center text-gray-500">Nenhum usuário encontrado.</td>
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
                  <p class="text-sm font-medium text-gray-800">{{ formatSectorName(user.setor, user.setor || "-") }}</p>
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
                    v-else-if="user.role === 'leitor' && user.linkedSector"
                    class="px-2.5 py-1 rounded-full text-xs font-bold bg-sky-50 text-sky-800 border border-sky-200 flex items-center gap-1 w-fit"
                    title="Setor de referência; o Leitor continua consultando todos os setores"
                  >
                    <Layers class="w-3 h-3 text-sky-600" />
                    Referência: {{ formatSectorName(user.linkedSector) }}
                  </span>
                  <span
                    v-else-if="user.assignedSector"
                    class="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200 flex items-center gap-1 w-fit"
                  >
                    <Layers class="w-3 h-3 text-blue-600" />
                    {{ formatSectorName(user.assignedSector) }}
                  </span>
                  <span
                    v-else-if="user.role === 'leitor'"
                    class="text-xs text-gray-500 font-medium"
                  >
                    Todos os setores (leitura)
                  </span>
                  <span
                    v-else
                    class="text-xs text-gray-400 font-medium"
                  >
                    Todos / Livre
                  </span>
                </td>

                <td class="px-6 py-4">
                  <span v-if="user.subsectorAccess?.mode === 'UNIT'" class="rounded-full border border-purple-200 bg-purple-50 px-2.5 py-1 text-xs font-bold text-purple-700">
                    Todos os subsetores da unidade
                  </span>
                  <span v-else-if="user.subsectorAccess?.mode === 'SECTOR'" class="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700">
                    Todos de {{ formatSectorName(user.linkedSector || user.assignedSector) }}
                  </span>
                  <div v-else-if="user.subsectorAccess?.subsectors?.length" class="flex max-w-xs flex-wrap gap-1">
                    <span v-for="subsector in user.subsectorAccess.subsectors" :key="subsector.id" class="rounded-full border px-2 py-0.5 text-[11px] font-semibold" :class="subsector.active ? 'border-blue-100 bg-blue-50 text-blue-800' : 'border-gray-200 bg-gray-100 text-gray-500'">
                      {{ subsector.name }}<span v-if="!subsector.active"> · arquivado</span>
                    </span>
                  </div>
                  <span v-else class="text-xs text-gray-500">Nenhum vínculo explícito · legado conforme setor</span>
                </td>

                <td class="px-6 py-4 text-center">
                  <div class="flex justify-center gap-2">
                    <button v-if="user.subsectorAccess?.mode === 'EXPLICIT'" @click="openSubsectorAccess(user)"
                      class="rounded-lg p-2 text-indigo-600 transition-colors hover:bg-indigo-50" title="Gerenciar subsetores do usuário"
                      :disabled="!canManageUser(user)" :class="{ 'cursor-not-allowed opacity-50': !canManageUser(user) }">
                      <Layers class="h-5 w-5" />
                    </button>
                    <button @click="openEditModal(user)"
                      class="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Editar Permissão e Setor"
                      :disabled="!canManageUser(user) || user.usuario === (auth.user?.usuario || auth.user?.nome)"
                      :class="{ 'opacity-50 cursor-not-allowed': !canManageUser(user) || user.usuario === (auth.user?.usuario || auth.user?.nome) }">
                      <Edit class="w-5 h-5" />
                    </button>

                    <button @click="deleteUser(user)"
                      class="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Remover Usuário"
                      :disabled="!canManageUser(user) || user.usuario === (auth.user?.usuario || auth.user?.nome)"
                      :class="{ 'opacity-50 cursor-not-allowed': !canManageUser(user) || user.usuario === (auth.user?.usuario || auth.user?.nome) }">
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

    <!-- Modal de concessões explícitas de subsetor -->
    <div v-if="showSubsectorModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <section class="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header class="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-6 py-4">
          <div>
            <h3 class="font-bold text-gray-900">Acesso a subsetores</h3>
            <p class="mt-0.5 text-xs text-gray-500">{{ subsectorTarget?.nome || subsectorTarget?.usuario }}</p>
          </div>
          <button type="button" @click="showSubsectorModal = false" class="rounded p-1 text-xl text-gray-400 hover:bg-gray-200" aria-label="Fechar">&times;</button>
        </header>

        <div class="space-y-4 overflow-y-auto p-6">
          <div class="rounded-xl border border-indigo-100 bg-indigo-50/70 p-3 text-xs text-indigo-900">
            Este perfil só poderá consultar ou operar nos subsetores selecionados, conforme as permissões já definidas para seu papel. Registros antigos sem subsetor continuam seguindo o escopo de setor existente.
          </div>
          <p v-if="subsectorTargetSector" class="text-xs font-semibold text-gray-600">
            Setor vinculado: {{ formatSectorName(subsectorTargetSector) }}. A lista respeita esse setor.
          </p>
          <p v-else class="text-xs font-semibold text-gray-600">Este usuário não tem setor de referência; os vínculos escolhidos delimitam os subsetores visíveis.</p>

          <div v-if="loadingSubsectorAccess" class="py-8 text-center text-sm text-gray-500">Carregando subsetores…</div>
          <div v-else-if="!subsectorGroups.length" class="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
            Nenhum subsetor está disponível para este escopo. Cadastre subsetores em Configurações → Subsetores.
          </div>
          <div v-else class="space-y-4">
            <fieldset v-for="group in subsectorGroups" :key="group.sector" class="rounded-xl border border-gray-200 p-4">
              <legend class="px-1 text-xs font-bold uppercase text-gray-600">{{ group.label }}</legend>
              <div class="grid gap-2 sm:grid-cols-2">
                <label v-for="subsector in group.subsectors" :key="subsector.id"
                  class="flex items-start gap-2 rounded-lg border p-3 text-sm"
                  :class="selectedSubsectorIds.includes(Number(subsector.id)) ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200'">
                  <input v-model="selectedSubsectorIds" type="checkbox" :value="Number(subsector.id)"
                    :disabled="savingSubsectorAccess || (!subsector.active && !selectedSubsectorIds.includes(Number(subsector.id)))"
                    class="mt-0.5 rounded border-gray-300 text-indigo-600" />
                  <span class="min-w-0">
                    <span class="block font-semibold text-gray-800">{{ subsector.name }}</span>
                    <span v-if="!subsector.active" class="text-[11px] font-medium text-amber-700">Arquivado · concessão atual pode ser mantida ou removida</span>
                  </span>
                </label>
              </div>
            </fieldset>
          </div>
        </div>

        <footer class="flex justify-end gap-2 border-t border-gray-100 bg-gray-50 px-6 py-4">
          <button type="button" @click="showSubsectorModal = false" class="rounded-lg px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-200">Cancelar</button>
          <button type="button" @click="saveSubsectorAccess" :disabled="loadingSubsectorAccess || savingSubsectorAccess" class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50">
            {{ savingSubsectorAccess ? 'Salvando…' : 'Salvar acessos' }}
          </button>
        </footer>
      </section>
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
              <label v-for="option in assignableRoles" :key="option.value"
                class="flex items-start p-2.5 border rounded-lg cursor-pointer transition-all hover:bg-gray-50"
                :class="{ 'border-blue-500 bg-blue-50 ring-1 ring-blue-500': editingUser.role === option.value }">
                <input type="radio" v-model="editingUser.role" :value="option.value"
                  class="text-blue-600 focus:ring-blue-500 h-4 w-4 mr-3 mt-0.5" />
                <div class="flex items-start gap-2">
                  <component :is="option.icon" class="w-4 h-4 text-gray-500 mt-0.5 shrink-0" />
                  <div>
                    <span class="font-bold text-gray-800">{{ option.label }}</span>
                    <p class="text-[11px] text-gray-500 font-normal leading-tight mt-0.5">{{ option.description }}</p>
                  </div>
                </div>
              </label>
            </div>
          </div>

          <!-- Setor Vinculado (RBAC) -->
          <div class="mt-4">
            <label class="block text-xs font-bold text-gray-700 uppercase mb-1">
              Setor Vinculado (RBAC) {{ editingUser.role === 'leitor' ? '(opcional)' : '*' }}
            </label>
            <select
              v-model="editingUser.assignedSector"
              class="w-full px-3 py-2 border rounded-lg uppercase text-sm font-medium focus:ring-2 focus:ring-blue-500 bg-white"
              :disabled="editingUser.role === 'admin'"
            >
              <option :value="null" :disabled="!['admin', 'leitor'].includes(editingUser.role)">{{ editingUser.role === 'admin' ? 'TODOS OS SETORES / IRRESTRITO (MASTER)' : editingUser.role === 'leitor' ? 'SEM REFERÊNCIA — CONSULTA TODOS' : 'SELECIONE UM SETOR' }}</option>
              <option v-for="sector in sectorOptions" :key="sector.value" :value="sector.value">{{ sector.label }}</option>
            </select>
            <p v-if="editingUser.role === 'admin'" class="text-xs text-gray-500 mt-1">
              * Administradores Master possuem acesso automático a todos os setores.
            </p>
            <p v-else-if="editingUser.role === 'leitor'" class="text-xs text-gray-500 mt-1">
              O setor é uma referência opcional. Leitores continuam consultando todos os setores da unidade e não alteram estoque.
            </p>
            <p v-else class="text-[11px] text-gray-500 mt-1">
              * Administrador de Setor aprova requisições e gerencia seu setor. Líderes e Movimentadores realizam operações no estoque deste setor.
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

    <!-- Modal de Auditoria de Permissões RBAC (LGPD / Segurança Dass) -->
    <div v-if="showAuditModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden animate-fade-in flex flex-col max-h-[85vh]">
        <div class="bg-slate-900 text-white px-6 py-4 flex justify-between items-center shrink-0">
          <div class="flex items-center gap-2">
            <ShieldCheck class="w-5 h-5 text-indigo-400" />
            <div>
              <h3 class="font-bold text-sm leading-tight">Auditoria de Alteração de Permissões RBAC</h3>
              <p class="text-[11px] text-slate-400">Rastreabilidade formal de promoções, trocas de papéis e vínculos de setores</p>
            </div>
          </div>
          <button @click="showAuditModal = false" class="text-slate-400 hover:text-white font-bold text-xl cursor-pointer">&times;</button>
        </div>

        <div class="p-6 overflow-y-auto flex-1">
          <div v-if="loadingAudit" class="p-8 text-center text-gray-400">
            Carregando histórico de auditoria...
          </div>
          <div v-else-if="auditLogs.length === 0" class="p-8 text-center text-gray-400 italic text-xs">
            Nenhuma alteração de permissão registrada até o momento.
          </div>
          <div v-else class="rounded-xl border border-gray-100 overflow-hidden">
            <table class="w-full text-left text-xs">
              <thead class="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider border-b border-gray-100">
                <tr>
                  <th class="px-4 py-3">Data / Hora</th>
                  <th class="px-4 py-3">Usuário Afetado</th>
                  <th class="px-4 py-3 text-center">Papel Anterior ➔ Novo</th>
                  <th class="px-4 py-3 text-center">Setor RBAC</th>
                  <th class="px-4 py-3 text-right">Alterado Por</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100 font-medium">
                <tr v-for="log in auditLogs" :key="log.id" class="hover:bg-slate-50/50">
                  <td class="px-4 py-3 font-mono text-[11px] text-gray-500 whitespace-nowrap">
                    {{ formatDate(log.changedAt) }}
                  </td>
                  <td class="px-4 py-3">
                    <p class="font-bold text-gray-900">{{ log.nome || log.usuario }}</p>
                    <p class="text-[10px] text-gray-400 font-mono">{{ log.usuario }}</p>
                  </td>
                  <td class="px-4 py-3 text-center">
                    <div class="flex items-center justify-center gap-1.5 font-bold">
                      <span class="px-2 py-0.5 rounded text-[10px] bg-gray-100 text-gray-600">
                        {{ getRoleInfo(log.previousRole).label }}
                      </span>
                      <span class="text-indigo-500">➔</span>
                      <span :class="`px-2 py-0.5 rounded text-[10px] ${getRoleInfo(log.newRole).color}`">
                        {{ getRoleInfo(log.newRole).label }}
                      </span>
                    </div>
                  </td>
                  <td class="px-4 py-3 text-center text-[11px] font-bold text-slate-700">
                    <span v-if="log.newSector" class="px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-100">
                      {{ formatSectorName(log.newSector) }}
                    </span>
                    <span v-else class="text-gray-400 italic">Livre / Master</span>
                  </td>
                  <td class="px-4 py-3 text-right">
                    <p class="font-bold text-gray-800">{{ log.changedByName }}</p>
                    <p v-if="log.changedById" class="text-[10px] text-gray-400 font-mono">Matrícula: {{ log.changedById }}</p>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="px-6 py-3.5 bg-gray-50 border-t flex justify-end shrink-0">
          <button @click="showAuditModal = false"
            class="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold transition shadow-sm cursor-pointer">
            Fechar
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
