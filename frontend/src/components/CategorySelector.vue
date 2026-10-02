<script setup lang="ts">
type CategoryOption = {
  id: number | string;
  name: string;
};

withDefaults(defineProps<{
  modelValue: string;
  categories: CategoryOption[];
  label: string;
  required?: boolean;
  emptyMessage?: string;
  helpText?: string;
}>(), {
  required: false,
  emptyMessage: '',
  helpText: '',
});

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void;
  (event: 'change'): void;
}>();

function handleChange(event: Event) {
  emit('update:modelValue', (event.target as HTMLSelectElement).value);
  emit('change');
}
</script>

<template>
  <div>
    <label class="block text-xs font-bold text-gray-500 uppercase mb-1">
      {{ label }}<span v-if="required"> *</span>
    </label>
    <select
      :value="modelValue"
      @change="handleChange"
      :aria-required="required"
      class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white text-sm"
    >
      <option value="" :disabled="required">
        {{ required ? 'Selecione uma categoria...' : 'Sem categoria' }}
      </option>
      <option v-for="category in categories" :key="category.id" :value="String(category.id)">
        {{ category.name }}
      </option>
    </select>
    <span v-if="categories.length === 0 && emptyMessage" class="text-[10px] text-amber-700 mt-1 block">
      {{ emptyMessage }}
    </span>
    <span v-else-if="helpText" class="text-[10px] text-gray-400 mt-1 block">
      {{ helpText }}
    </span>
  </div>
</template>
