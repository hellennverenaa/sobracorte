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

      <!-- Notificação Toast -->
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

      <!-- Tabs -->
      <div class="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6 w-fit flex-wrap">
        <button v-for="tab in tabs" :key="tab.key"
          @click="activeTab = tab.key"
          class="px-5 py-2 rounded-lg text-sm font-bold transition-all"
          :class="activeTab === tab.key
            ? 'bg-white text-indigo-700 shadow-sm'
            : 'text-gray-500 hover:text-gray-700'">
          <component :is="tab.icon" class="w-4 h-4 inline mr-1.5 -mt-0.5" />
          {{ tab.label }}
        </button>
      </div>

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
              
              <div class="w-64 min-w-[180px]">
                <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Unidade Padrão</label>
                <select v-model="newCategory.defaultUnitId"
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-400 bg-white font-medium">
                  <option value="">Nenhuma (Livre para escolha)</option>
                  <option v-for="unit in units" :key="unit.id" :value="unit.id">
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

          <!-- Lista -->
          <div v-if="loadingCategory" class="p-8 text-center text-gray-400">Carregando...</div>
          <table v-else class="w-full text-left">
            <thead class="bg-gray-50 text-xs font-bold text-gray-400 uppercase tracking-wider">
              <tr>
                <th class="px-6 py-3">Nome</th>
                <th class="px-6 py-3 text-center">Unidade Padrão</th>
                <th class="px-6 py-3 text-center">Regra de Trava</th>
                <th v-if="canManageSettings" class="px-6 py-3 text-center">Ação</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              <tr v-for="cat in categories" :key="cat.id" class="hover:bg-gray-50/50 transition-colors">
                <td class="px-6 py-3 font-bold text-gray-800 font-mono text-sm">{{ cat.name }}</td>
                <td class="px-6 py-3 text-center">
                  <span v-if="cat.defaultUnit" class="px-2.5 py-0.5 rounded-full text-xs font-bold border bg-indigo-50 text-indigo-700 border-indigo-100">
                    {{ cat.defaultUnit.name }} ({{ cat.defaultUnit.symbol }})
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
              <tr v-if="categories.length === 0">
                <td :colspan="canManageSettings ? 4 : 3" class="px-6 py-8 text-center text-gray-400 text-sm italic">Nenhuma categoria cadastrada.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ABA 2: UNIDADES DE MEDIDA                 -->
      <div v-if="activeTab === 'units'" class="space-y-6">
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div class="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
            <h2 class="font-bold text-gray-800 flex items-center gap-2">
              <Ruler class="w-4 h-4 text-purple-500" /> Unidades de Medida
            </h2>
            <span class="text-xs text-purple-600 bg-purple-50 px-2.5 py-1 rounded-full font-bold">100% Dinâmico via API</span>
          </div>

          <!-- Formulário de adição de Unidade (Oculto para perfil leitor) -->
          <div v-if="canManageSettings" class="px-6 py-4 border-b border-gray-100 bg-purple-50/30">
            <form @submit.prevent="addUnit" class="flex gap-3 items-end flex-wrap">
              <div class="flex-1 min-w-[200px]">
                <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Nome da Unidade</label>
                <input v-model="newUnit.name" required placeholder="Ex: Metro Quadrado, Litro, Caixa..."
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-purple-400 bg-white" />
              </div>
              <div class="w-48 min-w-[140px]">
                <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Sigla / Símbolo</label>
                <input v-model="newUnit.symbol" required placeholder="Ex: m², l, cx, un..."
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-purple-400 bg-white font-mono" />
              </div>
              <button type="submit" :disabled="loadingUnit"
                class="px-4 py-2 bg-purple-600 text-white rounded-lg font-bold text-sm hover:bg-purple-700 transition flex items-center gap-2 disabled:opacity-50">
                <Plus class="w-4 h-4" /> Adicionar Unidade
              </button>
            </form>
          </div>

          <!-- Lista de Unidades -->
          <div v-if="loadingUnit" class="p-8 text-center text-gray-400">Carregando...</div>
          <table v-else class="w-full text-left">
            <thead class="bg-gray-50 text-xs font-bold text-gray-400 uppercase tracking-wider">
              <tr>
                <th class="px-6 py-3">Nome da Unidade</th>
                <th class="px-6 py-3 text-center">Sigla / Símbolo</th>
                <th class="px-6 py-3 text-center">Status</th>
                <th v-if="canManageSettings" class="px-6 py-3 text-center">Ação</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              <tr v-for="unit in units" :key="unit.id" class="hover:bg-gray-50/50 transition-colors">
                <td class="px-6 py-3 text-sm text-gray-800 font-medium">{{ unit.name }}</td>
                <td class="px-6 py-3 text-center">
                  <span class="px-2.5 py-1 rounded-md text-xs font-bold font-mono bg-purple-50 text-purple-700 border border-purple-100">
                    {{ unit.symbol }}
                  </span>
                </td>
                <td class="px-6 py-3 text-center">
                  <span class="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                    Ativa
                  </span>
                </td>
                <td v-if="canManageSettings" class="px-6 py-3 text-center">
                  <button @click="deleteUnit(unit)"
                    class="text-gray-300 hover:text-red-500 transition-colors p-1 rounded hover:bg-red-50" title="Desativar unidade">
                    <Trash2 class="w-4 h-4" />
                  </button>
                </td>
              </tr>
              <tr v-if="units.length === 0">
                <td :colspan="canManageSettings ? 4 : 3" class="px-6 py-8 text-center text-gray-400 text-sm italic">Nenhuma unidade de medida cadastrada.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ABA 3: LOCALIZAÇÕES                       -->
      <div v-if="activeTab === 'locations'" class="space-y-6">
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div class="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
            <h2 class="font-bold text-gray-800 flex items-center gap-2">
              <MapPin class="w-4 h-4 text-emerald-500" /> Localizações de Armazenamento
            </h2>
            <span class="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">vínculo multi-categoria</span>
          </div>
          
          <!-- Formulário de adição de Localização (Oculto para perfil leitor) -->
          <div v-if="canManageSettings" class="px-6 py-4 border-b border-gray-100 bg-emerald-50/30">
            <form @submit.prevent="addLocation" class="space-y-3">
              <div class="flex gap-3 items-end flex-wrap">
                <div class="flex-1 min-w-[200px]">
                  <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Nome da Localização</label>
                  <input v-model="newLocation.name" required placeholder="Ex: Rua 03 - Caixote 58 - Nível 01"
                    class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-400 bg-white" />
                </div>
                <button type="submit" :disabled="loadingLocation || newLocation.categoryIds.length === 0"
                  class="px-4 py-2 bg-emerald-600 text-white rounded-lg font-bold text-sm hover:bg-emerald-700 transition flex items-center gap-2 disabled:opacity-50 h-10">
                  <Plus class="w-4 h-4" /> Adicionar Localização
                </button>
              </div>

              <div>
                <label class="block text-xs font-bold text-gray-500 uppercase mb-1.5">
                  Categorias Permitidas nesta Prateleira (Selecione uma ou mais)
                </label>
                <div class="flex flex-wrap gap-2">
                  <button
                    v-for="cat in categories"
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
                <p v-if="newLocation.categoryIds.length === 0" class="text-[11px] text-amber-600 font-semibold mt-1">
                  Selecione ao menos 1 categoria para vincular à prateleira.
                </p>
              </div>
            </form>
          </div>

          <div v-if="loadingLocation" class="p-8 text-center text-gray-400">Carregando...</div>
          <table v-else class="w-full text-left">
            <thead class="bg-gray-50 text-xs font-bold text-gray-400 uppercase tracking-wider">
              <tr>
                <th class="px-6 py-3">Nome da Localização</th>
                <th class="px-6 py-3 text-center">Categorias Permitidas</th>
                <th v-if="canManageSettings" class="px-6 py-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              <tr v-for="loc in locations" :key="loc.id" class="hover:bg-gray-50/50 transition-colors">
                <td class="px-6 py-3 text-sm text-gray-700 font-medium">{{ loc.name }}</td>
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
                    <span v-else class="text-xs text-gray-400 italic">Não vinculada</span>
                  </div>
                </td>
                <td v-if="canManageSettings" class="px-6 py-3 text-center">
                  <div class="flex items-center justify-center gap-2">
                    <button
                      @click="openEditLocationModal(loc)"
                      class="text-gray-400 hover:text-blue-600 transition-colors p-1 rounded hover:bg-blue-50"
                      title="Editar Categorias"
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
                <td :colspan="canManageSettings ? 3 : 2" class="px-6 py-8 text-center text-gray-400 text-sm italic">Nenhuma localização cadastrada.</td>
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
            <form @submit.prevent="addOrigin" class="flex gap-3 items-end">
              <div class="flex-1">
                <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Nome da Origem</label>
                <input v-model="newOrigin" required placeholder="Ex: Devolução de Produção"
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-amber-400 bg-white" />
              </div>
              <button type="submit" :disabled="loadingOrigin"
                class="px-4 py-2 bg-amber-500 text-white rounded-lg font-bold text-sm hover:bg-amber-600 transition flex items-center gap-2 disabled:opacity-50">
                <Plus class="w-4 h-4" /> Adicionar
              </button>
            </form>
          </div>
          <div v-if="loadingOrigin" class="p-8 text-center text-gray-400">Carregando...</div>
          <table v-else class="w-full text-left">
            <thead class="bg-gray-50 text-xs font-bold text-gray-400 uppercase tracking-wider">
              <tr>
                <th class="px-6 py-3">Descrição da Origem</th>
                <th v-if="canManageSettings" class="px-6 py-3 text-center">Ação</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              <tr v-for="orig in origins" :key="orig.id" class="hover:bg-gray-50/50 transition-colors">
                <td class="px-6 py-3 text-sm text-gray-700 font-medium">{{ orig.name }}</td>
                <td v-if="canManageSettings" class="px-6 py-3 text-center">
                  <button @click="deleteOrigin(orig)"
                    class="text-gray-300 hover:text-red-500 transition-colors p-1 rounded hover:bg-red-50">
                    <Trash2 class="w-4 h-4" />
                  </button>
                </td>
              </tr>
              <tr v-if="origins.length === 0">
                <td :colspan="canManageSettings ? 2 : 1" class="px-6 py-8 text-center text-gray-400 text-sm italic">Nenhuma origem cadastrada.</td>
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
                <FileSpreadsheet class="w-5 h-5 text-blue-600" /> Importação de Materiais em Lote (CSV)
              </h2>
              <p class="text-sm text-gray-500 mt-0.5">
                Cadastre novos materiais em lote na base de dados do SobraCorte através de planilhas formatadas.
              </p>
            </div>
            
            <!-- Botão de Download do Modelo de Exemplo -->
            <button @click="downloadCSVTemplate"
              class="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md shadow-emerald-200 transition flex items-center gap-2 shrink-0 self-start md:self-auto cursor-pointer">
              <Download class="w-4 h-4" /> Baixar Modelo de Exemplo (.csv)
            </button>
          </div>

          <div class="p-6 space-y-6">

            <!-- CARD DE INSTRUÇÕES E FORMATO EXIGIDO (UX/UI VISUAL) -->
            <div class="bg-gradient-to-br from-slate-50 to-blue-50/40 border border-blue-100 rounded-2xl p-6 space-y-4">
              <div class="flex items-center gap-2 text-blue-900 font-bold text-sm">
                <HelpCircle class="w-4 h-4 text-blue-600" />
                <span>Padrão Exigido para o Arquivo CSV</span>
              </div>
              
              <p class="text-xs text-gray-600 leading-relaxed">
                Para garantir o processamento correto e evitar rejeição, seu arquivo <strong>.csv</strong> deve utilizar delimitador por <strong>ponto e vírgula (;)</strong> ou <strong>vírgula (,)</strong> e conter as colunas especificadas abaixo no cabeçalho (primeira linha):
              </p>

              <!-- Tabela de Colunas -->
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
                    <tr>
                      <td class="px-4 py-2.5 font-mono font-bold text-indigo-600">codigo</td>
                      <td class="px-4 py-2.5"><span class="bg-red-100 text-red-700 px-2 py-0.5 rounded text-[10px] font-bold">Obrigatório</span></td>
                      <td class="px-4 py-2.5">Código único do material. Ex: <code class="bg-gray-100 px-1 py-0.5 rounded font-mono">1001</code></td>
                    </tr>
                    <tr>
                      <td class="px-4 py-2.5 font-mono font-bold text-indigo-600">descricao</td>
                      <td class="px-4 py-2.5"><span class="bg-red-100 text-red-700 px-2 py-0.5 rounded text-[10px] font-bold">Obrigatório</span></td>
                      <td class="px-4 py-2.5">Descrição completa do material. Ex: <code class="bg-gray-100 px-1 py-0.5 rounded font-mono">TECIDO SINTETICO PRETO 1.4MM</code></td>
                    </tr>
                    <tr>
                      <td class="px-4 py-2.5 font-mono font-bold text-indigo-600">categoria</td>
                      <td class="px-4 py-2.5"><span class="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-[10px] font-bold">Opcional</span></td>
                      <td class="px-4 py-2.5">Nome da Categoria cadastrada. Ex: <code class="bg-gray-100 px-1 py-0.5 rounded font-mono">TECIDO</code> (Padrão: GERAL)</td>
                    </tr>
                    <tr>
                      <td class="px-4 py-2.5 font-mono font-bold text-indigo-600">unidade</td>
                      <td class="px-4 py-2.5"><span class="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-[10px] font-bold">Opcional</span></td>
                      <td class="px-4 py-2.5">Sigla da unidade de medida. Ex: <code class="bg-gray-100 px-1 py-0.5 rounded font-mono">m²</code>, <code class="bg-gray-100 px-1 py-0.5 rounded font-mono">kg</code>, <code class="bg-gray-100 px-1 py-0.5 rounded font-mono">un</code> (Padrão: UN)</td>
                    </tr>
                    <tr>
                      <td class="px-4 py-2.5 font-mono font-bold text-indigo-600">quantidade</td>
                      <td class="px-4 py-2.5"><span class="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-[10px] font-bold">Opcional</span></td>
                      <td class="px-4 py-2.5">Saldo inicial numérico. Ex: <code class="bg-gray-100 px-1 py-0.5 rounded font-mono">150.0</code> (Padrão: 0)</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <!-- Bloco de Exemplo Visual -->
              <div class="bg-slate-900 text-slate-200 rounded-xl p-4 text-xs font-mono overflow-x-auto shadow-inner">
                <div class="text-slate-400 text-[10px] mb-2 font-sans font-bold uppercase tracking-wider flex items-center justify-between">
                  <span>Exemplo de Arquivo CSV Válido</span>
                  <span>Codificação: UTF-8</span>
                </div>
                <code>codigo;descricao;categoria;unidade;quantidade</code><br />
                <code class="text-emerald-400">1001;TECIDO SINTETICO PRETO 1.4MM;TECIDO;m²;150.0</code><br />
                <code class="text-emerald-400">1002;FORRO TESPONTADO AZUL;FORRO;m;80.0</code><br />
                <code class="text-emerald-400">1003;COURO LEGITIMO CASTANHO;COURO;m²;45.5</code>
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
            <div v-if="selectedFile" class="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-center justify-between">
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

            <!-- Botão de Confirmação -->
            <button v-if="selectedFile" @click="importCSV" :disabled="importing"
              class="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm transition flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-blue-200 cursor-pointer">
              <span v-if="importing" class="animate-spin">⏳</span>
              <Upload v-else class="w-4 h-4" />
              {{ importing ? 'Processando e Validando Planilha...' : 'Confirmar Importação de Materiais' }}
            </button>

            <!-- Feedback Amigável de Erro ou Sucesso -->
            <div v-if="importResult" class="rounded-xl p-5 border font-medium text-sm transition-all"
              :class="importResult.error
                ? 'bg-red-50 border-red-200 text-red-800'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800'">
              <div class="flex items-start gap-3">
                <XCircle v-if="importResult.error" class="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                <CheckCircle v-else class="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
                
                <div class="space-y-1">
                  <p class="font-bold text-sm leading-snug">
                    {{ importResult.error ? 'Falha na Validação da Planilha' : importResult.message }}
                  </p>
                  
                  <p v-if="importResult.error" class="text-xs text-red-700 leading-relaxed">
                    {{ importResult.error }}
                  </p>
                  
                  <p v-else class="text-xs text-emerald-800">
                    <strong>{{ importResult.inseridos }}</strong> materiais cadastrados com sucesso · <strong>{{ importResult.ignorados }}</strong> ignorados (já existiam no banco) · <strong>{{ importResult.processados }}</strong> processados no total.
                  </p>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>

    </div>

    <!-- MODAL DE EDIÇÃO DE LOCALIZAÇÃO (MULTI-CATEGORIA) -->
    <div v-if="showEditLocationModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-gray-100">
        <div class="bg-gray-50 px-6 py-4 border-b flex justify-between items-center">
          <h3 class="font-bold text-gray-800 flex items-center gap-2">
            <MapPin class="w-4 h-4 text-emerald-600" />
            Editar Localização & Categorias
          </h3>
          <button @click="showEditLocationModal = false" class="text-gray-400 hover:text-gray-600 font-bold text-xl">
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
              class="w-full border border-gray-200 p-2.5 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-400 bg-white font-medium"
            />
          </div>

          <div>
            <label class="block font-bold text-gray-500 uppercase mb-1.5">
              Categorias Permitidas nesta Prateleira (Selecione uma ou mais) *
            </label>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="cat in categories"
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
            <p v-if="editingLocation.categoryIds.length === 0" class="text-[11px] text-red-600 font-semibold mt-1">
              Selecione ao menos 1 categoria permitida.
            </p>
          </div>

          <div class="bg-gray-50 px-6 py-3 -mx-6 -mb-6 border-t flex justify-end gap-2 mt-6">
            <button
              type="button"
              @click="showEditLocationModal = false"
              class="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium rounded-lg text-xs"
            >
              Cancelar
            </button>
            <button
              type="submit"
              :disabled="editingLocation.categoryIds.length === 0"
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
import { ref, onMounted, computed } from 'vue'
import Layout from '@/components/Layout.vue'
import ConfirmModal from '@/components/ConfirmModal.vue'
import { api } from '@/services/httpClient'
import { useAuthStore } from '@/stores/auth'
import {
  Settings as SettingsIcon, Tag, MapPin, GitBranch, FileSpreadsheet, Ruler, Lock, Download, HelpCircle,
  Plus, Trash2, Upload, CheckCircle, XCircle, Pencil
} from 'lucide-vue-next'

const authStore = useAuthStore()

// --- PERMISSÕES ---
const canManageSettings = computed(() => authStore.user?.role === 'admin' || authStore.user?.role === 'lider')

// --- TABS DINÂMICAS POR PERFIL ---
const tabs = computed(() => {
  const base = [
    { key: 'categories', label: 'Categorias',        icon: Tag },
    { key: 'units',      label: 'Unidades de Medida', icon: Ruler },
    { key: 'locations',  label: 'Localizações',      icon: MapPin },
    { key: 'origins',    label: 'Origens',           icon: GitBranch },
  ]
  // Importação em lote exclusiva para administradores/líderes
  if (authStore.user?.role === 'admin' || authStore.user?.role === 'lider') {
    base.push({ key: 'import', label: 'Importar CSV', icon: FileSpreadsheet })
  }
  return base
})
const activeTab = ref('categories')

// --- NOTIFICAÇÕES ---
const notification = ref({ show: false, type: 'success', message: '' })
function showNotification(type, message) {
  notification.value = { show: true, type, message }
  setTimeout(() => { notification.value.show = false }, 3500)
}

// --- MODAL DE CONFIRMAÇÃO REUTILIZÁVEL ---
const confirmState = ref({
  show: false,
  title: '',
  message: '',
  confirmText: 'Excluir',
  variant: 'danger',
  loading: false,
  action: null
})

function openConfirmModal({ title, message, confirmText = 'Excluir', variant = 'danger', action }) {
  confirmState.value = {
    show: true,
    title,
    message,
    confirmText,
    variant,
    loading: false,
    action
  }
}

async function handleConfirmedAction() {
  if (typeof confirmState.value.action === 'function') {
    confirmState.value.loading = true
    try {
      await confirmState.value.action()
    } finally {
      confirmState.value.loading = false
      confirmState.value.show = false
    }
  }
}

// CATEGORIAS
const categories = ref([])
const loadingCategory = ref(false)
const newCategory = ref({ name: '', defaultUnitId: '', unitLocked: false })

async function fetchCategories() {
  loadingCategory.value = true
  try {
    const res = await api.get('/settings/categories')
    categories.value = res.data
  } catch (e) {
    showNotification('error', 'Erro ao carregar categorias.')
  } finally {
    loadingCategory.value = false
  }
}

async function addCategory() {
  if (!newCategory.value.name.trim()) return
  try {
    const res = await api.post('/settings/categories', {
      name: newCategory.value.name.trim(),
      defaultUnitId: newCategory.value.defaultUnitId ? Number(newCategory.value.defaultUnitId) : null,
      unitLocked: Boolean(newCategory.value.unitLocked)
    })
    showNotification('success', `Categoria "${newCategory.value.name}" criada com sucesso!`)
    newCategory.value = { name: '', defaultUnitId: '', unitLocked: false }
    if (res.data) categories.value.unshift(res.data)
    await fetchCategories()
  } catch (e) {
    const msg = e.response?.data?.error || 'Erro ao criar categoria.'
    showNotification('error', msg)
  }
}

async function deleteCategory(cat) {
  const isAdmin = authStore.userRole === 'admin' || authStore.isAdmin
  const title = isAdmin ? '⚠️ Atenção Admin: Excluir Categoria' : 'Excluir Categoria de Material'
  const message = isAdmin
    ? `Atenção Admin: A categoria "${cat.name}" possui ou pode possuir materiais vinculados. A exclusão forçada será registrada no Histórico & Auditoria. Deseja prosseguir?`
    : `Deseja excluir a categoria "${cat.name}"?`

  openConfirmModal({
    title,
    message,
    confirmText: isAdmin ? 'Confirmar Exclusão (Admin)' : 'Sim, Excluir Categoria',
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

// UNIDADES DE MEDIDA
const units = ref([])
const loadingUnit = ref(false)
const newUnit = ref({ name: '', symbol: '' })

async function fetchUnits() {
  loadingUnit.value = true
  try {
    const res = await api.get('/settings/units')
    units.value = res.data
  } catch (e) {
    showNotification('error', 'Erro ao carregar unidades de medida.')
  } finally {
    loadingUnit.value = false
  }
}

async function addUnit() {
  if (!newUnit.value.name.trim() || !newUnit.value.symbol.trim()) return
  try {
    const res = await api.post('/settings/units', {
      name: newUnit.value.name.trim(),
      symbol: newUnit.value.symbol.trim()
    })
    showNotification('success', `Unidade "${newUnit.value.name} (${newUnit.value.symbol})" cadastrada!`)
    newUnit.value = { name: '', symbol: '' }
    if (res.data) units.value.unshift(res.data)
    await fetchUnits()
  } catch (e) {
    const msg = e.response?.data?.error || 'Erro ao criar unidade de medida.'
    showNotification('error', msg)
  }
}

async function deleteUnit(unit) {
  const isAdmin = authStore.userRole === 'admin' || authStore.isAdmin
  const title = isAdmin ? '⚠️ Atenção Admin: Desativar Unidade' : 'Desativar Unidade de Medida'
  const message = isAdmin
    ? `Atenção Admin: A unidade "${unit.name} (${unit.symbol})" possui ou pode possuir materiais vinculados. A desativação forçada será registrada no Histórico & Auditoria. Deseja prosseguir?`
    : `Deseja desativar a unidade "${unit.name} (${unit.symbol})"?`

  openConfirmModal({
    title,
    message,
    confirmText: isAdmin ? 'Confirmar Desativação (Admin)' : 'Desativar Unidade',
    variant: 'danger',
    action: async () => {
      try {
        await api.delete(`/settings/units/${unit.id}`)
        showNotification('success', `Unidade de medida desativada.`)
        await fetchUnits()
      } catch (e) {
        const msg = e.response?.data?.error || 'Erro ao desativar unidade.'
        showNotification('error', msg)
      }
    }
  })
}

// LOCALIZAÇÕES
const locations = ref([])
const loadingLocation = ref(false)
const newLocation = ref({ name: '', categoryIds: [] })
const showEditLocationModal = ref(false)
const editingLocation = ref({ id: 0, name: '', categoryIds: [] })

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
  editingLocation.value = {
    id: loc.id,
    name: loc.name,
    categoryIds: [...catIds]
  }
  showEditLocationModal.value = true
}

async function saveEditLocation() {
  if (!editingLocation.value.name.trim()) return
  if (editingLocation.value.categoryIds.length === 0) {
    return showNotification('error', 'Selecione ao menos uma categoria permitida.')
  }
  try {
    await api.put(`/settings/locations/${editingLocation.value.id}`, {
      name: editingLocation.value.name.trim(),
      categoryIds: editingLocation.value.categoryIds
    })
    showNotification('success', `Localização "${editingLocation.value.name}" atualizada com sucesso!`)
    showEditLocationModal.value = false
    await fetchLocations()
  } catch (e) {
    const msg = e.response?.data?.error || 'Erro ao atualizar localização.'
    showNotification('error', msg)
  }
}

async function fetchLocations() {
  loadingLocation.value = true
  try {
    const res = await api.get('/settings/locations')
    locations.value = res.data
  } catch (e) {
    showNotification('error', 'Erro ao carregar localizações.')
  } finally {
    loadingLocation.value = false
  }
}

async function addLocation() {
  if (!newLocation.value.name.trim()) return
  if (newLocation.value.categoryIds.length === 0) {
    return showNotification('error', 'Selecione ao menos uma categoria permitida.')
  }
  try {
    const res = await api.post('/settings/locations', {
      name: newLocation.value.name.trim(),
      categoryIds: newLocation.value.categoryIds
    })
    showNotification('success', `Localização "${newLocation.value.name}" criada com sucesso!`)
    newLocation.value = { name: '', categoryIds: [] }
    if (res.data) locations.value.unshift(res.data)
    await fetchLocations()
  } catch (e) {
    const msg = e.response?.data?.error || 'Erro ao criar localização.'
    showNotification('error', msg)
  }
}

async function deleteLocation(loc) {
  const isAdmin = authStore.userRole === 'admin' || authStore.isAdmin
  const title = isAdmin ? '⚠️ Atenção Admin: Excluir Localização' : 'Excluir Localização'
  const message = isAdmin
    ? `Atenção Admin: A localização "${loc.name}" possui materiais vinculados. A exclusão forçada será registrada no Histórico & Auditoria. Deseja prosseguir?`
    : `Deseja excluir a localização "${loc.name}"?`

  openConfirmModal({
    title,
    message,
    confirmText: isAdmin ? 'Confirmar Exclusão (Admin)' : 'Excluir Localização',
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
const origins = ref([])
const loadingOrigin = ref(false)
const newOrigin = ref('')

async function fetchOrigins() {
  loadingOrigin.value = true
  try {
    const res = await api.get('/settings/origins')
    origins.value = res.data
  } catch (e) {
    showNotification('error', 'Erro ao carregar origens.')
  } finally {
    loadingOrigin.value = false
  }
}

async function addOrigin() {
  if (!newOrigin.value.trim()) return
  try {
    const res = await api.post('/settings/origins', { name: newOrigin.value.trim() })
    showNotification('success', `Origem "${newOrigin.value}" criada!`)
    newOrigin.value = ''
    if (res.data) origins.value.unshift(res.data)
    await fetchOrigins()
  } catch (e) {
    const msg = e.response?.data?.error || 'Erro ao criar origem.'
    showNotification('error', msg)
  }
}

async function deleteOrigin(orig) {
  const isAdmin = authStore.userRole === 'admin' || authStore.isAdmin
  const title = isAdmin ? '⚠️ Atenção Admin: Excluir Origem' : 'Excluir Origem de Sobra'
  const message = isAdmin
    ? `Atenção Admin: A origem "${orig.name}" possui movimentações vinculadas. A exclusão forçada será registrada no Histórico & Auditoria. Deseja prosseguir?`
    : `Deseja excluir a origem "${orig.name}"?`

  openConfirmModal({
    title,
    message,
    confirmText: isAdmin ? 'Confirmar Exclusão (Admin)' : 'Excluir Origem',
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

function downloadCSVTemplate() {
  const content = "codigo;descricao;categoria;unidade;quantidade\n" +
                  "1001;TECIDO SINTETICO PRETO 1.4MM;TECIDO;m²;150.0\n" +
                  "1002;FORRO TESPONTADO AZUL;FORRO;m;80.0\n" +
                  "1003;COURO LEGITIMO CASTANHO;COURO;m²;45.5\n" +
                  "1004;LINHA DE COSTURA REFORCADA;LINHA;rolo;20.0\n";
  
  // Adiciona BOM UTF-8 (\uFEFF) para garantir abertura sem caracteres estranhos no Excel
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', 'modelo_importacao_sobracorte.csv')
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
  showNotification('success', 'Modelo de exemplo baixado com sucesso!')
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

    const res = await api.post('/import/csv', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    importResult.value = res.data
    showNotification('success', `${res.data.inseridos} materiais importados com sucesso!`)
    selectedFile.value = null
  } catch (e) {
    const msg = e.response?.data?.error || 'Erro ao importar a planilha.'
    importResult.value = { error: msg }
    showNotification('error', msg)
  } finally {
    importing.value = false
  }
}

// INICIALIZAÇÃO
onMounted(async () => {
  await Promise.all([fetchCategories(), fetchUnits(), fetchLocations(), fetchOrigins()])
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
