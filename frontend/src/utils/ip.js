// --- IP DO SERVIDOR DE PRODUÇÃO (DASS) ---
// Deixe comentado para quando o desenvolvedor for subir para a fábrica:
// const baseApi = "http://10.100.1.43:2399/api"
// export const authApi = `${baseApi}/auth/login`
// export const api = `${baseApi}/sobracorte`


// --- IP DO SEU NOTEBOOK (LOCAL) ---
// O seu Node.js local roda na porta 3333 e não tem a pasta /api/sobracorte
export const ip = import.meta.env.VITE_BASE_API || "http://localhost"