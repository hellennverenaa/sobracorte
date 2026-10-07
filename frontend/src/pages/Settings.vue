<template>
  <Layout>
    <div class="max-w-5xl mx-auto px-4 py-8">

      <!-- Cabeçalho -->
      <div class="flex items-center gap-3 mb-8">
        <div class="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
          <SettingsIcon class="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 class="text-2xl font-bold text-gray-900 text-balance">Configurações</h1>
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

      <SubsectorSettings
        v-if="activeTab === 'subsectors'"
        :can-manage="canManageSettings"
        :is-master-admin="isMasterAdmin"
        :assigned-sector="authStore.user?.assignedSector || ''"
        :sectors="categorySectorsOptions"
        :categories="categories"
        @notify="showNotification"
        @dirty-change="subsectorDirty = $event"
      />

      <!-- ABA 1: CATEGORIAS                         -->
      <div v-if="activeTab === 'categories'" class="space-y-6">
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div class="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
            <h2 class="font-bold text-gray-800 flex items-center gap-2 text-balance">
              <Tag class="w-4 h-4 text-indigo-500" /> Categorias de Materiais
            </h2>
            <span class="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">Nome e unidade</span>
          </div>
          <p class="px-6 py-3 border-b border-gray-100 text-xs text-gray-600">Cadastre a categoria para o setor escolhido. As regras de prateleiras e subsetores ficam em suas próprias abas.</p>
          
          <!-- Formulário de adição (Oculto para perfil leitor) -->
          <div v-if="canManageSettings" class="px-6 py-5 border-b border-gray-100">
            <form @submit.prevent="addCategory()" class="max-w-4xl space-y-5">
              <div>
                <label for="new-category-name" class="block text-sm font-bold text-gray-800 mb-1">Nome da categoria</label>
                <input id="new-category-name" v-model="newCategory.name" required placeholder="Ex.: Couro, Cabedal, Tecido"
                  class="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-400 uppercase bg-white"
                  style="text-transform: uppercase" />
              </div>

              <div v-if="isCategorySectorLocked" class="text-sm text-gray-700">Setor: <strong>{{ settingsSectorLabel(assignedCategorySector) }}</strong></div>
              <div v-else>
                <label for="category-registration-sector" class="block text-sm font-bold text-gray-800 mb-1">Setor da categoria</label>
                <select id="category-registration-sector" v-model="categoryRegistrationSector" required class="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-white">
                  <option value="" disabled>Selecione o setor</option>
                  <option v-for="sector in categorySectorsOptions" :key="sector.id" :value="sector.id">{{ sector.label }}</option>
                </select>
              </div>

              <div>
                <label for="new-category-unit" class="block text-sm font-bold text-gray-800 mb-1">Unidade de medida</label>
                <select id="new-category-unit" v-model="newCategory.defaultUnitCode" required :disabled="isNewCategoryUnitFixed"
                  class="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-white disabled:bg-gray-100">
                  <option value="" disabled>Selecione a unidade</option>
                  <option v-for="unit in units" :key="unit.symbol" :value="unit.symbol">{{ unit.name }} ({{ unit.symbol }})</option>
                </select>
                <p v-if="isNewCategoryUnitFixed" class="mt-1 text-xs text-gray-500">Este setor registra cada peça individualmente em UN. Pares são compostos pelos lados esquerdo e direito.</p>
              </div>

              <details class="rounded-xl border border-gray-200 bg-gray-50/70">
                <summary class="cursor-pointer px-4 py-3 text-xs font-bold text-gray-700">Configurações avançadas: compartilhar entre setores ou definir fluxo especial</summary>
                <div class="p-4 space-y-4 border-t border-gray-200">

              <fieldset class="border border-gray-200 rounded-xl p-4 space-y-3">
                <legend class="px-1 text-sm font-bold text-gray-800">Onde essa categoria poderá ser usada?</legend>
                <p class="text-xs text-gray-500 text-pretty">Escolha os setores em que a categoria deve aparecer. Depois, ela poderá ser associada às prateleiras desses setores.</p>

                <div v-if="isCategorySectorLocked" class="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-800">
                  <span class="size-2 rounded-full bg-indigo-600"></span>
                  {{ settingsSectorLabel(assignedCategorySector) }}
                  <span class="font-normal text-indigo-700">· setor da sua permissão</span>
                </div>

                <template v-else>
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label class="flex items-start gap-2.5 rounded-lg border p-3 cursor-pointer"
                      :class="newCategory.scopeMode === 'specific' ? 'border-indigo-300 bg-indigo-50/70' : 'border-gray-200 bg-white'">
                      <input v-model="newCategory.scopeMode" type="radio" value="specific" class="mt-0.5 text-indigo-600 focus:ring-indigo-500" />
                      <span>
                        <span class="block text-xs font-bold text-gray-800">Setor(es) selecionado(s)</span>
                        <span class="block mt-0.5 text-[11px] text-gray-500 text-pretty">A categoria só aparecerá nos setores marcados abaixo.</span>
                      </span>
                    </label>
                    <label class="flex items-start gap-2.5 rounded-lg border p-3 cursor-pointer"
                      :class="newCategory.scopeMode === 'all' ? 'border-indigo-300 bg-indigo-50/70' : 'border-gray-200 bg-white'">
                      <input v-model="newCategory.scopeMode" type="radio" value="all" class="mt-0.5 text-indigo-600 focus:ring-indigo-500" />
                      <span>
                        <span class="block text-xs font-bold text-gray-800">Todos os setores</span>
                        <span class="block mt-0.5 text-[11px] text-gray-500 text-pretty">Use para uma categoria realmente compartilhada em toda a fábrica.</span>
                      </span>
                    </label>
                  </div>

                  <div v-if="newCategory.scopeMode === 'specific'" class="space-y-2">
                    <p class="text-xs font-semibold text-gray-700">Marque um ou mais setores:</p>
                    <div class="flex flex-wrap gap-2">
                      <label v-for="sector in categorySectorsOptions" :key="sector.id"
                        class="inline-flex items-center gap-2 px-3 py-2 border rounded-lg text-xs font-semibold cursor-pointer"
                        :class="newCategory.sectors.includes(sector.id) ? 'bg-indigo-50 border-indigo-300 text-indigo-800' : 'bg-white border-gray-200 text-gray-600'">
                        <input v-model="newCategory.sectors" type="checkbox" :value="sector.id"
                          class="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                        {{ sector.label }}
                      </label>
                    </div>
                    <p v-if="newCategory.sectors.length === 0" class="text-xs font-medium text-amber-700" role="status">Escolha pelo menos um setor para continuar.</p>
                    <p v-else class="text-xs text-gray-500 text-pretty">Exemplo: para Cabedal em Peças Cortadas e Distribuição, marque os dois setores e escolha “Cabedal” como tipo abaixo.</p>
                  </div>
                  <p v-else class="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600 text-pretty">Esta categoria poderá ser associada a localizações de qualquer setor. Para definir um tipo específico, escolha “Setor(es) selecionado(s)” e configure os setores.</p>
                </template>
              </fieldset>

              <div v-if="newCategory.scopeMode === 'specific'" class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label for="new-category-subtype" class="block text-sm font-bold text-gray-800 mb-1">Subtipo / tipo de material <span class="font-normal text-gray-500">(opcional)</span></label>
                  <select id="new-category-subtype" v-model="newCategory.subtypeId" :disabled="loadingComponentSubtype || !newCategory.sectors.length"
                    class="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-400 bg-white font-medium disabled:bg-gray-100">
                  <option value="">Sem tipo específico</option>
                  <option v-for="subtype in availableComponentSubtypes" :key="subtype.id" :value="subtype.id">{{ subtype.name }}</option>
                  </select>
                  <p class="text-xs text-gray-500 mt-1.5 text-pretty">As opções vêm dos subtipos configurados abaixo. Escolha os setores primeiro para ver apenas os tipos compatíveis.</p>
                </div>
              </div>

                </div>
              </details>

              <div class="flex justify-end">
                <button type="submit" :disabled="loadingCategory || creatingCategory || !categoryRegistrationSector || !newCategory.defaultUnitCode || (newCategory.scopeMode === 'specific' && !newCategory.sectors.length)"
                  class="px-4 py-2.5 bg-indigo-600 text-white rounded-lg font-bold text-sm hover:bg-indigo-700 disabled:opacity-50">
                  <Plus v-if="!creatingCategory" class="size-4 inline-block mr-1" /> {{ creatingCategory ? 'Salvando...' : 'Salvar categoria' }}
                </button>
              </div>
            </form>
          </div>

          <div v-if="canManageSubtypes" class="px-6 py-4 border-b border-gray-100 bg-gray-50/40">
            <details>
              <summary class="cursor-pointer list-none flex flex-wrap items-center justify-between gap-2 rounded-lg text-sm font-bold text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
                <span class="inline-flex items-center gap-2"><Sliders class="size-4 text-indigo-600" /> Gerenciar opções de subtipo</span>
                <span class="text-xs font-medium text-gray-500">{{ componentSubtypes.length }} opções · abrir configuração</span>
              </summary>
              <div class="mt-4 grid grid-cols-1 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-5 border-t border-gray-200 pt-4">
                <form @submit.prevent="saveComponentSubtype" class="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
                  <div>
                    <p class="text-xs font-bold uppercase text-indigo-700">{{ subtypeDraft.id ? 'Editar subtipo' : 'Novo subtipo' }}</p>
                    <label for="subtype-name" class="mt-2 mb-1 block text-xs font-bold text-gray-700">Nome exibido</label>
                    <input id="subtype-name" v-model="subtypeDraft.name" required maxlength="80" placeholder="Ex.: Forro, Napa, Palmilha"
                      class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400" />
                  </div>
                  <fieldset class="space-y-2">
                    <legend class="text-xs font-bold text-gray-700">Em quais setores essa opção pode ser usada?</legend>
                    <div class="flex flex-wrap gap-2">
                      <label v-for="sector in categorySectorsOptions" :key="sector.id"
                        class="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold cursor-pointer"
                        :class="subtypeDraft.sectors.includes(sector.id) ? 'border-indigo-300 bg-indigo-50 text-indigo-800' : 'border-gray-200 bg-white text-gray-600'">
                        <input v-model="subtypeDraft.sectors" type="checkbox" :value="sector.id" class="size-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                        {{ sector.label }}
                      </label>
                    </div>
                  </fieldset>
                  <p class="text-[11px] leading-relaxed text-gray-500">O subtipo será oferecido ao criar categorias dos setores marcados. As opções existentes conservam as regras atuais do estoque; as novas classificam categorias pelo fluxo padrão do setor.</p>
                  <p v-if="!subtypeDraft.sectors.length" class="text-xs font-medium text-amber-700" role="status">Marque pelo menos um setor.</p>
                  <div class="flex flex-wrap justify-end gap-2">
                    <button v-if="subtypeDraft.id" type="button" @click="resetSubtypeDraft" class="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50">Cancelar</button>
                    <button type="submit" :disabled="savingSubtype || !subtypeDraft.name.trim() || !subtypeDraft.sectors.length"
                      class="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50">
                      <Plus v-if="!savingSubtype && !subtypeDraft.id" class="size-3.5" />
                      {{ savingSubtype ? 'Salvando...' : subtypeDraft.id ? 'Salvar alterações' : 'Adicionar subtipo' }}
                    </button>
                  </div>
                </form>

                <div>
                  <p class="mb-2 text-xs font-bold uppercase text-gray-500">Opções disponíveis</p>
                  <div v-if="loadingComponentSubtype" class="rounded-xl border border-gray-200 bg-white p-5 text-center text-xs text-gray-400">Carregando subtipos...</div>
                  <ul v-else-if="componentSubtypes.length" class="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
                    <li v-for="subtype in componentSubtypes" :key="subtype.id" class="flex items-center justify-between gap-3 px-3 py-2.5">
                      <div class="min-w-0">
                        <p class="truncate text-sm font-semibold text-gray-800">{{ subtype.name }}</p>
                        <p class="mt-0.5 text-[11px] text-gray-500">{{ subtype.sectors.map(sector => settingsSectorLabel(sector)).join(', ') }} · {{ subtype._count?.categories || 0 }} categoria(s) usando</p>
                      </div>
                      <div class="flex shrink-0 items-center gap-1">
                        <button type="button" @click="editComponentSubtype(subtype)" class="rounded-md p-1.5 text-gray-400 hover:bg-indigo-50 hover:text-indigo-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500" :aria-label="`Editar subtipo ${subtype.name}`" title="Editar subtipo">
                          <Pencil class="size-4" />
                        </button>
                        <button type="button" @click="deleteComponentSubtype(subtype)" :disabled="(subtype._count?.categories || 0) > 0" class="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:cursor-not-allowed disabled:opacity-30" :aria-label="`Excluir subtipo ${subtype.name}`" :title="(subtype._count?.categories || 0) > 0 ? 'Edite as categorias vinculadas antes de excluir' : 'Excluir subtipo'">
                          <Trash2 class="size-4" />
                        </button>
                      </div>
                    </li>
                  </ul>
                  <p v-else class="rounded-xl border border-dashed border-gray-300 bg-white p-5 text-center text-xs text-gray-500">Nenhum subtipo cadastrado.</p>
                </div>
              </div>
            </details>
          </div>

          <!-- Filtro de Setor para Categorias -->
          <div class="px-6 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between flex-wrap gap-3">
            <span class="text-xs font-bold text-gray-500 uppercase">Categorias Cadastradas</span>
            <div class="flex items-center gap-2">
              <label class="text-xs font-bold text-gray-500 uppercase">Filtrar Setor:</label>
              <select v-model="categoryFilterSector"
                class="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium uppercase outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
                <option value="TODOS">Todos os Setores</option>
                <option v-for="sector in categorySectorsOptions" :key="sector.id" :value="sector.id">{{ sector.label }}</option>
              </select>
            </div>
          </div>

          <!-- Lista -->
          <div v-if="loadingCategory" class="p-8 text-center text-gray-400">Carregando...</div>
          <table v-else class="w-full text-left">
            <thead class="bg-gray-50 text-xs font-bold text-gray-400 uppercase tracking-wider">
              <tr>
                <th class="px-6 py-3">Categoria</th>
                <th class="px-6 py-3 text-center">Setores disponíveis</th>
                <th class="px-6 py-3 text-center">Unidade de medida</th>
                <th v-if="canManageSettings" class="px-6 py-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              <tr v-for="cat in filteredCategories" :key="cat.id" class="hover:bg-gray-50/50 transition-colors">
                <td class="px-6 py-3 font-bold text-gray-800 font-mono text-sm">{{ cat.name }}</td>
                <td class="px-6 py-3 text-center">
                  <span class="px-2.5 py-0.5 rounded-full text-xs font-bold border bg-slate-50 text-slate-700 border-slate-200">
                    {{ formatCategorySectors(cat) }}
                  </span>
                </td>
                <td class="px-6 py-3 text-center">
                  <span v-if="cat.defaultUnitCode" class="px-2.5 py-0.5 rounded-full text-xs font-bold border bg-indigo-50 text-indigo-700 border-indigo-100">
                    {{ units.find(u => u.symbol === cat.defaultUnitCode)?.name }} ({{ cat.defaultUnitCode }})
                  </span>
                  <span v-else class="text-xs text-gray-400 italic">Livre</span>
                </td>
                <td v-if="canManageSettings" class="px-6 py-3 text-center">
                  <div class="flex flex-wrap items-center justify-center gap-1">
                    <button @click="openEditCategory(cat)" class="text-gray-400 hover:text-indigo-600 p-1 rounded hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500" :aria-label="`Editar categoria ${cat.name}`" title="Editar categoria">
                      <Pencil class="size-4" />
                    </button>
                    <button @click="deleteCategory(cat)" class="text-gray-400 hover:text-red-600 p-1 rounded hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500" :aria-label="`Excluir categoria ${cat.name}`" title="Excluir categoria">
                      <Trash2 class="size-4" />
                    </button>
                  </div>
                </td>
              </tr>
              <tr v-if="filteredCategories.length === 0">
                <td :colspan="canManageSettings ? 4 : 3" class="px-6 py-8 text-center text-gray-500 text-sm">
                  <p class="font-semibold">Nenhuma categoria encontrada para esse filtro.</p>
                  <p class="mt-1 text-xs">Cadastre uma categoria acima.</p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ABA 3: LOCALIZAÇÕES                       -->
      <div v-if="activeTab === 'locations'" class="space-y-6">
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div class="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between flex-wrap gap-3">
            <h2 class="font-bold text-gray-800 flex items-center gap-2 text-balance">
              <MapPin class="w-4 h-4 text-emerald-500" /> Localizações de Armazenamento
            </h2>
            <span class="text-xs text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full font-semibold">
            {{ authStore.user?.role === 'admin_setor' ? `Setor: ${settingsSectorLabel(authStore.user.assignedSector, 'Geral / Livre')}` : 'Governança de Prateleiras' }}
            </span>
          </div>

          <div class="px-6 pt-4">
            <div class="rounded-lg border border-emerald-100 bg-emerald-50/50 px-4 py-3 text-xs text-emerald-950 text-pretty">
              Prateleiras novas podem aceitar todas as categorias do setor. Para restringir uma prateleira, escolha categorias específicas. As prateleiras antigas mantêm seus vínculos atuais até serem editadas.
            </div>
          </div>
          
          <!-- Formulário de adição de Localização (Oculto para perfil leitor) -->
          <div v-if="canManageSettings" class="px-6 py-4 border-b border-gray-100 bg-emerald-50/30">
            <form @submit.prevent="addLocation" class="space-y-3">
              <div class="flex gap-3 items-end flex-wrap">
                <div class="flex-1 min-w-[200px]">
            <label for="new-location-name" class="block text-xs font-bold text-gray-700 mb-1">Nome da prateleira</label>
                  <input id="new-location-name" v-model="newLocation.name" required placeholder="Ex.: Rua 03 - Caixote 58 - Nível 01"
                    class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-400 bg-white uppercase" />
                </div>

                <div v-if="authStore.user?.role === 'admin_setor'" class="w-48 min-w-[160px]">
                  <label class="block text-xs font-bold text-gray-700 mb-1">Setor desta prateleira</label>
                  <div class="px-3 py-2 border border-emerald-200 bg-emerald-50 rounded-lg text-sm font-bold text-emerald-800 uppercase">
                {{ settingsSectorLabel(authStore.user.assignedSector, 'Geral / Livre') }}
                  </div>
                </div>
                <div v-else class="w-48 min-w-[160px]">
                  <label for="new-location-sector" class="block text-xs font-bold text-gray-700 mb-1">Setor desta prateleira</label>
                  <select
                    id="new-location-sector"
                    v-model="newLocation.sector"
                    class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-400 bg-white font-medium uppercase"
                  >
                    <option value="">Geral / Livre (todos os setores)</option>
                    <option v-for="sector in availableLocationSectors" :key="sector.id" :value="sector.id">{{ sector.label }}</option>
                  </select>
                  <p class="mt-1 text-[11px] text-gray-500 text-pretty">As categorias disponíveis abaixo dependem deste setor.</p>
                </div>

                <div v-if="availableSubsectorsForNewLocation.length" class="w-52 min-w-[180px]">
                  <label for="new-location-subsector" class="block text-xs font-bold text-gray-700 mb-1">Subsetor (opcional)</label>
                  <select id="new-location-subsector" v-model="newLocation.subsectorId"
                    class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-400 bg-white font-medium">
                    <option :value="null">Sem subsetor (fluxo atual do setor)</option>
                    <option v-for="subsector in availableSubsectorsForNewLocation" :key="subsector.id" :value="subsector.id">{{ subsector.name }}</option>
                  </select>
                </div>

                <button type="submit" :disabled="loadingLocation || !newLocation.name.trim() || (newLocation.categoryMode === 'SELECTED' && !newLocation.categoryIds.length)"
                  class="px-4 py-2 bg-emerald-600 text-white rounded-lg font-bold text-sm hover:bg-emerald-700 transition flex items-center gap-2 disabled:opacity-50 h-10">
                  <Plus class="size-4" /> Adicionar prateleira
                </button>
              </div>

              <fieldset class="flex flex-wrap gap-4 text-xs text-gray-700">
                <legend class="mb-2 font-bold text-gray-800">Categorias aceitas nesta prateleira</legend>
                <label class="flex items-center gap-2"><input v-model="newLocation.categoryMode" type="radio" value="ALL" /> Todas as categorias do setor</label>
                <label class="flex items-center gap-2"><input v-model="newLocation.categoryMode" type="radio" value="SELECTED" /> Somente as selecionadas</label>
              </fieldset>
              <div v-if="newLocation.categoryMode === 'SELECTED'">
                <label class="block text-sm font-bold text-gray-800 mb-1">
                  Selecione as categorias
                </label>
                <p class="text-xs text-gray-500 mb-2 text-pretty">Somente as categorias marcadas poderão ser guardadas aqui.</p>
                <div v-if="availableCategoriesForNewLocation.length > 0" class="flex flex-wrap gap-2">
                  <button
                    v-for="cat in availableCategoriesForNewLocation"
                    :key="cat.id"
                    type="button"
                    @click="toggleCategorySelection(cat.id)"
                    :aria-pressed="newLocation.categoryIds.includes(cat.id)"
                    class="px-3 py-1 rounded-full text-xs font-bold transition-all border"
                    :class="newLocation.categoryIds.includes(cat.id)
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-emerald-300'"
                  >
                    {{ cat.name }}
                  </button>
                </div>
                <p v-else class="text-xs text-gray-500 italic">Nenhuma categoria disponível para este setor.</p>
              </div>
            </form>
          </div>

          <div v-if="loadingLocation" class="p-8 text-center text-gray-400">Carregando...</div>
          <table v-else class="w-full text-left">
            <thead class="bg-gray-50 text-xs font-bold text-gray-400 uppercase tracking-wider">
              <tr>
                <th class="px-6 py-3">Nome da Localização</th>
                <th class="px-6 py-3 text-center">Setor</th>
                <th class="px-6 py-3 text-center">Categorias vinculadas</th>
                <th v-if="canManageSettings" class="px-6 py-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              <tr v-for="loc in filteredLocations" :key="loc.id" class="hover:bg-gray-50/50 transition-colors">
                <td class="px-6 py-3 text-sm text-gray-700 font-medium">{{ loc.name }}</td>
                <td class="px-6 py-3 text-center">
                  <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
              {{ settingsSectorLabel(loc.sector, 'Geral / Livre') }}
                  </span>
                  <span v-if="loc.subsector" class="ml-1 inline-flex rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-0.5 text-[11px] font-bold text-indigo-700">
                    {{ loc.subsector.name }}{{ !loc.subsector.active ? ' · arquivado' : '' }}
                  </span>
                </td>
                <td class="px-6 py-3 text-center">
                  <div class="flex flex-wrap items-center justify-center gap-1.5">
                    <span v-if="loc.categoryMode === 'ALL'" class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">Todas do setor</span>
                    <template v-else-if="loc.categoryLinks && loc.categoryLinks.length > 0">
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
                    <span v-else class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">Sem categorias vinculadas (legado)</span>
                  </div>
                </td>
                <td v-if="canManageSettings" class="px-6 py-3 text-center">
                  <div class="flex items-center justify-center gap-2">
                    <button
                      @click="openEditLocationModal(loc)"
                      class="text-gray-400 hover:text-blue-600 transition-colors p-1 rounded hover:bg-blue-50"
                      title="Editar setor e categorias"
                      :aria-label="`Editar vínculo de categorias da localização ${loc.name}`"
                    >
                      <Pencil class="w-4 h-4" />
                    </button>
                    <button
                      @click="deleteLocation(loc)"
                      class="text-gray-400 hover:text-red-600 transition-colors p-1 rounded hover:bg-red-50"
                      title="Excluir"
                      :aria-label="`Excluir localização ${loc.name}`"
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
                  <option v-for="sector in operationalSectorOptions" :key="sector.id" :value="sector.id">{{ sector.label }}</option>
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
              {{ formatSectorName(orig.sector, 'Geral / Livre') }}
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
                <option v-for="sector in operationalSectorOptions" :key="sector.id" :value="sector.id">Modelo: {{ sector.label }}</option>
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
                  <span>Exemplo de Arquivo CSV Válido ({{ formatSectorName(templateSector, 'Geral / Livre') }})</span>
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
                <button @click="selectedFile = null; importResult = null; importPreview = null" class="text-blue-400 hover:text-red-500 transition">
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
                  <option v-for="sector in operationalSectorOptions" :key="sector.id" :value="sector.id">{{ sector.label }}</option>
                </select>
                <span class="text-slate-500 text-[11px]">(Utilizado caso a planilha não contenha a coluna 'setor')</span>
              </div>
            </div>

            <div v-if="importPreview" class="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950 space-y-1">
              <p class="font-bold">Prévia da importação — nenhum item foi gravado</p>
              <p>{{ importPreview.processados }} processados · {{ importPreview.novos }} novos · {{ importPreview.ignorados }} já cadastrados e ignorados</p>
              <p>{{ importPreview.saldosZero }} com saldo zero · {{ importPreview.localizacoesPadrao }} usando localização padrão</p>
              <p>Localizações: {{ importPreview.prateleiras.slice(0, 5).join(', ') }}{{ importPreview.prateleiras.length > 5 ? '…' : '' }}</p>
              <p>Codificação detectada: {{ importPreview.codificacao }}. Itens existentes não terão seus saldos alterados.</p>
              <p v-if="importPreview.itensLimitados" class="pt-1 text-xs text-blue-800">
                Abaixo estão os primeiros {{ importPreview.itens.length }} de {{ importPreview.totalItens }} itens validados.
              </p>
              <div v-if="importPreview.itens?.length" class="mt-3 max-h-96 overflow-auto rounded-lg border border-blue-200 bg-white">
                <table class="min-w-full text-left text-xs">
                  <thead class="sticky top-0 bg-blue-100 text-blue-950">
                    <tr>
                      <th class="px-3 py-2">Linha</th>
                      <th class="px-3 py-2">Setor</th>
                      <th class="px-3 py-2">Subsetor</th>
                      <th class="px-3 py-2">SKU / código</th>
                      <th class="px-3 py-2">Modelo / peça</th>
                      <th class="px-3 py-2">Tipo</th>
                      <th class="px-3 py-2">Cor / combinação</th>
                      <th class="px-3 py-2">Grade / lado</th>
                      <th class="px-3 py-2">Saldo / unidade</th>
                      <th class="px-3 py-2">Localização</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-blue-50 text-slate-700">
                    <tr v-for="item in importPreview.itens" :key="`${item.linha}-${item.setor}-${item.sku}-${item.grade || ''}-${item.lado || ''}`">
                      <td class="px-3 py-2 whitespace-nowrap">{{ item.linha }}</td>
                      <td class="px-3 py-2 whitespace-nowrap">{{ formatSectorName(item.setor, item.setor) }}</td>
                      <td class="px-3 py-2 whitespace-nowrap">{{ item.subsetor || 'Sem subsetor' }}</td>
                      <td class="px-3 py-2 font-mono whitespace-nowrap">{{ item.sku }}</td>
                      <td class="px-3 py-2 min-w-40">
                        <span class="font-semibold">{{ item.modelo }}</span>
                        <span v-if="item.peca && item.peca !== item.modelo" class="block text-slate-500">{{ item.peca }}</span>
                      </td>
                      <td class="px-3 py-2 whitespace-nowrap">{{ item.tipo || '—' }}</td>
                      <td class="px-3 py-2 whitespace-nowrap">{{ item.combinacao || '—' }}</td>
                      <td class="px-3 py-2 whitespace-nowrap">{{ [item.grade, item.lado].filter(Boolean).join(' / ') || '—' }}</td>
                      <td class="px-3 py-2 whitespace-nowrap">{{ item.quantidade }} {{ item.unidade }}</td>
                      <td class="px-3 py-2 min-w-36">
                        <span v-for="(local, index) in item.localizacoes" :key="`${local.nome}-${index}`" class="block whitespace-nowrap">
                          {{ local.nome }} <span class="text-slate-500">({{ local.quantidade }})</span>
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Validação antes da confirmação -->
            <button v-if="selectedFile" @click="importPreview ? importCSV() : previewCSV()" :disabled="importing"
              class="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm transition flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-blue-200 cursor-pointer">
              <Loader2 v-if="importing" class="w-4 h-4 animate-spin text-white" />
              <Upload v-else class="w-4 h-4" />
              {{ importing ? 'Processando Planilha Multi-Setor...' : importPreview ? 'Confirmar Importação de Materiais' : 'Validar e Visualizar Importação' }}
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
                        <strong>{{ importResult.inseridos }}</strong> materiais cadastrados · <strong>{{ importResult.ignorados || 0 }}</strong> já existentes e ignorados · <strong>{{ importResult.processados }}</strong> processados no total.
                    </p>
                    <p class="text-[11px] text-emerald-700">
                      ✓ Prateleiras e Localizações vinculadas: <strong>{{ importResult.prateleirasCriadas || 0 }}</strong> · Movimentações de Saldo Inicial geradas: <strong>{{ importResult.movimentacoesCriadas || 0 }}</strong>
                    </p>
                  </div>

                  <!-- Tabela Detalhada de Erros Linha a Linha (HTTP 422 Pre-flight) -->
                  <div v-if="importResult.errors && importResult.errors.length > 0" class="mt-3 pt-3 border-t border-red-200">
                    <div class="flex items-center justify-between mb-2">
                      <span class="text-xs font-bold uppercase tracking-wider text-red-900">
                        Inconsistências Encontradas ({{ importResult.totalErrors || importResult.errors.length }} {{ (importResult.totalErrors || importResult.errors.length) === 1 ? 'erro' : 'erros' }}{{ importResult.totalErrors > importResult.errors.length ? ', primeiras 100 exibidas' : '' }}):
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

    <!-- MODAL DE EDIÇÃO DE CATEGORIA -->
    <div v-if="showEditCategoryModal" ref="editCategoryDialog" role="dialog" aria-modal="true" aria-labelledby="edit-category-title" class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden border border-gray-100">
        <div class="bg-gray-50 px-6 py-4 border-b flex justify-between items-center">
          <h3 id="edit-category-title" class="font-bold text-gray-800 flex items-center gap-2">
            <Tag class="w-4 h-4 text-indigo-600" /> Editar Categoria
          </h3>
          <button type="button" @click="showEditCategoryModal = false" aria-label="Fechar edição de categoria" class="text-gray-400 hover:text-gray-600 font-bold text-xl">&times;</button>
        </div>

        <form @submit.prevent="saveEditCategory" class="p-6 space-y-5 text-xs">
          <div>
            <label for="edit-category-name" class="block text-sm font-bold text-gray-800 mb-1">Nome da categoria *</label>
            <input id="edit-category-name" v-model="editingCategory.name" required
              class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-400 uppercase bg-white" />
          </div>

          <div>
            <label for="edit-category-unit" class="block text-sm font-bold text-gray-800 mb-1">Unidade de medida</label>
            <select id="edit-category-unit" v-model="editingCategory.defaultUnitCode" required :disabled="isEditCategoryUnitFixed"
              class="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-white disabled:bg-gray-100">
              <option value="" disabled>Selecione a unidade</option>
              <option v-for="unit in units" :key="unit.symbol" :value="unit.symbol">{{ unit.name }} ({{ unit.symbol }})</option>
            </select>
            <p v-if="isEditCategoryUnitFixed" class="mt-1 text-xs text-gray-500">Este setor registra as peças individualmente em UN.</p>
            <p v-if="editingLegacyUnit" class="mt-1 text-xs text-amber-700">A configuração anterior usava {{ editingLegacyUnit }}. Ao salvar, a categoria passará a usar UN; os registros de estoque antigos não serão alterados.</p>
          </div>

          <details class="rounded-xl border border-gray-200 bg-gray-50/70">
            <summary class="cursor-pointer px-4 py-3 text-xs font-bold text-gray-700">Configurações avançadas</summary>
            <div class="space-y-4 border-t border-gray-200 p-4">

          <fieldset class="border border-gray-200 rounded-xl p-4 space-y-3">
            <legend class="px-1 text-sm font-bold text-gray-800">Onde essa categoria poderá ser usada?</legend>
            <p class="text-xs text-gray-500 text-pretty">A disponibilidade por setor define em quais cadastros e prateleiras a categoria aparecerá.</p>
            <div v-if="isCategorySectorLocked" class="inline-flex items-center px-3 py-2 border border-emerald-200 rounded-lg bg-emerald-50 text-emerald-800 font-bold">
              {{ settingsSectorLabel(assignedCategorySector, 'Setor não definido') }}
            </div>
            <template v-else>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label class="flex items-start gap-2.5 rounded-lg border p-3 cursor-pointer"
                  :class="editingCategory.scopeMode === 'specific' ? 'border-indigo-300 bg-indigo-50/70' : 'border-gray-200 bg-white'">
                  <input v-model="editingCategory.scopeMode" type="radio" value="specific" class="mt-0.5 text-indigo-600 focus:ring-indigo-500" />
                  <span><span class="block text-xs font-bold text-gray-800">Setor(es) selecionado(s)</span><span class="block mt-0.5 text-[11px] text-gray-500">Usar somente onde estiver marcado.</span></span>
                </label>
                <label class="flex items-start gap-2.5 rounded-lg border p-3 cursor-pointer"
                  :class="editingCategory.scopeMode === 'all' ? 'border-indigo-300 bg-indigo-50/70' : 'border-gray-200 bg-white'">
                  <input v-model="editingCategory.scopeMode" type="radio" value="all" class="mt-0.5 text-indigo-600 focus:ring-indigo-500" />
                  <span><span class="block text-xs font-bold text-gray-800">Todos os setores</span><span class="block mt-0.5 text-[11px] text-gray-500">Disponível em toda a unidade fabril.</span></span>
                </label>
              </div>
              <div v-if="editingCategory.scopeMode === 'specific'" class="space-y-2">
                <p class="text-xs font-semibold text-gray-700">Setores que poderão usar a categoria:</p>
                <div class="flex flex-wrap gap-2">
                  <label v-for="sector in categorySectorsOptions" :key="sector.id"
                    class="inline-flex items-center gap-2 px-3 py-2 border rounded-lg text-xs font-semibold cursor-pointer"
                    :class="editingCategory.sectors.includes(sector.id) ? 'bg-indigo-50 border-indigo-300 text-indigo-800' : 'bg-white border-gray-200 text-gray-600'">
                    <input v-model="editingCategory.sectors" type="checkbox" :value="sector.id" class="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                    {{ sector.label }}
                  </label>
                </div>
                <p v-if="editingCategory.sectors.length === 0" class="text-xs font-medium text-amber-700" role="status">Escolha pelo menos um setor para salvar.</p>
              </div>
            </template>
          </fieldset>

          <div v-if="editingCategory.scopeMode === 'specific'">
            <label for="edit-category-subtype" class="block text-sm font-bold text-gray-800 mb-1">Subtipo / tipo de material <span class="font-normal text-gray-500">(opcional)</span></label>
            <select id="edit-category-subtype" v-model="editingCategory.subtypeId" :disabled="loadingComponentSubtype || !editingCategory.sectors.length" class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-400 bg-white disabled:bg-gray-100">
              <option value="">Sem tipo específico</option>
              <option v-for="subtype in availableEditComponentSubtypes" :key="subtype.id" :value="subtype.id">{{ subtype.name }}</option>
            </select>
            <p class="text-xs text-gray-500 mt-1.5 text-pretty">A lista mostra os subtipos permitidos para todos os setores selecionados.</p>
          </div>

              <label v-if="!isEditCategoryUnitFixed" class="flex items-center gap-2 text-xs font-semibold text-gray-700 cursor-pointer">
                <input type="checkbox" v-model="editingCategory.unitLocked" :disabled="!editingCategory.defaultUnitCode" class="size-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 disabled:cursor-not-allowed" />
                <Lock class="size-4 text-amber-600" /> Fixar unidade para novas entradas
              </label>
            </div>
          </details>

          <div class="pt-4 border-t flex justify-end gap-2">
            <button type="button" @click="showEditCategoryModal = false" class="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium rounded-lg text-xs">Cancelar</button>
            <button type="submit" :disabled="savingCategory || !editingCategory.name.trim() || !editingCategory.defaultUnitCode || (editingCategory.scopeMode === 'specific' && !editingCategory.sectors.length)" class="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-xs disabled:opacity-50">
              {{ savingCategory ? 'Salvando...' : 'Salvar Alterações' }}
            </button>
          </div>
        </form>
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
            <label for="edit-location-name" class="block font-bold text-gray-700 mb-1">Nome da prateleira *</label>
            <input
              id="edit-location-name"
              v-model="editingLocation.name"
              type="text"
              required
              class="w-full border border-gray-200 p-2.5 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-400 bg-white font-medium uppercase"
            />
          </div>

          <div v-if="authStore.user?.role === 'admin_setor'">
            <label class="block font-bold text-gray-500 uppercase mb-1">Setor</label>
            <div class="border border-emerald-200 bg-emerald-50 p-2.5 rounded-lg text-sm font-bold text-emerald-800 uppercase">
              {{ settingsSectorLabel(authStore.user.assignedSector, 'Geral / Livre') }}
            </div>
          </div>
          <div v-else>
            <label class="block font-bold text-gray-700 mb-1">Setor desta prateleira</label>
            <select
              v-model="editingLocation.sector"
              class="w-full border border-gray-200 p-2.5 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-400 bg-white font-medium uppercase"
            >
              <option value="">Geral / Livre (todos os setores)</option>
              <option v-for="sector in operationalSectorOptions" :key="sector.id" :value="sector.id">{{ sector.label }}</option>
            </select>
          </div>

          <div v-if="availableSubsectorsForEditLocation.length">
            <label for="edit-location-subsector" class="block font-bold text-gray-700 mb-1">Subsetor (opcional)</label>
            <select id="edit-location-subsector" v-model="editingLocation.subsectorId"
              class="w-full border border-gray-200 p-2.5 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-400 bg-white font-medium">
              <option :value="null">Sem subsetor (fluxo atual do setor)</option>
              <option v-for="subsector in availableSubsectorsForEditLocation" :key="subsector.id" :value="subsector.id"
                :disabled="!subsector.active && Number(editingLocation.subsectorId) !== Number(subsector.id)">
                {{ subsector.name }}{{ !subsector.active ? ' · arquivado (manter ou remover)' : '' }}
              </option>
            </select>
            <p class="mt-1 text-[11px] text-gray-500">A localização fica vinculada a um único subsetor e não poderá ser compartilhada.</p>
          </div>

          <fieldset class="flex flex-wrap gap-4 text-xs text-gray-700">
            <legend class="mb-2 font-bold text-gray-800">Categorias aceitas nesta prateleira</legend>
            <label class="flex items-center gap-2"><input v-model="editingLocation.categoryMode" type="radio" value="ALL" /> Todas as categorias do setor</label>
            <label class="flex items-center gap-2"><input v-model="editingLocation.categoryMode" type="radio" value="SELECTED" /> Somente as selecionadas</label>
          </fieldset>
          <div v-if="editingLocation.categoryMode === 'SELECTED'">
            <label class="block font-bold text-gray-800 mb-1">Quais categorias poderão ser guardadas aqui?</label>
            <p class="text-xs text-gray-500 mb-2 text-pretty">Marque as categorias permitidas. Uma prateleira antiga sem marcas continua restrita até você alterar esta configuração.</p>
            <div v-if="availableCategoriesForEditLocation.length > 0" class="flex flex-wrap gap-2">
              <button
                v-for="cat in availableCategoriesForEditLocation"
                :key="cat.id"
                type="button"
                @click="toggleEditCategorySelection(cat.id)"
                :aria-pressed="editingLocation.categoryIds.includes(cat.id)"
                class="px-3 py-1 rounded-full text-xs font-bold transition-all border"
                :class="editingLocation.categoryIds.includes(cat.id)
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                  : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-emerald-300'"
              >
                {{ cat.name }}
              </button>
            </div>
            <p v-else class="text-xs text-gray-500 italic">
              Ainda não há categorias disponíveis para este setor. A prateleira continua vinculada ao setor e pode ser editada depois.
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
              :disabled="!editingLocation.name.trim() || (editingLocation.categoryMode === 'SELECTED' && !editingLocation.categoryIds.length && !editingLocation.legacyEmptySelection)"
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
import SubsectorSettings from '@/components/SubsectorSettings.vue'
import { formatSectorName, SECTOR_OPTIONS } from '@/utils/domain'
import { formatDate } from '@/utils/format'
import {
  Settings as SettingsIcon, Tag, MapPin, GitBranch, FileSpreadsheet, Ruler, Lock, Download, HelpCircle,
  Plus, Trash2, Upload, CheckCircle, XCircle, Pencil, Loader2, Building2, Sliders, ClipboardList, Layers
} from 'lucide-vue-next'

const authStore = useAuthStore()
const settingsPersisted = usePersistedFilters('settings', {
  categoryFilterSector: 'TODOS',
  templateSector: authStore.user?.assignedSector || 'CORTE',
}, () => authStore.user?.unit?.code || 'default')

// --- PERMISSÕES ---
const canManageSettings = computed(() => authStore.can('gerenciar_configuracoes'))
const isMasterAdmin = computed(() => authStore.user?.role === 'admin' || Boolean(authStore.user?.isGlobalAdmin))
const canManageSubtypes = computed(() => canManageSettings.value && isMasterAdmin.value)

// --- TABS DINÂMICAS POR PERFIL ---
const tabs = computed(() => {
  // Admin Master e Admin de Setor: todas as abas
  return [
    { key: 'categories',   label: 'Categorias',                 icon: Tag },
    { key: 'subsectors',   label: 'Subsetores',                 icon: Layers },
    { key: 'locations',    label: 'Localizações / Prateleiras', icon: MapPin },
    { key: 'origins',      label: 'Origens / Motivos',          icon: GitBranch },
    { key: 'import',       label: 'Importar CSV',               icon: FileSpreadsheet },
    ...(isMasterAdmin.value ? [{ key: 'factory_unit', label: 'Unidade Fabril', icon: Building2 }] : [])
  ]
})
const activeTab = ref('categories')
const subsectorDirty = ref(false)

// --- NOTIFICAÇÕES & MODAL DE CONFIRMAÇÃO COMPARTILHADOS ---
const { notification, showNotification } = useToast(3500)
const { confirmState, openConfirmModal, handleConfirmedAction } = useConfirmModal()
const settingsData = useSettings({ notify: showNotification })
const {
  categories, componentSubtypes, units, locations, origins,
  loadingCategory, loadingComponentSubtype, loadingUnit, loadingLocation, loadingOrigin,
  loading: settingsLoading,
  error: settingsError,
  fetchCategories, fetchComponentSubtypes, fetchUnits, fetchLocations, fetchOrigins,
} = settingsData
const dbSubsectors = ref([])

async function fetchSubsectors() {
  if (!canManageSettings.value) return
  try {
    const response = await api.get('/settings/subsectors', { params: { includeArchived: true } })
    dbSubsectors.value = response.data || []
  } catch (error) {
    showNotification('error', error.response?.data?.error || 'Não foi possível carregar os subsetores das localizações.')
  }
}

// CATEGORIAS
const categoryFilterSector = computed({
  get: () => settingsPersisted.filters.value.categoryFilterSector || 'TODOS',
  set: value => { settingsPersisted.filters.value.categoryFilterSector = value || 'TODOS' },
})
const operationalSectorOptions = SECTOR_OPTIONS
  .filter(sector => sector.id !== 'TODOS')
  .map(sector => ({ id: sector.id, label: sector.shortLabel || sector.label }))
const categorySectorsOptions = operationalSectorOptions
const isCategorySectorLocked = computed(() => authStore.user?.role === 'admin_setor')
const assignedCategorySector = computed(() => normalizeCategorySector(authStore.user?.assignedSector))
const categoryRegistrationSector = ref(assignedCategorySector.value || '')

function normalizeCategorySector(value) {
  return value === 'EXPEDICAO' ? 'DISTRIBUICAO' : value
}

function settingsSectorLabel(value, fallback) {
  const normalized = normalizeCategorySector(value)
  return categorySectorsOptions.find(sector => sector.id === normalized)?.label || formatSectorName(value, fallback)
}

function getCategorySectors(category) {
  const sectors = Array.isArray(category?.sectors) && category.sectors.length
    ? category.sectors
    : category?.sector ? [category.sector] : []
  return [...new Set(sectors.map(normalizeCategorySector).filter(Boolean))]
}

function categoryAppliesToSector(category, sector) {
  const scopes = getCategorySectors(category)
  return scopes.length === 0 || scopes.includes(normalizeCategorySector(sector))
}

function formatCategorySectors(category) {
  const scopes = getCategorySectors(category)
  if (!scopes.length) return 'Todos os setores'
  return scopes.map(sector => settingsSectorLabel(sector)).join(', ')
}

function componentSubtypesForSectors(sectors) {
  const normalized = (sectors || []).map(normalizeCategorySector)
  if (!normalized.length) return []
  return componentSubtypes.value.filter(subtype => {
    const availableSectors = (subtype.sectors || []).map(normalizeCategorySector)
    return normalized.every(sector => availableSectors.includes(sector))
  })
}

const availableComponentSubtypes = computed(() => componentSubtypesForSectors(newCategory.value.sectors))
const availableEditComponentSubtypes = computed(() => componentSubtypesForSectors(editingCategory.value.sectors))
const hasDiscreteCategorySector = (scopeMode, sectors) => scopeMode === 'all'
  || sectors.some(sector => normalizeCategorySector(sector) !== 'CORTE')
const newCategory = ref({
  name: '',
  scopeMode: 'specific',
  sectors: categoryRegistrationSector.value ? [categoryRegistrationSector.value] : [],
  subtypeId: '',
  defaultUnitCode: categoryRegistrationSector.value && categoryRegistrationSector.value !== 'CORTE' ? 'UN' : '',
  unitLocked: true
})
const isNewCategoryUnitFixed = computed(() => hasDiscreteCategorySector(newCategory.value.scopeMode, newCategory.value.sectors))

const showEditCategoryModal = ref(false)
const editCategoryDialog = ref(null)
const savingCategory = ref(false)
const creatingCategory = ref(false)
const savingSubtype = ref(false)
const subtypeDraft = ref({ id: null, name: '', sectors: [] })
const emptySubtypeDraft = () => ({ id: null, name: '', sectors: [] })
const subtypeDraftSnapshot = ref(JSON.stringify(emptySubtypeDraft()))
const editingCategory = ref({
  id: 0,
  name: '',
  scopeMode: 'specific',
  sectors: [],
  subtypeId: '',
  defaultUnitCode: '',
  unitLocked: false,
})
const isEditCategoryUnitFixed = computed(() => hasDiscreteCategorySector(editingCategory.value.scopeMode, editingCategory.value.sectors))
const editingLegacyUnit = ref('')
const editingOriginalSubtypeId = ref(null)
const editingOriginalScope = ref('')

watch(categoryRegistrationSector, sector => {
  newCategory.value.scopeMode = 'specific'
  newCategory.value.sectors = sector ? [sector] : []
  newCategory.value.subtypeId = ''
  newCategory.value.defaultUnitCode = sector && sector !== 'CORTE' ? 'UN' : ''
})

watch(() => [newCategory.value.scopeMode, newCategory.value.sectors.join('|')], () => {
  if (isNewCategoryUnitFixed.value) newCategory.value.defaultUnitCode = 'UN'
})

watch(() => [editingCategory.value.scopeMode, editingCategory.value.sectors.join('|')], () => {
  if (isEditCategoryUnitFixed.value) editingCategory.value.defaultUnitCode = 'UN'
})

watch(() => newCategory.value.sectors.join('|'), () => {
  if (newCategory.value.subtypeId && componentSubtypes.value.length
    && !availableComponentSubtypes.value.some(subtype => String(subtype.id) === String(newCategory.value.subtypeId))) {
    newCategory.value.subtypeId = ''
  }
})

watch(() => newCategory.value.scopeMode, (mode) => {
  if (mode === 'all') {
    newCategory.value.subtypeId = ''
  } else if (isCategorySectorLocked.value && assignedCategorySector.value) {
    newCategory.value.sectors = [assignedCategorySector.value]
  }
})

watch(() => editingCategory.value.sectors.join('|'), () => {
  if (editingCategory.value.subtypeId && componentSubtypes.value.length
    && !availableEditComponentSubtypes.value.some(subtype => String(subtype.id) === String(editingCategory.value.subtypeId))) {
    editingCategory.value.subtypeId = ''
  }
})

watch(() => editingCategory.value.scopeMode, (mode) => {
  if (mode === 'all') {
    editingCategory.value.subtypeId = ''
  }
})

watch(() => editingCategory.value.defaultUnitCode, (unitCode) => {
  if (!unitCode) editingCategory.value.unitLocked = false
})

const filteredCategories = computed(() => {
  if (categoryFilterSector.value === 'TODOS') return categories.value
  const target = categoryFilterSector.value === 'EXPEDICAO' ? 'DISTRIBUICAO' : categoryFilterSector.value
  return categories.value.filter(cat => categoryAppliesToSector(cat, target))
})

async function addCategory() {
  if (creatingCategory.value) return
  if (!newCategory.value.name.trim()) {
    showNotification('error', 'Informe o nome da categoria para continuar.')
    return
  }
  if (!categoryRegistrationSector.value || (newCategory.value.scopeMode === 'specific' && !newCategory.value.sectors.length)) {
    showNotification('error', 'Selecione o setor da categoria.')
    return
  }
  if (!newCategory.value.defaultUnitCode) {
    showNotification('error', 'Escolha a unidade de medida da categoria.')
    return
  }
  creatingCategory.value = true
  try {
    const res = await api.post('/settings/categories', {
      name: newCategory.value.name.trim(),
      sectors: newCategory.value.scopeMode === 'all' ? [] : newCategory.value.sectors,
      subtypeId: newCategory.value.subtypeId || null,
      defaultUnitCode: newCategory.value.defaultUnitCode,
      unitLocked: true
    })
    const submittedName = newCategory.value.name.trim()
    showNotification('success', `Categoria "${submittedName}" criada com sucesso!`)
    newCategory.value = {
      name: '',
      scopeMode: 'specific',
      sectors: [categoryRegistrationSector.value],
      subtypeId: '',
      defaultUnitCode: categoryRegistrationSector.value === 'CORTE' ? '' : 'UN',
      unitLocked: true
    }
    if (res.data) categories.value.unshift(res.data)
    await Promise.all([fetchCategories(), fetchComponentSubtypes()])
  } catch (e) {
    const msg = e.response?.data?.error || 'Erro ao criar categoria.'
    showNotification('error', msg)
  } finally {
    creatingCategory.value = false
  }
}

function openEditCategory(category) {
  const sectors = getCategorySectors(category)
  const scopeMode = sectors.length ? 'specific' : 'all'
  const fixedUnit = hasDiscreteCategorySector(scopeMode, sectors)
  editingLegacyUnit.value = fixedUnit && category.defaultUnitCode && category.defaultUnitCode !== 'UN'
    ? category.defaultUnitCode : ''
  editingOriginalSubtypeId.value = category.subtypeId || null
  editingOriginalScope.value = JSON.stringify({ scopeMode, sectors: [...sectors].sort() })
  editingCategory.value = {
    id: category.id,
    name: category.name || '',
    scopeMode,
    sectors,
    subtypeId: category.subtypeId || '',
    defaultUnitCode: fixedUnit ? 'UN' : category.defaultUnitCode || '',
    unitLocked: Boolean(category.unitLocked),
  }
  showEditCategoryModal.value = true
}

async function saveEditCategory() {
  if (!editingCategory.value.name.trim() || savingCategory.value) return
  if (!isCategorySectorLocked.value && editingCategory.value.scopeMode === 'specific' && !editingCategory.value.sectors.length) return
  if (!editingCategory.value.defaultUnitCode) {
    showNotification('error', 'Escolha a unidade de medida da categoria.')
    return
  }
  savingCategory.value = true
  try {
    const scopeChanged = JSON.stringify({
      scopeMode: editingCategory.value.scopeMode,
      sectors: [...editingCategory.value.sectors].sort(),
    }) !== editingOriginalScope.value
    const subtypeChanged = (editingCategory.value.subtypeId || null) !== editingOriginalSubtypeId.value
    await api.put(`/settings/categories/${editingCategory.value.id}`, {
      name: editingCategory.value.name.trim(),
      sectors: isCategorySectorLocked.value || !scopeChanged
        ? undefined
        : editingCategory.value.scopeMode === 'all' ? [] : editingCategory.value.sectors,
      subtypeId: subtypeChanged ? editingCategory.value.subtypeId || null : undefined,
      defaultUnitCode: editingCategory.value.defaultUnitCode,
      unitLocked: isEditCategoryUnitFixed.value ? true : Boolean(editingCategory.value.unitLocked),
    })
    showNotification('success', `Categoria "${editingCategory.value.name}" atualizada com sucesso!`)
    showEditCategoryModal.value = false
    await Promise.all([fetchCategories(), fetchComponentSubtypes()])
  } catch (e) {
    const msg = e.response?.data?.error || 'Erro ao atualizar categoria.'
    showNotification('error', msg)
  } finally {
    savingCategory.value = false
  }
}

function normalizedSubtypeDraft() {
  return {
    id: subtypeDraft.value.id,
    name: subtypeDraft.value.name.trim(),
    sectors: [...subtypeDraft.value.sectors].sort(),
  }
}

function hasUnsubmittedSubtype() {
  return JSON.stringify(normalizedSubtypeDraft()) !== subtypeDraftSnapshot.value
}

function resetSubtypeDraft() {
  subtypeDraft.value = emptySubtypeDraft()
  subtypeDraftSnapshot.value = JSON.stringify(emptySubtypeDraft())
}

function editComponentSubtype(subtype) {
  subtypeDraft.value = {
    id: subtype.id,
    name: subtype.name || '',
    sectors: (subtype.sectors || []).map(normalizeCategorySector),
  }
  subtypeDraftSnapshot.value = JSON.stringify(normalizedSubtypeDraft())
}

async function saveComponentSubtype() {
  if (savingSubtype.value || !subtypeDraft.value.name.trim() || !subtypeDraft.value.sectors.length) return
  savingSubtype.value = true
  try {
    const payload = {
      name: subtypeDraft.value.name.trim(),
      sectors: subtypeDraft.value.sectors,
    }
    if (subtypeDraft.value.id) {
      await api.put(`/settings/component-subtypes/${subtypeDraft.value.id}`, payload)
      showNotification('success', `Subtipo "${payload.name}" atualizado.`)
    } else {
      await api.post('/settings/component-subtypes', payload)
      showNotification('success', `Subtipo "${payload.name}" adicionado.`)
    }
    resetSubtypeDraft()
    await Promise.all([fetchComponentSubtypes(), fetchCategories()])
  } catch (e) {
    showNotification('error', e.response?.data?.error || 'Erro ao salvar subtipo.')
  } finally {
    savingSubtype.value = false
  }
}

function deleteComponentSubtype(subtype) {
  const linked = subtype._count?.categories || 0
  if (linked > 0) {
    showNotification('error', 'Edite as categorias vinculadas antes de excluir este subtipo.')
    return
  }
  openConfirmModal({
    title: 'Excluir subtipo',
    message: `Deseja excluir a opção "${subtype.name}"? Ela deixará de aparecer ao cadastrar novas categorias.`,
    confirmText: 'Excluir subtipo',
    variant: 'danger',
    action: async () => {
      try {
        await api.delete(`/settings/component-subtypes/${subtype.id}`)
        if (subtypeDraft.value.id === subtype.id) resetSubtypeDraft()
        showNotification('success', `Subtipo "${subtype.name}" excluído.`)
        await fetchComponentSubtypes()
      } catch (e) {
        showNotification('error', e.response?.data?.error || 'Erro ao excluir subtipo.')
      }
    },
  })
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
        await Promise.all([fetchCategories(), fetchComponentSubtypes()])
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
  subsectorId: null,
  categoryMode: 'ALL',
  categoryIds: []
})
const availableLocationSectors = categorySectorsOptions
const showEditLocationModal = ref(false)
const editLocationDialog = ref(null)
const editLocationInitial = ref('')
const editingLocation = ref({
  id: 0,
  name: '',
  sector: '',
  subsectorId: null,
  categoryMode: 'SELECTED',
  legacyEmptySelection: false,
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
  let available = targetSector ? categories.value.filter(cat => categoryAppliesToSector(cat, targetSector)) : categories.value
  const subsector = dbSubsectors.value.find(row => Number(row.id) === Number(newLocation.value.subsectorId))
  if (subsector?.categoryMode === 'SELECTED') {
    const allowedIds = new Set((subsector.categoryLinks || []).map(link => Number(link.categoryConfigId)))
    available = available.filter(category => allowedIds.has(Number(category.id)))
  }
  return available
})

const availableCategoriesForEditLocation = computed(() => {
  const targetSector = editingLocation.value.sector
  let available = targetSector ? categories.value.filter(cat => categoryAppliesToSector(cat, targetSector)) : categories.value
  const subsector = dbSubsectors.value.find(row => Number(row.id) === Number(editingLocation.value.subsectorId))
  if (subsector?.categoryMode === 'SELECTED') {
    const allowedIds = new Set((subsector.categoryLinks || []).map(link => Number(link.categoryConfigId)))
    available = available.filter(category => allowedIds.has(Number(category.id)))
  }
  return available
})

const availableSubsectorsForNewLocation = computed(() => {
  if (!newLocation.value.sector) return []
  return dbSubsectors.value.filter(subsector => subsector.active
    && normalizeCategorySector(subsector.sector) === normalizeCategorySector(newLocation.value.sector))
})

const availableSubsectorsForEditLocation = computed(() => {
  if (!editingLocation.value.sector) return []
  return dbSubsectors.value.filter(subsector => normalizeCategorySector(subsector.sector) === normalizeCategorySector(editingLocation.value.sector)
    && (subsector.active || Number(subsector.id) === Number(editingLocation.value.subsectorId)))
})

watch(() => newLocation.value.sector, (newSec) => {
  const currentSubsector = dbSubsectors.value.find(row => Number(row.id) === Number(newLocation.value.subsectorId))
  if (currentSubsector && (!currentSubsector.active || normalizeCategorySector(currentSubsector.sector) !== normalizeCategorySector(newSec))) {
    newLocation.value.subsectorId = null
  }
  if (newSec) {
    const validIds = new Set(
      categories.value
        .filter(cat => categoryAppliesToSector(cat, newSec))
        .map(c => c.id)
    )
    newLocation.value.categoryIds = newLocation.value.categoryIds.filter(id => validIds.has(id))
  }
})

watch(() => editingLocation.value.sector, (newSec) => {
  const currentSubsector = dbSubsectors.value.find(row => Number(row.id) === Number(editingLocation.value.subsectorId))
  if (currentSubsector && normalizeCategorySector(currentSubsector.sector) !== normalizeCategorySector(newSec)) {
    editingLocation.value.subsectorId = null
  }
  if (newSec) {
    const validIds = new Set(
      categories.value
        .filter(cat => categoryAppliesToSector(cat, newSec))
        .map(c => c.id)
    )
    editingLocation.value.categoryIds = editingLocation.value.categoryIds.filter(id => validIds.has(id))
  }
})

watch(() => newLocation.value.subsectorId, () => {
  const allowedIds = new Set(availableCategoriesForNewLocation.value.map(category => Number(category.id)))
  newLocation.value.categoryIds = newLocation.value.categoryIds.filter(id => allowedIds.has(Number(id)))
})

watch(() => editingLocation.value.subsectorId, () => {
  const allowedIds = new Set(availableCategoriesForEditLocation.value.map(category => Number(category.id)))
  editingLocation.value.categoryIds = editingLocation.value.categoryIds.filter(id => allowedIds.has(Number(id)))
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
    subsectorId: loc.subsectorId ?? loc.subsector?.id ?? null,
    categoryMode: loc.categoryMode || 'SELECTED',
    legacyEmptySelection: (loc.categoryMode || 'SELECTED') === 'SELECTED' && !catIds.length,
    categoryIds: [...catIds]
  }
  editLocationInitial.value = JSON.stringify(editingLocation.value)
  showEditLocationModal.value = true
}

async function saveEditLocation() {
  if (!editingLocation.value.name.trim()) return
  if (editingLocation.value.categoryMode === 'SELECTED' && !editingLocation.value.categoryIds.length && !editingLocation.value.legacyEmptySelection) return
  try {
    const targetSector = authStore.user?.role === 'admin_setor'
      ? authStore.user.assignedSector
      : (editingLocation.value.sector || null)
    await api.put(`/settings/locations/${editingLocation.value.id}`, {
      name: editingLocation.value.name.trim(),
      sector: targetSector,
      subsectorId: editingLocation.value.subsectorId || null,
      categoryMode: editingLocation.value.categoryMode,
      categoryIds: editingLocation.value.categoryMode === 'SELECTED' ? editingLocation.value.categoryIds : undefined
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
  if (newLocation.value.categoryMode === 'SELECTED' && !newLocation.value.categoryIds.length) return
  try {
    const targetSector = authStore.user?.role === 'admin_setor'
      ? authStore.user.assignedSector
      : (newLocation.value.sector || null)
    const res = await api.post('/settings/locations', {
      name: newLocation.value.name.trim(),
      sector: targetSector,
      subsectorId: newLocation.value.subsectorId || null,
      categoryMode: newLocation.value.categoryMode,
      categoryIds: newLocation.value.categoryMode === 'SELECTED' ? newLocation.value.categoryIds : undefined
    })
    showNotification('success', `Localização "${newLocation.value.name}" criada com sucesso!`)
    newLocation.value = {
      name: '',
      sector: (authStore.user?.assignedSector && authStore.user?.assignedSector !== 'TODOS') ? authStore.user.assignedSector : '',
      subsectorId: null,
      categoryMode: 'ALL',
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

function hasUnsubmittedCategory() {
  const defaultSectors = categoryRegistrationSector.value ? [categoryRegistrationSector.value] : []
  const defaultUnit = categoryRegistrationSector.value && categoryRegistrationSector.value !== 'CORTE' ? 'UN' : ''
  const selectedSectors = [...newCategory.value.sectors].sort()
  return Boolean(
    newCategory.value.name.trim()
    || newCategory.value.scopeMode !== 'specific'
    || JSON.stringify(selectedSectors) !== JSON.stringify([...defaultSectors].sort())
    || newCategory.value.subtypeId
    || newCategory.value.defaultUnitCode !== defaultUnit
  )
}

function hasUnsubmittedLocation() {
  const defaultSector = (authStore.user?.assignedSector && authStore.user?.assignedSector !== 'TODOS')
    ? authStore.user.assignedSector
    : ''
  return Boolean(
    newLocation.value.name.trim()
    || newLocation.value.categoryMode !== 'ALL'
    || newLocation.value.categoryIds.length
    || newLocation.value.subsectorId
    || newLocation.value.sector !== defaultSector
  )
}

const { confirmDiscard } = useUnsavedChanges(() => (
  hasUnsubmittedCategory() ||
  hasUnsubmittedSubtype() ||
  hasUnsubmittedLocation() ||
  Boolean(newOrigin.value.trim()) ||
  Boolean(selectedFile.value) ||
  subsectorDirty.value ||
  showEditLocationModal.value && JSON.stringify(editingLocation.value) !== editLocationInitial.value
))

async function changeTab(tab) {
  if (tab === activeTab.value || await confirmDiscard()) activeTab.value = tab
}

async function closeEditLocationModal() {
  if (await confirmDiscard()) showEditLocationModal.value = false
}

useModalFocus(() => showEditLocationModal.value, editLocationDialog, closeEditLocationModal)
useModalFocus(() => showEditCategoryModal.value, editCategoryDialog, () => { showEditCategoryModal.value = false })

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
const importPreview = ref(null)
const templateSector = computed({
  get: () => settingsPersisted.filters.value.templateSector || 'CORTE',
  set: value => { settingsPersisted.filters.value.templateSector = value || 'CORTE' },
})
const importSector = ref(authStore.user?.assignedSector || 'CORTE')
const preFabricadoCategoryNames = computed(() => {
  const names = categories.value
    .filter(category => categoryAppliesToSector(category, 'PRE_FABRICADO'))
    .map(category => category.name)
  return names.length ? names.join(', ') : 'nenhuma categoria cadastrada'
})

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
        { name: 'subsetor', req: false, desc: 'Subsetor ativo do mesmo setor. Deixe vazio para manter o fluxo atual sem subsetor.' },
      ],
      headerExample: 'codigo;descricao;categoria;unidade;quantidade;prateleira;subsetor',
      examples: [
        '1001;TECIDO SINTETICO PRETO 1.4MM;TECIDO;m²;150.0;A-01;',
        '1002;FORRO TESPONTADO AZUL;FORRO;m;80.0;A-02;',
        '1003;COURO LEGITIMO CASTANHO;COURO;m²;45.5;B-01;',
        '1004;LINHA DE COSTURA REFORCADA;LINHA;rolo;20.0;C-01;',
      ],
    }
  }

  if (sec === 'APOIO') {
    return {
      title: 'Padrão Exigido para o Arquivo CSV — Peças Cortadas e Cabedal',
      columns: [
        { name: 'sku', req: true, desc: 'Código / SKU ou Molde da peça. Ex: MOL-001' },
        { name: 'modelo', req: true, desc: 'Linha ou Modelo de calçado. Ex: RACER SPEEDZONE' },
        { name: 'peca', req: true, desc: 'Nome / Descrição da peça avulsa. Ex: GASPEA LATERAL' },
        { name: 'tipo', req: false, desc: 'Categoria configurada. Para cabedal, use uma categoria classificada como Cabedal.' },
        { name: 'material_cor', req: false, desc: 'Material da peça cortada ou combinação do cabedal (aceita também combinacao ou cor).' },
        { name: 'grade', req: false, desc: 'Grade/numeração quando aplicável. Ex: 40' },
        { name: 'lado', req: false, desc: 'Obrigatório para Cabedal: E (esquerdo), D (direito) ou PAR. Ignorado para peça cortada.' },
        { name: 'quantidade', req: false, desc: 'Quantidade de peças no estoque. Ex: 50 (Padrão: 0)' },
        { name: 'prateleira', req: false, desc: 'Localização ou box em Peças Cortadas. Ex: AP-01' },
        { name: 'subsetor', req: false, desc: 'Subsetor ativo de Peças Cortadas. Deixe vazio para manter o fluxo atual sem subsetor.' },
      ],
      headerExample: 'sku;modelo;peca;tipo;material_cor;grade;lado;quantidade;prateleira;subsetor',
      examples: [
        'MOL-001;RACER SPEEDZONE;GASPEA LATERAL;PEÇAS CORTADAS;SINTETICO PRETO;40;;50;AP-01;',
        'CAB-001;RACER SPEEDZONE;CABEDAL;CABEDAL;PRETO/BRANCO;40;PAR;8;AP-04;',
        'CAB-002;AIR MAX SC;CABEDAL;CABEDAL;BRANCO/PRETO;39;E;12;AP-05;',
      ],
    }
  }

  if (sec === 'PRE_FABRICADO') {
    return {
      title: 'Padrão Exigido para o Arquivo CSV — PRÉ-FABRICADO (Solas)',
      columns: [
        { name: 'sku', req: true, desc: 'SKU ou código do produto. Ex: SKU-SOLA-001' },
        { name: 'modelo', req: true, desc: 'Nome do modelo / Linha. Ex: RACER SPEEDZONE' },
        { name: 'peca', req: true, desc: 'Descrição do solado. Ex: SOLA RACER SPEEDZONE' },
        { name: 'tipo', req: true, desc: `Categoria configurada para Pré-Fabricado (aceita também categoria). Valores disponíveis: ${preFabricadoCategoryNames.value}.` },
        { name: 'combinacao', req: false, desc: 'Cor ou combinação do solado (também aceita cor ou material_cor). Ex: PRETO' },
        { name: 'grade', req: true, desc: 'Grade / Numeração do solado. Ex: 39/40, 41' },
        { name: 'lado', req: false, desc: 'Lado do pé: E (Esquerdo), D (Direito) ou PAR.' },
        { name: 'quantidade', req: false, desc: 'Quantidade de peças / pares. Ex: 20 (Padrão: 0)' },
        { name: 'prateleira', req: false, desc: 'Localização ou box. Ex: PR-01' },
        { name: 'subsetor', req: false, desc: 'Subsetor ativo de Pré-Fabricado. Deixe vazio para manter o fluxo atual sem subsetor.' },
      ],
      headerExample: 'sku;modelo;peca;tipo;combinacao;grade;lado;quantidade;prateleira;subsetor',
      examples: [
        'SKU-SOLA-RACER;RACER SPEEDZONE;SOLA RACER SPEEDZONE;EVA;PRETO;41;PAR;20;PR-01;',
        'SKU-SOLA-AIRMAX;AIR MAX SC;SOLA AIR MAX;BORRACHA;BRANCO;40;E;15;PR-02;',
      ],
    }
  }

  if (sec === 'DISTRIBUICAO' || sec === 'EXPEDICAO' || sec === 'MONTAGEM') {
    const secLabel = (sec === 'DISTRIBUICAO' || sec === 'EXPEDICAO') ? 'DISTRIBUIÇÃO' : 'MONTAGEM (Pés Órfãos)'
    const pecaEx = (sec === 'DISTRIBUICAO' || sec === 'EXPEDICAO') ? 'CABEDAL AIR MAX' : 'PE MONTADO CORTEZ'
    return {
      title: `Padrão Exigido para o Arquivo CSV — ${secLabel}`,
      columns: [
        { name: 'sku', req: true, desc: 'SKU ou código do produto (aceita sku ou codigo). Ex: SKU-RACER-SPD-BLK' },
        { name: 'modelo', req: true, desc: 'Nome do modelo / Linha. Ex: RACER SPEEDZONE' },
        { name: 'peca', req: false, desc: `Componente do calçado. Ex: ${pecaEx}` },
        { name: 'combinacao', req: false, desc: 'Cor ou combinação do produto (o importador também aceita cor ou material_cor). Ex: PRETO, BRANCO' },
        { name: 'grade', req: true, desc: 'Grade / Numeração do calçado. Ex: 39/40, 41, 7,5' },
        { name: 'lado', req: true, desc: 'Lado do pé: E (Esquerdo), D (Direito) ou PAR (desmembrado e consolidado automaticamente com pés avulsos e locais)' },
        { name: 'quantidade', req: false, desc: 'Quantidade de peças / pares. Ex: 20 (Padrão: 0)' },
        { name: 'prateleira', req: false, desc: 'Localização ou box. Ex: PR-01, ESTANTE 1 - NIVEL 3' },
        { name: 'subsetor', req: false, desc: `Subsetor ativo de ${secLabel}. Deixe vazio para manter o fluxo atual sem subsetor.` },
      ],
      headerExample: 'sku;modelo;peca;combinacao;grade;lado;quantidade;prateleira;subsetor',
      examples: [
        `SKU-RACER-SPD-BLK;RACER SPEEDZONE;${pecaEx};PRETO;41;PAR;20;PR-01;`,
        `SKU-RACER-SPD-BLK;RACER SPEEDZONE;${pecaEx};BRANCO;40;E;15;MO-02;`,
        `SKU-AIRMAX-WHT;AIR MAX SC;${pecaEx};PRETO;38;D;10;MO-03;`,
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
watch(importSector, () => { importPreview.value = null })

function downloadCSVTemplate(targetSector = templateSector.value || 'CORTE') {
  templateSector.value = targetSector
  const pat = sectorCsvPattern.value
  const content = `${pat.headerExample}\n${pat.examples.join('\n')}\n`
  const sectorSlug = formatSectorName(targetSector, targetSector)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  const fileName = `modelo_importacao_${sectorSlug}.csv`

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
    importPreview.value = null
  }
  event.target.value = null // reset input
}

function handleDrop(event) {
  const file = event.dataTransfer.files[0]
  if (file && file.name.endsWith('.csv')) {
    selectedFile.value = file
    importResult.value = null
    importPreview.value = null
  } else {
    showNotification('error', 'Apenas arquivos .csv são aceitos.')
  }
}

function importFormData() {
  const formData = new FormData()
  formData.append('arquivo', selectedFile.value)
  formData.append('sector', importSector.value)
  return formData
}

function importFailure(error) {
  const msg = error.response?.data?.error || 'Erro ao importar a planilha.'
  importResult.value = { error: msg, errors: error.response?.data?.errors || [], totalErrors: error.response?.data?.totalErrors }
  showNotification('error', msg)
}

async function previewCSV() {
  if (!selectedFile.value) return
  importing.value = true
  importResult.value = null
  try {
    const res = await api.post('/import/csv/preview', importFormData())
    importPreview.value = res.data
  } catch (error) {
    importFailure(error)
  } finally {
    importing.value = false
  }
}

async function importCSV() {
  if (!selectedFile.value) return
  importing.value = true
  importResult.value = null

  try {
    const res = await api.post('/import/csv', importFormData())
    importResult.value = res.data
    showNotification('success', `${res.data.inseridos} itens importados com sucesso!`)
    selectedFile.value = null
    importPreview.value = null
  } catch (e) {
    importPreview.value = null
    importFailure(e)
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
  await Promise.all([fetchCategories(), fetchComponentSubtypes(), fetchUnits(), fetchLocations(), fetchOrigins(), fetchSubsectors()])
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
