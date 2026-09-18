<script setup>
import { useRouter } from 'vue-router'
import { Clock3, LogOut, ShieldCheck } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()
const router = useRouter()

async function logout() {
  try {
    await authStore.logout()
  } finally {
    await router.replace('/login')
  }
}
</script>

<template>
  <main class="min-h-screen bg-slate-100 px-4 py-10 flex items-center justify-center">
    <section class="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl sm:p-12">
      <div class="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
        <Clock3 class="h-8 w-8" />
      </div>

      <p class="mb-2 text-xs font-black uppercase tracking-[0.2em] text-indigo-600">Acesso pendente</p>
      <h1 class="text-3xl font-black text-slate-900">Seu setor ainda não foi atribuído</h1>
      <p class="mt-4 leading-relaxed text-slate-600">
        Sua identidade foi reconhecida, mas um administrador do SobraCorte precisa atribuir seu setor antes que os dados de estoque sejam liberados.
      </p>

      <div class="mt-7 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-left">
        <div class="flex gap-3">
          <ShieldCheck class="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" />
          <div>
            <p class="font-bold text-slate-800">Nenhum acesso ao estoque foi concedido</p>
            <p class="mt-1 text-sm text-slate-500">
              Solicite ao administrador da unidade {{ authStore.user?.unit?.code || '' }} a configuração do seu perfil e setor.
            </p>
          </div>
        </div>
      </div>

      <p class="mt-6 text-sm text-slate-500">
        Usuário: <strong class="text-slate-700">{{ authStore.user?.nome || authStore.user?.usuario }}</strong>
      </p>

      <button
        type="button"
        class="mt-8 inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 py-3 text-sm font-bold text-white transition hover:bg-slate-800"
        @click="logout"
      >
        <LogOut class="h-4 w-4" />
        Sair
      </button>
    </section>
  </main>
</template>
