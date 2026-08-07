<template>
  <transition name="modal-fade">
    <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <!-- Fundo escuro com vidro fosco (Glassmorphism Corporativo DASS) -->
      <div class="fixed inset-0 bg-slate-950/70 backdrop-blur-xs transition-opacity" @click="handleCancel"></div>

      <!-- Card do Modal -->
      <div class="relative bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden transform transition-all z-10 font-sans">
        
        <!-- Conteúdo do Modal -->
        <div class="p-6 flex items-start gap-4">
          <!-- Ícone distintivo por variante -->
          <div class="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-sm"
            :class="variantClasses.iconContainer">
            <component :is="variantIcon" class="w-6 h-6" :class="variantClasses.iconColor" />
          </div>

          <div class="flex-1 min-w-0">
            <h3 class="text-base font-bold text-slate-900 leading-snug mb-1">
              {{ title }}
            </h3>
            <p class="text-xs text-slate-500 leading-relaxed">
              {{ message }}
            </p>
          </div>

          <button @click="handleCancel" :disabled="loading"
            class="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-lg hover:bg-slate-100 -mr-1 -mt-1 disabled:opacity-50">
            <X class="w-4 h-4" />
          </button>
        </div>

        <!-- Rodapé de Ações -->
        <div class="px-6 py-4 bg-slate-50/80 border-t border-slate-100 flex items-center justify-end gap-3">
          <button @click="handleCancel" :disabled="loading" type="button"
            class="px-4 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-bold transition-all disabled:opacity-50 shadow-xs cursor-pointer">
            {{ cancelText }}
          </button>
          
          <button @click="handleConfirm" :disabled="loading" type="button"
            class="px-5 py-2 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2 disabled:opacity-50 cursor-pointer"
            :class="variantClasses.confirmBtn">
            <span v-if="loading" class="animate-spin text-xs">⏳</span>
            {{ loading ? 'Processando...' : confirmText }}
          </button>
        </div>

      </div>
    </div>
  </transition>
</template>

<script setup>
import { computed } from 'vue'
import { AlertOctagon, AlertTriangle, Info, X } from 'lucide-vue-next'

const props = defineProps({
  show: { type: Boolean, default: false },
  title: { type: String, default: 'Confirmar Ação' },
  message: { type: String, default: 'Deseja realmente prosseguir com esta ação?' },
  confirmText: { type: String, default: 'Confirmar' },
  cancelText: { type: String, default: 'Cancelar' },
  variant: { type: String, default: 'danger' }, // 'danger' | 'warning' | 'info'
  loading: { type: Boolean, default: false }
})

const emit = defineEmits(['confirm', 'cancel', 'update:show'])

const variantIcon = computed(() => {
  if (props.variant === 'warning') return AlertTriangle
  if (props.variant === 'info') return Info
  return AlertOctagon // danger
})

const variantClasses = computed(() => {
  if (props.variant === 'warning') {
    return {
      iconContainer: 'bg-amber-50 border border-amber-100 text-amber-600',
      iconColor: 'text-amber-600',
      confirmBtn: 'bg-amber-600 hover:bg-amber-700 shadow-amber-200'
    }
  }
  if (props.variant === 'info') {
    return {
      iconContainer: 'bg-indigo-50 border border-indigo-100 text-indigo-600',
      iconColor: 'text-indigo-600',
      confirmBtn: 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'
    }
  }
  // Default: danger
  return {
    iconContainer: 'bg-red-50 border border-red-100 text-red-600',
    iconColor: 'text-red-600',
    confirmBtn: 'bg-red-600 hover:bg-red-700 shadow-red-200'
  }
})

function handleConfirm() {
  emit('confirm')
}

function handleCancel() {
  emit('cancel')
  emit('update:show', false)
}
</script>

<style scoped>
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
  transform: scale(0.96);
}
</style>
