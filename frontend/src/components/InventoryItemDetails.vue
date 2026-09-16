<script setup>
import { ref } from 'vue';
import { formatNumber } from '@/utils/format';
import { useModalFocus } from '@/composables/useModalFocus';
const props = defineProps({ item: Object, unit: String });
const emit = defineEmits(['close']);
const detailDialog = ref(null);
useModalFocus(() => Boolean(props.item), detailDialog, () => emit('close'));
</script>

<template>
      <div v-if="item" class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
        <div ref="detailDialog" role="dialog" aria-modal="true" aria-label="Detalhes do item de estoque" tabindex="-1" class="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
          <div class="bg-gray-50 px-6 py-4 border-b flex justify-between items-center">
            <h3 class="font-bold text-gray-800">Detalhes do Item de Estoque</h3>
            <button @click="emit('close')" aria-label="Fechar detalhes" class="text-gray-400 hover:text-gray-600 font-bold text-xl">
              &times;
            </button>
          </div>
          <div class="p-6 space-y-3 text-sm">
            <div class="flex justify-center mb-2">
              <span class="bg-blue-100 text-blue-800 px-3 py-1 rounded text-base font-mono font-bold border border-blue-200">
                {{ item.code || item.pieceCode || item.sku || item.productName }}
              </span>
            </div>

            <div>
              <label class="block text-xs font-bold text-gray-500 uppercase">Setor</label>
              <div class="text-gray-900 font-bold">{{ item.sector }}</div>
            </div>

            <div v-if="item.name || item.description">
              <label class="block text-xs font-bold text-gray-500 uppercase">Descrição</label>
              <div class="text-gray-900 font-medium">{{ item.name || item.description }}</div>
            </div>

            <div v-if="item.sector === 'PRE_FABRICADO' || item.sector === 'DISTRIBUICAO' || item.type">
              <label class="block text-xs font-bold text-gray-500 uppercase">
                {{ item.sector === 'DISTRIBUICAO' ? 'Tipo de Material' : 'Material do Solado' }}
              </label>
              <div class="text-gray-900 font-bold">
                <template v-if="item.sector === 'DISTRIBUICAO'">
                  {{ item.type === 'SOLA_PROCESSADA' ? 'Sola Processada' : 'Cabedal' }}
                </template>
                <template v-else>
                  {{ item.type === 'BORRACHA' ? 'Borracha' : (item.type === 'EVA' ? 'EVA (Sola Não Processada)' : (item.type || '-')) }}
                </template>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-bold text-gray-500 uppercase">Saldo em Estoque</label>
                <div class="text-gray-900 font-bold">{{ formatNumber(item.quantity) }} {{ unit }}</div>
              </div>
              <div>
                <label class="block text-xs font-bold text-gray-500 uppercase">Prateleiras / Box</label>
                <div class="text-gray-900 font-bold">{{ item.locationDisplay }}</div>
              </div>
            </div>

            <div v-if="item.color">
              <label class="block text-xs font-bold text-gray-500 uppercase">Combinação / Cor</label>
              <div class="text-gray-900 font-bold">{{ item.color }}</div>
            </div>

            <div v-if="item.sizeGrade" class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-bold text-gray-500 uppercase">Grade</label>
                <div class="text-gray-900 font-bold">{{ item.sizeGrade }}</div>
              </div>
              <div v-if="item.footSide">
                <label class="block text-xs font-bold text-gray-500 uppercase">Lado do Pé</label>
                <div class="text-gray-900 font-bold">{{ item.footSide === 'E' ? 'Esquerdo (E)' : 'Direito (D)' }}</div>
              </div>
            </div>

            <div v-if="item.observation">
              <label class="block text-xs font-bold text-gray-500 uppercase">Observações</label>
              <div class="text-gray-700 bg-gray-50 p-2 rounded text-xs">{{ item.observation }}</div>
            </div>
          </div>
          <div class="bg-gray-50 px-6 py-3 border-t flex justify-end">
            <button @click="emit('close')" class="bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium px-4 py-2 rounded text-xs">
              Fechar
            </button>
          </div>
        </div>
      </div>
</template>
