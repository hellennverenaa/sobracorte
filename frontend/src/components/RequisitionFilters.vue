<template>
  <div class="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-4 items-end">
    <div class="w-full md:w-1/4">
      <label for="requisition-status" class="block text-xs font-bold text-slate-500 uppercase mb-1">Status</label>
      <select id="requisition-status" :value="status" @change="$emit('update:status', $event.target.value); $emit('change')"
        class="w-full border border-slate-200 p-2 rounded-xl outline-none focus:border-indigo-500 bg-white text-xs font-medium">
        <option value="">Todos os Status</option>
        <option value="PENDENTE">Pendente</option>
        <option value="ATENDIDA_TOTAL">Atendida Total</option>
        <option value="ATENDIDA_PARCIAL">Atendida Parcial</option>
        <option value="CANCELADA">Cancelada</option>
      </select>
    </div>

    <div class="w-full md:w-1/4">
      <label for="requisition-sector" class="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center justify-between">
        <span>Setor Solicitante</span>
        <span v-if="sectorLocked" class="text-[10px] text-indigo-600 font-semibold lowercase">(fixo ao seu setor)</span>
      </label>
      <select id="requisition-sector" :value="sector" @change="$emit('update:sector', $event.target.value); $emit('change')"
        :disabled="sectorLocked"
        class="w-full border border-slate-200 p-2 rounded-xl outline-none focus:border-indigo-500 bg-white text-xs font-medium disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed">
        <option v-if="!sectorLocked" value="">Todos os Setores</option>
        <option value="CORTE">Corte</option>
        <option value="APOIO">Apoio</option>
        <option value="PRE_FABRICADO">Pré-Fabricado</option>
        <option value="DISTRIBUICAO">Distribuição</option>
        <option value="MONTAGEM">Montagem</option>
      </select>
    </div>

    <div class="w-full md:w-2/4">
      <label for="requisition-search" class="block text-xs font-bold text-slate-500 uppercase mb-1">Buscar por Código, SKU, Modelo ou Solicitante</label>
      <div class="flex gap-2">
        <div class="relative flex-1">
          <input id="requisition-search" :value="search" @input="$emit('update:search', $event.target.value)" @keydown.enter="$emit('search')"
            type="text" placeholder="Ex: REQ-2026, SKU, Pegasus, Gáspea..."
            class="w-full border border-slate-200 py-2 pl-3 pr-8 rounded-xl outline-none focus:border-indigo-500 text-xs uppercase bg-white" />
          <button v-if="search" type="button" @click="$emit('clear-search')" class="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600" title="Limpar busca" aria-label="Limpar busca">
            <X class="w-3.5 h-3.5" />
          </button>
        </div>
        <button type="button" @click="$emit('search')" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition-colors">
          <Search class="w-3.5 h-3.5" />
          <span>Buscar</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { Search, X } from 'lucide-vue-next'

defineProps({
  status: { type: String, default: '' },
  sector: { type: String, default: '' },
  search: { type: String, default: '' },
  sectorLocked: { type: Boolean, default: false },
})

defineEmits(['update:status', 'update:sector', 'update:search', 'change', 'search', 'clear-search'])
</script>
