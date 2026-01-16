import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './styles/globals.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

// Initialize auth on app start
import { useAuthStore } from './stores/auth'
const authStore = useAuthStore()
authStore.checkAuth()

app.mount('#app')
