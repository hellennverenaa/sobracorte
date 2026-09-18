<template>
  <Layout>
    <div class="max-w-5xl mx-auto px-4 py-8">

      <!-- Cabeçalho -->
      <div class="flex items-center gap-3 mb-8">
        <div class="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
          <SettingsIcon class="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Configurações</h1>
          <p class="text-sm text-gray-500">Gerencie os valores de domínio do sistema</p>
        </div>
        <span v-if="authStore.user?.role === 'leitor'" class="ml-auto bg-amber-100 text-amber-800 text-xs px-3 py-1 rounded-full font-bold border border-amber-200">
          Modo Consulta (Somente Leitura)
        </span>
      </div>

      <ToastNotification :notification="notification" />

      <SettingsTabNav :active-tab="activeTab" :tabs="tabs" @update:active-tab="changeTab" />
      <PageState
        :loading="settingsLoading"
        :error="settingsError"
        :empty="false"
        @retry="settingsData.fetchAll"
      />

      <!-- ABA 1: CATEGORIAS                         -->
      <div v-if="activeTab === 'categories'" class="space-y-6">
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div class="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
            <h2 class="font-bold text-gray-800 flex items-center gap-2">
              <Tag class="w-4 h-4 text-indigo-500" /> Categorias de Materiais
            </h2>
            <span class="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">governa Material.type</span>
          </div>
          
          <!-- Formulário de adição (Oculto para perfil leitor) -->
          <div v-if="canManageSettings" class="px-6 py-4 border-b border-gray-100 bg-indigo-50/30">
            <form @submit.prevent="addCategory" class="flex gap-4 items-end flex-wrap">
              <div class="flex-1 min-w-[200px]">
                <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Nome da Categoria</label>
                <input v-model="newCategory.name" required placeholder="Ex: TECIDO, COURO, TINTAS..."
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-400 uppercase bg-white"
                  style="text-transform: uppercase" />
              </div>

              <div class="w-48 min-w-[160px]">
                <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Setor</label>
                <select v-model="newCategory.sector"
                  :disabled="authStore.user?.role === 'admin_setor'"
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-400 bg-white font-medium uppercase">
                  <option value="">Geral / Livre</option>
                  <option value="CORTE">Corte</option>
                  <option value="APOIO">Apoio</option>
                  <option value="PRE_FABRICADO">Pré-Fabricado</option>
                  <option value="DISTRIBUICAO">Distribuição</option>
                  <option value="MONTAGEM">Montagem</option>
                </select>
              </div>
              
              <div class="w-64 min-w-[180px]">
                <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Unidade Padrão</label>
                <select v-model="newCategory.defaultUnitCode"
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-400 bg-white font-medium">
                  <option value="">Nenhuma (Livre para escolha)</option>
                  <option v-for="unit in units" :key="unit.symbol" :value="unit.symbol">
                    {{ unit.name }} ({{ unit.symbol }})
                  </option>
                </select>
              </div>

              <div class="flex items-center gap-2 pb-2">
                <input type="checkbox" id="unitLockedCheck" v-model="newCategory.unitLocked"
                  class="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 cursor-pointer" />
                <label for="unitLockedCheck" class="text-xs font-bold text-gray-700 cursor-pointer flex items-center gap-1">
                  <Lock class="w-3.5 h-3.5 text-amber-600" />
                  Bloquear Unidade
                </label>
              </div>

              <button type="submit" :disabled="loadingCategory"
                class="px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold text-sm hover:bg-indigo-700 transition flex items-center gap-2 disabled:opacity-50 ml-auto">
                <Plus class="w-4 h-4" />
                Adicionar
              </button>
            </form>
          </div>

          <!-- Filtro de Setor para Categorias -->
          <div class="px-6 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between flex-wrap gap-3">
            <span class="text-xs font-bold text-gray-500 uppercase">Categorias Cadastradas</span>
            <div class="flex items-center gap-2">
              <label class="text-xs font-bold text-gray-500 uppercase">Filtrar Setor:</label>
              <select v-model="categoryFilterSector"
                class="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium uppercase outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
                <option value="TODOS">Todos os Setores</option>
                <option value="CORTE">Corte</option>
                <option value="APOIO">Apoio</option>
                <option value="PRE_FABRICADO">Pré-Fabricado</option>
                <option value="DISTRIBUICAO">Distribuição</option>
                <option value="MONTAGEM">Montagem</option>
              </select>
            </div>
          </div>

          <!-- Lista -->
          <div v-if="loadingCategory" class="p-8 text-center text-gray-400">Carregando...</div>
          <table v-else class="w-full text-left">
            <thead class="bg-gray-50 text-xs font-bold text-gray-400 uppercase tracking-wider">
              <tr>
                <th class="px-6 py-3">Nome</th>
                <th class="px-6 py-3 text-center">Setor</th>
                <th class="px-6 py-3 text-center">Unidade Padrão</th>
                <th class="px-6 py-3 text-center">Regra de Trava</th>
                <th v-if="canManageSettings" class="px-6 py-3 text-center">Ação</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              <tr v-for="cat in filteredCategories" :key="cat.id" class="hover:bg-gray-50/50 transition-colors">
                <td class="px-6 py-3 font-bold text-gray-800 font-mono text-sm">{{ cat.name }}</td>
                <td class="px-6 py-3 text-center">
                  <span class="px-2.5 py-0.5 rounded-full text-xs font-bold border bg-slate-50 text-slate-700 border-slate-200">
                    {{ formatSectorName(cat.sector) }}
                  </span>
                </td>
                <td class="px-6 py-3 text-center">
                  <span v-if="cat.defaultUnitCode" class="px-2.5 py-0.5 rounded-full text-xs font-bold border bg-indigo-50 text-indigo-700 border-indigo-100">
                    {{ units.find(u => u.symbol === cat.defaultUnitCode)?.name }} ({{ cat.defaultUnitCode }})
                  </span>
                  <span v-else class="text-xs text-gray-400 italic">Livre</span>
                </td>
                <td class="px-6 py-3 text-center">
                  <span v-if="cat.unitLocked" class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                    <Lock class="w-3 h-3" /> Bloqueada
                  </span>
                  <span v-else class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-600 border border-gray-200">
                    Livre
                  </span>
                </td>
                <td v-if="canManageSettings" class="px-6 py-3 text-center">
                  <button @click="deleteCategory(cat)"
                    class="text-gray-300 hover:text-red-500 transition-colors p-1 rounded hover:bg-red-50" title="Excluir Categoria">
                    <Trash2 class="w-4 h-4" />
                  </button>
                </td>
              </tr>
              <tr v-if="filteredCategories.length === 0">
                <td :colspan="canManageSettings ? 5 : 4" class="px-6 py-8 text-center text-gray-400 text-sm italic">Nenhuma categoria cadastrada.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ABA 3: LOCALIZAÇÕES                       -->
      <div v-if="activeTab === 'locations'" class="space-y-6">
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div class="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between flex-wrap gap-3">
            <h2 class="font-bold text-gray-800 flex items-center gap-2">
              <MapPin class="w-4 h-4 text-emerald-500" /> Localizações de Armazenamento
            </h2>
            <span class="text-xs text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full font-semibold">
              {{ authStore.user?.role === 'admin_setor' ? `Setor: ${formatSectorName(authStore.user.assignedSector)}` : 'Governança de Prateleiras' }}
            </span>
          </div>
          
          <!-- Formulário de adição de Localização (Oculto para perfil leitor) -->
          <div v-if="canManageSettings" class="px-6 py-4 border-b border-gray-100 bg-emerald-50/30">
            <form @submit.prevent="addLocation" class="space-y-3">
              <div class="flex gap-3 items-end flex-wrap">
                <div class="flex-1 min-w-[200px]">
                  <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Nome da Localização</label>
                  <input v-model="newLocation.name" required placeholder="Ex: Rua 03 - Caixote 58 - Nível 01"
                    class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-400 bg-white uppercase" />
                </div>

                <div v-if="authStore.user?.role === 'admin_setor'" class="w-48 min-w-[160px]">
                  <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Setor</label>
                  <div class="px-3 py-2 border border-emerald-200 bg-emerald-50 rounded-lg text-sm font-bold text-emerald-800 uppercase">
                    {{ formatSectorName(authStore.user.assignedSector) }}
                  </div>
                </div>
                <div v-else class="w-48 min-w-[160px]">
                  <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Setor</label>
                  <select
                    v-model="newLocation.sector"
                    class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-400 bg-white font-medium uppercase"
                  >
                    <option value="">Geral / Livre</option>
                    <option value="CORTE">Corte</option>
                    <option value="APOIO">Apoio</option>
                    <option value="PRE_FABRICADO">Pré-Fabricado</option>
                    <option value="DISTRIBUICAO">Distribuição</option>
                    <option value="MONTAGEM">Montagem</option>
                  </select>
                </div>

                <button type="submit" :disabled="loadingLocation || !newLocation.name.trim()"
                  class="px-4 py-2 bg-emerald-600 text-white rounded-lg font-bold text-sm hover:bg-emerald-700 transition flex items-center gap-2 disabled:opacity-50 h-10">
                  <Plus class="w-4 h-4" /> Adicionar Localização
                </button>
              </div>

              <div>
                <label class="block text-xs font-bold text-gray-500 uppercase mb-1.5 flex items-center justify-between">
                  <span>Categorias / Materiais Permitidos (Opcional - Filtrado pelo Setor da Prateleira)</span>
                  <span class="text-[11px] text-gray-400 font-normal">Se não selecionar, a prateleira é de uso livre do setor</span>
                </label>
                <div v-if="availableCategoriesForNewLocation.length > 0" class="flex flex-wrap gap-2">
                  <button
                    v-for="cat in availableCategoriesForNewLocation"
                    :key="cat.id"
                    type="button"
                    @click="toggleCategorySelection(cat.id)"
                    class="px-3 py-1 rounded-full text-xs font-bold transition-all border"
                    :class="newLocation.categoryIds.includes(cat.id)
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-emerald-300'"
                  >
                    {{ cat.name }}
                  </button>
                </div>
                <p v-else class="text-xs text-gray-500 italic">
                  Nenhuma categoria cadastrada para este setor. A prateleira será de uso geral vinculada ao setor.
                </p>
                <p v-if="availableCategoriesForNewLocation.length > 0 && newLocation.categoryIds.length === 0" class="text-[11px] text-emerald-700 font-medium mt-1">
                  ✓ Uso livre: Qualquer material ou componente deste setor pode ser armazenado aqui.
                </p>
              </div>
            </form>
          </div>

          <div v-if="loadingLocation" class="p-8 text-center text-gray-400">Carregando...</div>
          <table v-else class="w-full text-left">
            <thead class="bg-gray-50 text-xs font-bold text-gray-400 uppercase tracking-wider">
              <tr>
                <th class="px-6 py-3">Nome da Localização</th>
                <th class="px-6 py-3 text-center">Setor</th>
                <th class="px-6 py-3 text-center">Categorias Permitidas</th>
                <th v-if="canManageSettings" class="px-6 py-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              <tr v-for="loc in filteredLocations" :key="loc.id" class="hover:bg-gray-50/50 transition-colors">
                <td class="px-6 py-3 text-sm text-gray-700 font-medium">{{ loc.name }}</td>
                <td class="px-6 py-3 text-center">
                  <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                    {{ formatSectorName(loc.sector) }}
                  </span>
                </td>
                <td class="px-6 py-3 text-center">
                  <div class="flex flex-wrap items-center justify-center gap-1.5">
                    <template v-if="loc.categoryLinks && loc.categoryLinks.length > 0">
                      <span
                        v-for="link in loc.categoryLinks"
                        :key="link.categoryId"
                        class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200"
                      >
                        {{ link.category ? link.category.name : `Cat #${link.categoryId}` }}
                      </span>
                    </template>
                    <span
                      v-else-if="loc.category"
                      class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200"
                    >
                      {{ loc.category.name }}
                    </span>
                    <span v-else class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">Geral do Setor</span>
                  </div>
                </td>
                <td v-if="canManageSettings" class="px-6 py-3 text-center">
                  <div class="flex items-center justify-center gap-2">
                    <button
                      @click="openEditLocationModal(loc)"
                      class="text-gray-400 hover:text-blue-600 transition-colors p-1 rounded hover:bg-blue-50"
                      title="Editar Categorias & Setor"
                    >
                      <Pencil class="w-4 h-4" />
                    </button>
                    <button
                      @click="deleteLocation(loc)"
                      class="text-gray-400 hover:text-red-600 transition-colors p-1 rounded hover:bg-red-50"
                      title="Excluir"
                    >
                      <Trash2 class="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
              <tr v-if="locations.length === 0">
                <td :colspan="canManageSettings ? 4 : 3" class="px-6 py-8 text-center text-gray-400 text-sm italic">Nenhuma localização cadastrada.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ABA 4: ORIGENS                            -->
      <div v-if="activeTab === 'origins'" class="space-y-6">
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div class="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
            <h2 class="font-bold text-gray-800 flex items-center gap-2">
              <GitBranch class="w-4 h-4 text-amber-500" /> Origens de Sobra
            </h2>
            <span class="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">governa Movement.origem</span>
          </div>
          
          <!-- Formulário de adição de Origem (Oculto para perfil leitor) -->
          <div v-if="canManageSettings" class="px-6 py-4 border-b border-gray-100 bg-amber-50/30">
            <form @submit.prevent="addOrigin" class="flex gap-3 items-end flex-wrap">
              <div class="flex-1 min-w-[200px]">
                <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Nome da Origem</label>
                <input v-model="newOrigin" required placeholder="Ex: Devolução de Produção"
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-amber-400 bg-white uppercase" />
              </div>

              <div class="w-48 min-w-[160px]">
                <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Setor</label>
                <select
                  v-model="newOriginSector"
                  :disabled="authStore.user?.role === 'admin_setor'"
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-amber-400 bg-white font-medium uppercase"
                >
                  <option value="">Geral / Livre</option>
                  <option value="CORTE">Corte</option>
                  <option value="APOIO">Apoio</option>
                  <option value="PRE_FABRICADO">Pré-Fabricado</option>
                  <option value="DISTRIBUICAO">Distribuição</option>
                  <option value="MONTAGEM">Montagem</option>
                </select>
              </div>

              <button type="submit" :disabled="loadingOrigin"
                class="px-4 py-2 bg-amber-500 text-white rounded-lg font-bold text-sm hover:bg-amber-600 transition flex items-center gap-2 disabled:opacity-50 h-10">
                <Plus class="w-4 h-4" /> Adicionar
              </button>
            </form>
          </div>
          <div v-if="loadingOrigin" class="p-8 text-center text-gray-400">Carregando...</div>
          <table v-else class="w-full text-left">
            <thead class="bg-gray-50 text-xs font-bold text-gray-400 uppercase tracking-wider">
              <tr>
                <th class="px-6 py-3">Descrição da Origem</th>
                <th class="px-6 py-3 text-center">Setor</th>
                <th v-if="canManageSettings" class="px-6 py-3 text-center">Ação</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              <tr v-for="orig in origins" :key="orig.id" class="hover:bg-gray-50/50 transition-colors">
                <td class="px-6 py-3 text-sm text-gray-700 font-medium">{{ orig.name }}</td>
                <td class="px-6 py-3 text-center">
                  <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                    {{ formatSectorName(orig.sector) }}
                  </span>
                </td>
                <td v-if="canManageSettings" class="px-6 py-3 text-center">
                  <button @click="deleteOrigin(orig)"
                    class="text-gray-300 hover:text-red-500 transition-colors p-1 rounded hover:bg-red-50" title="Excluir">
                    <Trash2 class="w-4 h-4" />
                  </button>
                </td>
              </tr>
              <tr v-if="origins.length === 0">
                <td :colspan="canManageSettings ? 3 : 2" class="px-6 py-8 text-center text-gray-400 text-sm italic">Nenhuma origem cadastrada.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ABA 5: IMPORTAR CSV                       -->
      <div v-if="activeTab === 'import'" class="space-y-6">
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          
          <!-- Cabeçalho da Aba -->
          <div class="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 class="font-bold text-gray-800 flex items-center gap-2 text-lg">
                <FileSpreadsheet class="w-5 h-5 text-blue-600" /> Importação Multi-Setor em Lote (CSV)
              </h2>
              <p class="text-sm text-gray-500 mt-0.5">
                Cadastre materiais e componentes fabris em lote para todos os setores industriais.
              </p>
            </div>
            
            <!-- Botão de Download de Modelos por Setor -->
            <div class="flex items-center gap-2 flex-wrap">
              <select
                v-model="templateSector"
                class="px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value="CORTE">Modelo: Corte (Matéria-Prima)</option>
                <option value="APOIO">Modelo: Apoio (Moldes/Peças)</option>
                <option value="PRE_FABRICADO">Modelo: Pré-Fabricado (Solas)</option>
                <option value="DISTRIBUICAO">Modelo: Distribuição</option>
                <option value="MONTAGEM">Modelo: Montagem (Pés Órfãos)</option>
              </select>
              <button @click="downloadCSVTemplate(templateSector)"
                class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md shadow-emerald-200 transition flex items-center gap-2 shrink-0 cursor-pointer">
                <Download class="w-4 h-4" /> Baixar Modelo (.csv)
              </button>
            </div>
          </div>

          <div class="p-6 space-y-6">

            <!-- CARD DE INSTRUÇÕES E FORMATO EXIGIDO (UX/UI DINÂMICA POR SETOR) -->
            <div class="bg-gradient-to-br from-slate-50 to-blue-50/40 border border-blue-100 rounded-2xl p-6 space-y-4">
              <div class="flex items-center gap-2 text-blue-900 font-bold text-sm">
                <HelpCircle class="w-4 h-4 text-blue-600" />
                <span>{{ sectorCsvPattern.title }}</span>
              </div>
              
              <p class="text-xs text-gray-600 leading-relaxed">
                Para garantir o processamento correto e evitar rejeição no setor selecionado, seu arquivo <strong>.csv</strong> deve utilizar delimitador por <strong>ponto e vírgula (;)</strong> ou <strong>vírgula (,)</strong> e conter as colunas especificadas abaixo no cabeçalho (primeira linha):
              </p>

              <!-- Tabela Dinâmica de Colunas -->
              <div class="overflow-x-auto rounded-xl border border-blue-100 bg-white">
                <table class="w-full text-left text-xs">
                  <thead class="bg-blue-50/70 text-blue-900 font-bold uppercase tracking-wider">
                    <tr>
                      <th class="px-4 py-2">Coluna</th>
                      <th class="px-4 py-2">Obrigatoriedade</th>
                      <th class="px-4 py-2">Descrição & Exemplo</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-100 text-gray-700 font-medium">
                    <tr v-for="col in sectorCsvPattern.columns" :key="col.name">
                      <td class="px-4 py-2.5 font-mono font-bold text-indigo-600">{{ col.name }}</td>
                      <td class="px-4 py-2.5">
                        <span v-if="col.req" class="bg-red-100 text-red-700 px-2 py-0.5 rounded text-[10px] font-bold">Obrigatório</span>
                        <span v-else class="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-[10px] font-bold">Opcional</span>
                      </td>
                      <td class="px-4 py-2.5">{{ col.desc }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <!-- Bloco de Exemplo Visual Dinâmico -->
              <div class="bg-slate-900 text-slate-200 rounded-xl p-4 text-xs font-mono overflow-x-auto shadow-inner">
                <div class="text-slate-400 text-[10px] mb-2 font-sans font-bold uppercase tracking-wider flex items-center justify-between">
                  <span>Exemplo de Arquivo CSV Válido ({{ formatSectorName(templateSector) }})</span>
                  <span>Codificação: UTF-8</span>
                </div>
                <code>{{ sectorCsvPattern.headerExample }}</code><br />
                <template v-for="(exLine, idx) in sectorCsvPattern.examples" :key="idx">
                  <code class="text-emerald-400">{{ exLine }}</code><br />
                </template>
              </div>
            </div>

            <!-- Upload Area -->
            <div class="border-2 border-dashed border-gray-200 rounded-2xl p-8 text-center hover:border-indigo-400 hover:bg-indigo-50/20 transition-all cursor-pointer relative"
              @dragover.prevent @drop.prevent="handleDrop">
              <FileSpreadsheet class="w-12 h-12 text-blue-500/60 mx-auto mb-3" />
              <p class="text-gray-700 font-bold mb-1 text-sm">Arraste e solte o arquivo CSV aqui</p>
              <p class="text-xs text-gray-400 mb-4">ou clique no botão abaixo para navegar nos arquivos</p>
              
              <label class="cursor-pointer bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-xs font-bold hover:bg-indigo-700 transition inline-flex items-center gap-2 shadow-md shadow-indigo-200">
                <Upload class="w-4 h-4" /> Selecionar Arquivo .CSV
                <input type="file" accept=".csv" class="hidden" @change="handleFileSelect" :disabled="importing" />
              </label>
            </div>

            <!-- Preview do Arquivo Selecionado -->
            <div v-if="selectedFile" class="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-3">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <FileSpreadsheet class="w-8 h-8 text-blue-600" />
                  <div>
                    <p class="font-bold text-blue-900 text-sm">{{ selectedFile.name }}</p>
                    <p class="text-xs text-blue-500">{{ (selectedFile.size / 1024).toFixed(1) }} KB</p>
                  </div>
                </div>
                <button @click="selectedFile = null; importResult = null" class="text-blue-400 hover:text-red-500 transition">
                  <XCircle class="w-5 h-5" />
                </button>
              </div>

              <!-- Setor de Destino Padrão -->
              <div class="flex items-center gap-2 pt-2 border-t border-blue-100 text-xs">
                <span class="font-bold text-blue-900">Setor de Destino Padrão:</span>
                <select
                  v-model="importSector"
                  class="px-2.5 py-1 bg-white border border-blue-200 rounded-lg font-bold text-blue-900 outline-none"
                  :disabled="authStore.user?.assignedSector && authStore.user?.assignedSector !== 'TODOS'"
                >
                  <option value="CORTE">Corte (Matéria-Prima)</option>
                  <option value="APOIO">Apoio (Moldes/Peças)</option>
                  <option value="PRE_FABRICADO">Pré-Fabricado (Solas)</option>
                  <option value="DISTRIBUICAO">Distribuição</option>
                  <option value="MONTAGEM">Montagem (Pés Órfãos)</option>
                </select>
                <span class="text-slate-500 text-[11px]">(Utilizado caso a planilha não contenha a coluna 'setor')</span>
              </div>
            </div>

            <!-- Botão de Confirmação -->
            <button v-if="selectedFile" @click="importCSV" :disabled="importing"
              class="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm transition flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-blue-200 cursor-pointer">
              <Loader2 v-if="importing" class="w-4 h-4 animate-spin text-white" />
              <Upload v-else class="w-4 h-4" />
              {{ importing ? 'Processando e Validando Planilha Multi-Setor...' : 'Confirmar Importação de Materiais' }}
            </button>

            <!-- Feedback Amigável de Erro ou Sucesso -->
            <div v-if="importResult" class="rounded-xl p-5 border font-medium text-sm transition-all"
              :class="importResult.error
                ? 'bg-red-50 border-red-200 text-red-800'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800'">
              <div class="flex items-start gap-3">
                <XCircle v-if="importResult.error" class="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                <CheckCircle v-else class="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
                
                <div class="space-y-2 w-full">
                  <p class="font-bold text-sm leading-snug">
                    {{ importResult.error ? 'Falha na Validação da Planilha (Nenhum item foi importado)' : importResult.message }}
                  </p>
                  
                  <p v-if="importResult.error" class="text-xs text-red-700 leading-relaxed">
                    {{ importResult.error }}
                  </p>
                  
                  <div v-else class="text-xs text-emerald-800 space-y-1">
                    <p>
                      <strong>{{ importResult.inseridos }}</strong> materiais cadastrados com sucesso · <strong>{{ importResult.processados }}</strong> processados no total.
                    </p>
                    <p class="text-[11px] text-emerald-700">
                      ✓ Prateleiras e Localizações vinculadas: <strong>{{ importResult.prateleirasCriadas || 0 }}</strong> · Movimentações de Saldo Inicial geradas: <strong>{{ importResult.movimentacoesCriadas || 0 }}</strong>
                    </p>
                  </div>

                  <!-- Tabela Detalhada de Erros Linha a Linha (HTTP 422 Pre-flight) -->
                  <div v-if="importResult.errors && importResult.errors.length > 0" class="mt-3 pt-3 border-t border-red-200">
                    <div class="flex items-center justify-between mb-2">
                      <span class="text-xs font-bold uppercase tracking-wider text-red-900">
                        Inconsistências Encontradas ({{ importResult.errors.length }} {{ importResult.errors.length === 1 ? 'erro' : 'erros' }}):
                      </span>
                    </div>
                    <div class="max-h-60 overflow-y-auto rounded-lg border border-red-200 bg-white">
                      <table class="w-full text-left text-xs">
                        <thead class="bg-red-100/70 text-red-900 font-bold uppercase sticky top-0">
                          <tr>
                            <th class="px-3 py-2 w-16 text-center">Linha</th>
                            <th class="px-3 py-2 w-28">Coluna</th>
                            <th class="px-3 py-2 w-32">Valor</th>
                            <th class="px-3 py-2">Motivo da Rejeição</th>
                          </tr>
                        </thead>
                        <tbody class="divide-y divide-red-100 text-gray-800 font-medium font-sans">
                          <tr v-for="(err, idx) in importResult.errors" :key="idx" class="hover:bg-red-50/50">
                            <td class="px-3 py-1.5 text-center font-bold text-red-700 font-mono">{{ err.row }}</td>
                            <td class="px-3 py-1.5 font-bold font-mono text-indigo-700">{{ err.column }}</td>
                            <td class="px-3 py-1.5 font-mono text-gray-600 truncate max-w-[120px]">{{ err.value || '(vazio)' }}</td>
                            <td class="px-3 py-1.5 text-red-800">{{ err.message }}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                </div>
              </div>
            </div>

          </div>
        </div>
      </div>

      <!-- ABA 6: UNIDADE FABRIL (Exclusiva Admin Master) -->
      <div v-if="activeTab === 'factory_unit'" class="space-y-6">
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div class="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
            <h2 class="font-bold text-gray-800 flex items-center gap-2">
              <Building2 class="w-4 h-4 text-indigo-500" /> Configuração da Unidade Fabril
            </h2>
            <span class="text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-full font-bold">
              {{ authStore.user?.unit?.code }} — {{ authStore.user?.unit?.name }}
            </span>
          </div>

          <div class="p-6 space-y-6">
            <!-- Card Informativo da Unidade -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
              <div>
                <span class="text-gray-400 font-bold uppercase block text-[10px]">Código da Unidade</span>
                <p class="font-mono font-black text-slate-800 text-sm mt-0.5">{{ unitSettings.code || authStore.user?.unit?.code }}</p>
              </div>
              <div>
                <span class="text-gray-400 font-bold uppercase block text-[10px]">Nome da Fábrica</span>
                <p class="font-bold text-slate-800 text-sm mt-0.5">{{ unitSettings.name || authStore.user?.unit?.name }}</p>
              </div>
              <div>
                <span class="text-gray-400 font-bold uppercase block text-[10px]">Status Operacional</span>
                <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 mt-1 border border-emerald-200">
                  <span class="w-2 h-2 rounded-full bg-emerald-500"></span> Ativa
                </span>
              </div>
            </div>

            <!-- Seção de Módulos Opcionais -->
            <div class="border-t border-gray-100 pt-6">
              <h3 class="text-sm font-bold text-gray-800 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Sliders class="w-4 h-4 text-slate-500" /> Módulos Funcionais do Sistema
              </h3>

              <!-- Toggle Card: Módulo de Requisições -->
              <div class="flex items-center justify-between p-4 rounded-2xl border transition-all"
                :class="unitSettings.enableRequisitions 
                  ? 'bg-indigo-50/40 border-indigo-200' 
                  : 'bg-gray-50 border-gray-200'"
              >
                <div class="space-y-1 max-w-xl">
                  <div class="flex items-center gap-2">
                    <ClipboardList class="w-4 h-4" :class="unitSettings.enableRequisitions ? 'text-indigo-600' : 'text-gray-400'" />
                    <span class="font-bold text-sm text-gray-900">Módulo de Requisições Digitais de Sobras</span>
                    <span 
                      class="px-2 py-0.5 text-[10px] font-black rounded-full uppercase"
                      :class="unitSettings.enableRequisitions ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'"
                    >
                      {{ unitSettings.enableRequisitions ? 'Ativado' : 'Desativado' }}
                    </span>
                  </div>
                  <p class="text-xs text-gray-600 leading-relaxed">
                    Quando ativado, exibe a aba de <strong>Requisições</strong> no menu lateral, permite que líderes solicitem sobras com trava de saldo zero e habilita o fluxo de atendimento e baixa digital.
                  </p>
                  <p v-if="!unitSettings.enableRequisitions" class="text-[11px] text-amber-700 font-semibold bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200 inline-block">
                    ⚠️ Ao desativar, o botão de Requisições e as notificações de pendências somem do menu de todos os usuários desta unidade.
                  </p>
                </div>

                <!-- Switch Toggle -->
                <div class="flex items-center gap-3">
                  <button
                    type="button"
                    @click="toggleRequisitionsModule(!unitSettings.enableRequisitions)"
                    :disabled="savingUnitSettings"
                    class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
                    :class="unitSettings.enableRequisitions ? 'bg-indigo-600' : 'bg-gray-300'"
                    title="Alternar Módulo de Requisições"
                  >
                    <span
                      class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out"
                      :class="unitSettings.enableRequisitions ? 'translate-x-5' : 'translate-x-0'"
                    />
                  </button>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>

    </div>

    <!-- MODAL DE EDIÇÃO DE LOCALIZAÇÃO (MULTI-CATEGORIA) -->
    <div v-if="showEditLocationModal" ref="editLocationDialog" role="dialog" aria-modal="true" aria-labelledby="edit-location-title" class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-gray-100">
        <div class="bg-gray-50 px-6 py-4 border-b flex justify-between items-center">
          <h3 id="edit-location-title" class="font-bold text-gray-800 flex items-center gap-2">
            <MapPin class="w-4 h-4 text-emerald-600" />
            Editar Localização & Categorias
          </h3>
          <button @click="closeEditLocationModal" aria-label="Fechar edição de localização" class="text-gray-400 hover:text-gray-600 font-bold text-xl">
            &times;
          </button>
        </div>

        <form @submit.prevent="saveEditLocation" class="p-6 space-y-4 text-xs">
          <div>
            <label class="block font-bold text-gray-500 uppercase mb-1">Nome da Localização *</label>
            <input
              v-model="editingLocation.name"
              type="text"
              required
              class="w-full border border-gray-200 p-2.5 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-400 bg-white font-medium uppercase"
            />
          </div>

          <div v-if="authStore.user?.role === 'admin_setor'">
            <label class="block font-bold text-gray-500 uppercase mb-1">Setor</label>
            <div class="border border-emerald-200 bg-emerald-50 p-2.5 rounded-lg text-sm font-bold text-emerald-800 uppercase">
              {{ formatSectorName(authStore.user.assignedSector) }}
            </div>
          </div>
          <div v-else>
            <label class="block font-bold text-gray-500 uppercase mb-1">Setor</label>
            <select
              v-model="editingLocation.sector"
              class="w-full border border-gray-200 p-2.5 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-400 bg-white font-medium uppercase"
            >
              <option value="">Geral / Livre</option>
              <option value="CORTE">Corte</option>
              <option value="APOIO">Apoio</option>
              <option value="PRE_FABRICADO">Pré-Fabricado</option>
              <option value="DISTRIBUICAO">Distribuição</option>
              <option value="MONTAGEM">Montagem</option>
            </select>
          </div>

          <div>
            <label class="block font-bold text-gray-500 uppercase mb-1.5 flex items-center justify-between">
              <span>Categorias Permitidas (Opcional - Filtradas pelo Setor)</span>
              <span class="text-[10px] text-gray-400 font-normal">Deixe vazio para uso geral do setor</span>
            </label>
            <div v-if="availableCategoriesForEditLocation.length > 0" class="flex flex-wrap gap-2">
              <button
                v-for="cat in availableCategoriesForEditLocation"
                :key="cat.id"
                type="button"
                @click="toggleEditCategorySelection(cat.id)"
                class="px-3 py-1 rounded-full text-xs font-bold transition-all border"
                :class="editingLocation.categoryIds.includes(cat.id)
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                  : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-emerald-300'"
              >
                {{ cat.name }}
              </button>
            </div>
            <p v-else class="text-xs text-gray-500 italic">
              Nenhuma categoria cadastrada para este setor. A prateleira fica vinculada diretamente ao setor.
            </p>
          </div>

          <div class="bg-gray-50 px-6 py-3 -mx-6 -mb-6 border-t flex justify-end gap-2 mt-6">
            <button
              type="button"
              @click="closeEditLocationModal"
              class="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium rounded-lg text-xs"
            >
              Cancelar
            </button>
            <button
              type="submit"
              :disabled="!editingLocation.name.trim()"
              class="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs shadow-sm disabled:opacity-50"
            >
              Salvar Alterações
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- MODAL DE CONFIRMAÇÃO CORPORATIVO -->
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

<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import Layout from '@/components/Layout.vue'
import ConfirmModal from '@/components/ConfirmModal.vue'
import { api } from '@/services/httpClient'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import { useConfirmModal } from '@/composables/useConfirmModal'
import { useUnsavedChanges } from '@/composables/useUnsavedChanges'
import { useModalFocus } from '@/composables/useModalFocus'
import { usePersistedFilters } from '@/composables/usePersistedFilters'
import { useSettings } from '@/composables/useSettings'
import PageState from '@/components/PageState.vue'
import ToastNotification from '@/components/ToastNotification.vue'
import SettingsTabNav from '@/components/SettingsTabNav.vue'
import { normalizeSector } from '@/utils/domain'
import { formatDate, formatNumber } from '@/utils/format'
import {
  Settings as SettingsIcon, Tag, MapPin, GitBranch, FileSpreadsheet, Ruler, Lock, Download, HelpCircle,
  Plus, Trash2, Upload, CheckCircle, XCircle, Pencil, Loader2, Building2, Sliders, ClipboardList
} from 'lucide-vue-next'

const authStore = useAuthStore()
const settingsPersisted = usePersistedFilters('settings', {
  categoryFilterSector: 'TODOS',
  templateSector: authStore.user?.assignedSector || 'CORTE',
}, () => authStore.user?.unit?.code || 'default')

// --- PERMISSÕES ---
const canManageSettings = computed(() => authStore.can('gerenciar_configuracoes'))
const isMasterAdmin = computed(() => authStore.user?.role === 'admin' || Boolean(authStore.user?.isGlobalAdmin))

function formatSectorName(sec) {
  const normalized = normalizeSector(sec)
  const map = {
    CORTE: 'Corte',
    APOIO: 'Apoio',
    PRE_FABRICADO: 'Pré-Fabricado',
    DISTRIBUICAO: 'Distribuição',
    EXPEDICAO: 'Distribuição',
    MONTAGEM: 'Montagem',
  }
  return sec ? (map[normalized] || sec) : 'Geral / Livre'
}

// --- TABS DINÂMICAS POR PERFIL ---
const tabs = computed(() => {
  // Admin Master e Admin de Setor: todas as abas
  return [
    { key: 'categories',   label: 'Categorias',                 icon: Tag },
    { key: 'locations',    label: 'Localizações / Prateleiras', icon: MapPin },
    { key: 'origins',      label: 'Origens / Motivos',          icon: GitBranch },
    { key: 'import',       label: 'Importar CSV',               icon: FileSpreadsheet },
    ...(isMasterAdmin.value ? [{ key: 'factory_unit', label: 'Unidade Fabril', icon: Building2 }] : [])
  ]
})
const activeTab = ref('categories')

// --- NOTIFICAÇÕES & MODAL DE CONFIRMAÇÃO COMPARTILHADOS ---
const { notification, showNotification } = useToast(3500)
const { confirmState, openConfirmModal, handleConfirmedAction } = useConfirmModal()
const settingsData = useSettings({ notify: showNotification })
const {
  categories, units, locations, origins,
  loadingCategory, loadingUnit, loadingLocation, loadingOrigin,
  loading: settingsLoading,
  error: settingsError,
  fetchCategories, fetchUnits, fetchLocations, fetchOrigins,
} = settingsData

// CATEGORIAS
const categoryFilterSector = computed({
  get: () => settingsPersisted.filters.value.categoryFilterSector || 'TODOS',
  set: value => { settingsPersisted.filters.value.categoryFilterSector = value || 'TODOS' },
})
const newCategory = ref({
  name: '',
  sector: (authStore.user?.assignedSector && authStore.user?.assignedSector !== 'TODOS') ? authStore.user.assignedSector : '',
  defaultUnitCode: '',
  unitLocked: false
})

const filteredCategories = computed(() => {
  if (categoryFilterSector.value === 'TODOS') return categories.value
  const target = categoryFilterSector.value === 'EXPEDICAO' ? 'DISTRIBUICAO' : categoryFilterSector.value
  return categories.value.filter(cat => {
    const catSec = cat.sector === 'EXPEDICAO' ? 'DISTRIBUICAO' : cat.sector
    return catSec === target
  })
})

async function addCategory() {
  if (!newCategory.value.name.trim()) return
  try {
    const res = await api.post('/settings/categories', {
      name: newCategory.value.name.trim(),
      sector: newCategory.value.sector || null,
      defaultUnitCode: newCategory.value.defaultUnitCode ? newCategory.value.defaultUnitCode : null,
      unitLocked: Boolean(newCategory.value.unitLocked)
    })
    showNotification('success', `Categoria "${newCategory.value.name}" criada com sucesso!`)
    newCategory.value = {
      name: '',
      sector: (authStore.user?.assignedSector && authStore.user?.assignedSector !== 'TODOS') ? authStore.user.assignedSector : '',
      defaultUnitCode: '',
      unitLocked: false
    }
    if (res.data) categories.value.unshift(res.data)
    await fetchCategories()
  } catch (e) {
    const msg = e.response?.data?.error || 'Erro ao criar categoria.'
    showNotification('error', msg)
  }
}

async function deleteCategory(cat) {
  const isAdmin = authStore.userRole === 'admin' || authStore.isAdmin
  const linked = cat.linkedCount || 0

  if (!isAdmin && linked > 0) {
    showNotification('error', `Não é possível excluir: existem ${linked} material(is) ou item(ns) vinculados a esta categoria. Apenas o Administrador Master pode gerenciar esta exclusão.`)
    return
  }

  const title = linked > 0 ? '⚠️ Atenção Admin Master: Excluir Categoria' : 'Excluir Categoria de Material'
  const message = linked > 0
    ? `Atenção Admin Master: A categoria "${cat.name}" possui ${linked} material(is)/item(ns) vinculados no sistema. Ao confirmar a exclusão, esses registros perderão o vínculo desta categoria. Esta ação será registrada no Histórico de Auditoria. Deseja realmente prosseguir?`
    : `Deseja excluir a categoria "${cat.name}"?`

  openConfirmModal({
    title,
    message,
    confirmText: linked > 0 ? 'Confirmar Exclusão (Admin Master)' : 'Sim, Excluir Categoria',
    variant: 'danger',
    action: async () => {
      try {
        await api.delete(`/settings/categories/${cat.id}`)
        showNotification('success', `Categoria "${cat.name}" excluída.`)
        await fetchCategories()
      } catch (e) {
        const msg = e.response?.data?.error || 'Erro ao excluir categoria.'
        showNotification('error', msg)
      }
    }
  })
}

// LOCALIZAÇÕES
const newLocation = ref({
  name: '',
  sector: (authStore.user?.assignedSector && authStore.user?.assignedSector !== 'TODOS') ? authStore.user.assignedSector : '',
  categoryIds: []
})
const showEditLocationModal = ref(false)
const editLocationDialog = ref(null)
const editLocationInitial = ref('')
const editingLocation = ref({
  id: 0,
  name: '',
  sector: '',
  categoryIds: []
})

const filteredLocations = computed(() => {
  if (authStore.user?.role === 'admin_setor' && authStore.user?.assignedSector) {
    const userSec = authStore.user.assignedSector === 'EXPEDICAO' ? 'DISTRIBUICAO' : authStore.user.assignedSector
    return locations.value.filter(loc => {
      const locSec = loc.sector === 'EXPEDICAO' ? 'DISTRIBUICAO' : loc.sector
      return locSec === userSec || (!locSec && userSec === 'CORTE')
    })
  }
  return locations.value
})

const availableCategoriesForNewLocation = computed(() => {
  const targetSector = newLocation.value.sector
  if (!targetSector) return categories.value
  const normTarget = targetSector === 'EXPEDICAO' ? 'DISTRIBUICAO' : targetSector
  return categories.value.filter(cat => {
    if (!cat.sector) return true
    const catSec = cat.sector === 'EXPEDICAO' ? 'DISTRIBUICAO' : cat.sector
    return catSec === normTarget
  })
})

const availableCategoriesForEditLocation = computed(() => {
  const targetSector = editingLocation.value.sector
  if (!targetSector) return categories.value
  const normTarget = targetSector === 'EXPEDICAO' ? 'DISTRIBUICAO' : targetSector
  return categories.value.filter(cat => {
    if (!cat.sector) return true
    const catSec = cat.sector === 'EXPEDICAO' ? 'DISTRIBUICAO' : cat.sector
    return catSec === normTarget
  })
})

watch(() => newLocation.value.sector, (newSec) => {
  if (newSec) {
    const normTarget = newSec === 'EXPEDICAO' ? 'DISTRIBUICAO' : newSec
    const validIds = new Set(
      categories.value
        .filter(cat => {
          if (!cat.sector) return true
          const catSec = cat.sector === 'EXPEDICAO' ? 'DISTRIBUICAO' : cat.sector
          return catSec === normTarget
        })
        .map(c => c.id)
    )
    newLocation.value.categoryIds = newLocation.value.categoryIds.filter(id => validIds.has(id))
  }
})

watch(() => editingLocation.value.sector, (newSec) => {
  if (newSec) {
    const normTarget = newSec === 'EXPEDICAO' ? 'DISTRIBUICAO' : newSec
    const validIds = new Set(
      categories.value
        .filter(cat => {
          if (!cat.sector) return true
          const catSec = cat.sector === 'EXPEDICAO' ? 'DISTRIBUICAO' : cat.sector
          return catSec === normTarget
        })
        .map(c => c.id)
    )
    editingLocation.value.categoryIds = editingLocation.value.categoryIds.filter(id => validIds.has(id))
  }
})

function toggleCategorySelection(catId) {
  const idx = newLocation.value.categoryIds.indexOf(catId)
  if (idx > -1) {
    newLocation.value.categoryIds.splice(idx, 1)
  } else {
    newLocation.value.categoryIds.push(catId)
  }
}

function toggleEditCategorySelection(catId) {
  const idx = editingLocation.value.categoryIds.indexOf(catId)
  if (idx > -1) {
    editingLocation.value.categoryIds.splice(idx, 1)
  } else {
    editingLocation.value.categoryIds.push(catId)
  }
}

function openEditLocationModal(loc) {
  const catIds = loc.categoryLinks && loc.categoryLinks.length > 0
    ? loc.categoryLinks.map(l => l.categoryId)
    : (loc.categoryId ? [loc.categoryId] : [])
  const targetSector = authStore.user?.role === 'admin_setor'
    ? authStore.user.assignedSector
    : (loc.sector || '')
  editingLocation.value = {
    id: loc.id,
    name: loc.name,
    sector: targetSector,
    categoryIds: [...catIds]
  }
  editLocationInitial.value = JSON.stringify(editingLocation.value)
  showEditLocationModal.value = true
}

async function saveEditLocation() {
  if (!editingLocation.value.name.trim()) return
  try {
    const targetSector = authStore.user?.role === 'admin_setor'
      ? authStore.user.assignedSector
      : (editingLocation.value.sector || null)
    await api.put(`/settings/locations/${editingLocation.value.id}`, {
      name: editingLocation.value.name.trim(),
      sector: targetSector,
      categoryIds: editingLocation.value.categoryIds
    })
    showNotification('success', `Localização "${editingLocation.value.name}" atualizada com sucesso!`)
    editLocationInitial.value = ''
    showEditLocationModal.value = false
    await fetchLocations()
  } catch (e) {
    const msg = e.response?.data?.error || 'Erro ao atualizar localização.'
    showNotification('error', msg)
  }
}

async function addLocation() {
  if (!newLocation.value.name.trim()) return
  try {
    const targetSector = authStore.user?.role === 'admin_setor'
      ? authStore.user.assignedSector
      : (newLocation.value.sector || null)
    const res = await api.post('/settings/locations', {
      name: newLocation.value.name.trim(),
      sector: targetSector,
      categoryIds: newLocation.value.categoryIds
    })
    showNotification('success', `Localização "${newLocation.value.name}" criada com sucesso!`)
    newLocation.value = {
      name: '',
      sector: (authStore.user?.assignedSector && authStore.user?.assignedSector !== 'TODOS') ? authStore.user.assignedSector : '',
      categoryIds: []
    }
    if (res.data) locations.value.unshift(res.data)
    await fetchLocations()
  } catch (e) {
    const msg = e.response?.data?.error || 'Erro ao criar localização.'
    showNotification('error', msg)
  }
}

async function deleteLocation(loc) {
  const isAdmin = authStore.userRole === 'admin' || authStore.isAdmin
  const linked = loc.linkedCount || 0
  const qty = loc.totalQuantity || 0

  if (!isAdmin && linked > 0) {
    showNotification('error', `Não é possível excluir: existem ${linked} material(is) ou item(ns) vinculados a esta localização. Apenas o Administrador Master pode gerenciar esta exclusão.`)
    return
  }

  const title = linked > 0 ? '⚠️ Atenção Admin Master: Excluir Localização' : 'Excluir Localização'
  const message = linked > 0
    ? `Atenção Admin Master: A localização/prateleira "${loc.name}" possui ${linked} material(is)/item(ns) vinculados${qty > 0 ? ` (Saldo total: ${qty} em estoque físico)` : ''}. Ao confirmar a exclusão, os vínculos desta prateleira serão removidos. Esta ação será registrada no Histórico de Auditoria. Deseja prosseguir?`
    : `Deseja excluir a localização "${loc.name}"?`

  openConfirmModal({
    title,
    message,
    confirmText: linked > 0 ? 'Confirmar Exclusão (Admin Master)' : 'Sim, Excluir Localização',
    variant: 'danger',
    action: async () => {
      try {
        await api.delete(`/settings/locations/${loc.id}`)
        showNotification('success', `Localização excluída.`)
        await fetchLocations()
      } catch (e) {
        const msg = e.response?.data?.error || 'Erro ao excluir localização.'
        showNotification('error', msg)
      }
    }
  })
}

// ORIGENS
const newOrigin = ref('')
const newOriginSector = ref(authStore.user?.assignedSector || '')

const { confirmDiscard } = useUnsavedChanges(() => (
  Boolean(newCategory.value.name.trim()) ||
  Boolean(newLocation.value.name.trim()) ||
  Boolean(newOrigin.value.trim()) ||
  Boolean(selectedFile.value) ||
  showEditLocationModal.value && JSON.stringify(editingLocation.value) !== editLocationInitial.value
))

async function changeTab(tab) {
  if (tab === activeTab.value || await confirmDiscard()) activeTab.value = tab
}

async function closeEditLocationModal() {
  if (await confirmDiscard()) showEditLocationModal.value = false
}

useModalFocus(() => showEditLocationModal.value, editLocationDialog, closeEditLocationModal)

async function addOrigin() {
  if (!newOrigin.value.trim()) return
  try {
    const res = await api.post('/settings/origins', {
      name: newOrigin.value.trim(),
      sector: newOriginSector.value || null
    })
    showNotification('success', `Origem "${newOrigin.value}" criada!`)
    newOrigin.value = ''
    newOriginSector.value = authStore.user?.assignedSector || ''
    if (res.data) origins.value.unshift(res.data)
    await fetchOrigins()
  } catch (e) {
    const msg = e.response?.data?.error || 'Erro ao criar origem.'
    showNotification('error', msg)
  }
}

async function deleteOrigin(orig) {
  const isAdmin = authStore.userRole === 'admin' || authStore.isAdmin
  const linked = orig.linkedCount || 0

  if (!isAdmin && linked > 0) {
    showNotification('error', `Não é possível excluir: existem ${linked} movimentação(ões) vinculadas a esta origem. Apenas o Administrador Master pode gerenciar esta exclusão.`)
    return
  }

  const title = linked > 0 ? '⚠️ Atenção Admin Master: Excluir Origem' : 'Excluir Origem de Sobra'
  const message = linked > 0
    ? `Atenção Admin Master: A origem "${orig.name}" possui ${linked} movimentação(ões) associadas no histórico. A exclusão removerá esta opção para novas entradas. Deseja prosseguir?`
    : `Deseja excluir a origem "${orig.name}"?`

  openConfirmModal({
    title,
    message,
    confirmText: linked > 0 ? 'Confirmar Exclusão (Admin Master)' : 'Sim, Excluir Origem',
    variant: 'danger',
    action: async () => {
      try {
        await api.delete(`/settings/origins/${orig.id}`)
        showNotification('success', `Origem excluída.`)
        await fetchOrigins()
      } catch (e) {
        const msg = e.response?.data?.error || 'Erro ao excluir origem.'
        showNotification('error', msg)
      }
    }
  })
}

// IMPORTAÇÃO CSV
const selectedFile = ref(null)
const importing = ref(false)
const importResult = ref(null)
const templateSector = computed({
  get: () => settingsPersisted.filters.value.templateSector || 'CORTE',
  set: value => { settingsPersisted.filters.value.templateSector = value || 'CORTE' },
})
const importSector = ref(authStore.user?.assignedSector || 'CORTE')

// --- PADRÃO EXIGIDO DE CSV DINÂMICO & REATIVO POR SETOR ---
const sectorCsvPattern = computed(() => {
  const sec = templateSector.value || 'CORTE'

  if (sec === 'CORTE') {
    return {
      title: 'Padrão Exigido para o Arquivo CSV — CORTE (Matéria-Prima)',
      columns: [
        { name: 'codigo', req: true, desc: 'Código único do material. Ex: 1001' },
        { name: 'descricao', req: true, desc: 'Descrição completa do material. Ex: TECIDO SINTETICO PRETO 1.4MM' },
        { name: 'categoria', req: false, desc: 'Categoria cadastrada. Ex: TECIDO, COURO, FORRO, SINTETICO (Padrão: GERAL)' },
        { name: 'unidade', req: false, desc: 'Sigla da unidade de medida. Ex: m², m, kg, un (Padrão: m²)' },
        { name: 'quantidade', req: false, desc: 'Saldo numérico inicial. Ex: 150.0 (Padrão: 0)' },
        { name: 'prateleira', req: false, desc: 'Localização ou prateleira física. Ex: A-01, B-02' },
      ],
      headerExample: 'codigo;descricao;categoria;unidade;quantidade;prateleira',
      examples: [
        '1001;TECIDO SINTETICO PRETO 1.4MM;TECIDO;m²;150.0;A-01',
        '1002;FORRO TESPONTADO AZUL;FORRO;m;80.0;A-02',
        '1003;COURO LEGITIMO CASTANHO;COURO;m²;45.5;B-01',
        '1004;LINHA DE COSTURA REFORCADA;LINHA;rolo;20.0;C-01',
      ],
    }
  }

  if (sec === 'APOIO') {
    return {
      title: 'Padrão Exigido para o Arquivo CSV — APOIO (Moldes & Peças Cortadas)',
      columns: [
        { name: 'sku', req: true, desc: 'Código / SKU ou Molde da peça. Ex: MOL-001' },
        { name: 'modelo', req: true, desc: 'Linha ou Modelo de calçado. Ex: RACER SPEEDZONE' },
        { name: 'peca', req: true, desc: 'Nome / Descrição da peça avulsa. Ex: GASPEA LATERAL' },
        { name: 'quantidade', req: false, desc: 'Quantidade de peças no estoque. Ex: 50 (Padrão: 0)' },
        { name: 'prateleira', req: false, desc: 'Localização ou box no apoio. Ex: AP-01' },
      ],
      headerExample: 'sku;modelo;peca;quantidade;prateleira',
      examples: [
        'MOL-001;RACER SPEEDZONE;GASPEA LATERAL;50;AP-01',
        'MOL-002;AIR MAX SC;TALONEIRA TRASEIRA;30;AP-02',
        'MOL-003;VOMERO 17;LINGUETA SUPERIOR;40;AP-03',
      ],
    }
  }

  if (sec === 'PRE_FABRICADO' || sec === 'DISTRIBUICAO' || sec === 'EXPEDICAO' || sec === 'MONTAGEM') {
    const secLabel = sec === 'PRE_FABRICADO' ? 'PRÉ-FABRICADO (Solas)' : (sec === 'DISTRIBUICAO' || sec === 'EXPEDICAO') ? 'DISTRIBUIÇÃO' : 'MONTAGEM (Pés Órfãos)'
    const pecaEx = sec === 'PRE_FABRICADO' ? 'SOLA PEGASUS' : (sec === 'DISTRIBUICAO' || sec === 'EXPEDICAO') ? 'CABEDAL AIR MAX' : 'PE MONTADO CORTEZ'
    return {
      title: `Padrão Exigido para o Arquivo CSV — ${secLabel}`,
      columns: [
        { name: 'sku', req: true, desc: 'SKU ou código do produto. Ex: SKU-RACER-SPD-BLK' },
        { name: 'modelo', req: true, desc: 'Nome do modelo / Linha. Ex: RACER SPEEDZONE' },
        { name: 'peca', req: false, desc: `Componente do calçado. Ex: ${pecaEx}` },
        { name: 'grade', req: true, desc: 'Grade / Numeração do calçado. Ex: 39/40, 41' },
        { name: 'lado', req: true, desc: 'Lado do pé: E (Esquerdo), D (Direito) ou PAR (desmembrado automaticamente em 1E + 1D)' },
        { name: 'quantidade', req: false, desc: 'Quantidade de peças / pares. Ex: 20 (Padrão: 0)' },
        { name: 'prateleira', req: false, desc: 'Localização ou box. Ex: PR-01, MO-02' },
      ],
      headerExample: 'sku;modelo;peca;grade;lado;quantidade;prateleira',
      examples: [
        `SKU-RACER-SPD-BLK;RACER SPEEDZONE;${pecaEx};41;PAR;20;PR-01`,
        `SKU-RACER-SPD-BLK;RACER SPEEDZONE;${pecaEx};40;E;15;MO-02`,
        `SKU-AIRMAX-WHT;AIR MAX SC;${pecaEx};38;D;10;MO-03`,
      ],
    }
  }

  return {
    title: 'Padrão de CSV indisponível para o setor selecionado',
    columns: [],
    headerExample: '',
    examples: [],
  }
})

watch(templateSector, (newSec) => {
  if (!authStore.user?.assignedSector || authStore.user?.assignedSector === 'TODOS' || authStore.user?.role === 'admin') {
    importSector.value = newSec
  }
})

function downloadCSVTemplate(targetSector = templateSector.value || 'CORTE') {
  templateSector.value = targetSector
  const pat = sectorCsvPattern.value
  const content = `${pat.headerExample}\n${pat.examples.join('\n')}\n`
  const fileName = `modelo_importacao_${targetSector.toLowerCase()}.csv`

  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', fileName)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
  showNotification('success', `Modelo ${fileName} baixado com sucesso!`)
}

function handleFileSelect(event) {
  const file = event.target.files[0]
  if (file) {
    selectedFile.value = file
    importResult.value = null
  }
  event.target.value = null // reset input
}

function handleDrop(event) {
  const file = event.dataTransfer.files[0]
  if (file && file.name.endsWith('.csv')) {
    selectedFile.value = file
    importResult.value = null
  } else {
    showNotification('error', 'Apenas arquivos .csv são aceitos.')
  }
}

async function importCSV() {
  if (!selectedFile.value) return
  importing.value = true
  importResult.value = null

  try {
    const formData = new FormData()
    formData.append('arquivo', selectedFile.value)
    formData.append('sector', importSector.value)

    const res = await api.post('/import/csv', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    importResult.value = res.data
    showNotification('success', `${res.data.inseridos} itens importados com sucesso!`)
    selectedFile.value = null
  } catch (e) {
    const msg = e.response?.data?.error || 'Erro ao importar a planilha.'
    const errors = e.response?.data?.errors || []
    importResult.value = { error: msg, errors }
    showNotification('error', msg)
  } finally {
    importing.value = false
  }
}

// CONFIGURAÇÃO DA UNIDADE FABRIL (ADMIN MASTER)
const unitSettings = ref({
  id: null,
  code: '',
  name: '',
  active: true,
  enableRequisitions: authStore.user?.unit?.enableRequisitions !== false,
})
const loadingUnitSettings = ref(false)
const savingUnitSettings = ref(false)

async function loadUnitSettings() {
  loadingUnitSettings.value = true
  try {
    const res = await api.get('/factory-unit/current')
    if (res.data?.data) {
      unitSettings.value = { ...res.data.data }
    }
  } catch (err) {
    console.error('Erro ao carregar dados da unidade:', err)
  } finally {
    loadingUnitSettings.value = false
  }
}

async function toggleRequisitionsModule(enable) {
  savingUnitSettings.value = true
  try {
    const res = await api.patch('/factory-unit/current/settings', {
      enableRequisitions: enable,
    })
    unitSettings.value.enableRequisitions = enable
    authStore.updateUnitSettings({ enableRequisitions: enable })
    showNotification('success', enable 
      ? 'Módulo de Requisições ATIVADO com sucesso para esta unidade.' 
      : 'Módulo de Requisições DESATIVADO com sucesso para esta unidade.'
    )
  } catch (err) {
    console.error('Erro ao salvar configuração da unidade:', err)
    showNotification('error', err.response?.data?.error || 'Erro ao atualizar configurações da unidade.')
    // reverte em caso de falha
    unitSettings.value.enableRequisitions = !enable
  } finally {
    savingUnitSettings.value = false
  }
}

// INICIALIZAÇÃO
onMounted(async () => {
  await Promise.all([fetchCategories(), fetchUnits(), fetchLocations(), fetchOrigins()])
  if (isMasterAdmin.value) {
    await loadUnitSettings()
  }
})
</script>

<style scoped>
.fade-down-enter-active {
  animation: fadeDown 0.3s ease-out;
}
.fade-down-leave-active {
  animation: fadeDown 0.3s ease-in reverse;
}
@keyframes fadeDown {
  from { opacity: 0; transform: translateY(-10px); }
  to   { opacity: 1; transform: translateY(0); }
}
</style>
