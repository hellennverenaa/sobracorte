import { AxiosInstance } from "axios";

type QueueItem = {
  resolve: () => void;
  reject: () => void
}

export function attachInterceptors(api: AxiosInstance, apiAuth: AxiosInstance) {
  let isRefreshing: boolean = false;
  let queue: QueueItem[] = [];

  const enqueue = () => {
    return new Promise<void>((resolve, reject) => queue.push({ resolve, reject }));
  }

  const handle401 = async (error: any, instance: AxiosInstance, authInstance: AxiosInstance) => {
    const originalRequest = error?.config

    if (
      originalRequest.url?.includes("/auth/login") ||
      originalRequest.url?.includes("/auth/token/refresh")
    ) {
      return Promise.reject(error);
    }

    if (error.response?.status !== 401 || originalRequest?._retry || !originalRequest) throw error
    if (!originalRequest) {
      alert("Erro na solicitação, contate a equipe de suporte.")
      return Promise.reject();
    }

    originalRequest._retry = true;

    // Verifica se já existe refresh em andamento
    if (isRefreshing) {
      await enqueue(); // Espera concluir
      return instance(originalRequest); // Repete requisição
    }

    isRefreshing = true;
    try {
      const response = await authInstance.post("/auth/token/refresh", null, {
        withCredentials: true,
      });
      sessionStorage.setItem(
        "expirationTime",
        response.data.tokenExpirationTime
      );

      queue.forEach((p) => p.resolve());
      queue = [];

      return instance(originalRequest); // Repete requisição pendente
    } catch (refreshError: any) {

      queue.forEach((p) => p.reject());
      queue = [];

      if (refreshError.response?.status === 401 || refreshError.response?.status === 403) {
        console.error("Sessão expirada. Você precisa fazer login novamente:", refreshError);

        setTimeout(() => {
          localStorage.clear();
          window.location.href = "/login";
        }, 3000);
      } else {
        console.error("Erro temporário no refresh de token:", refreshError);
      }

      throw refreshError;
    } finally {
      isRefreshing = false;
    }
  }

  // Intercepta as instâncias
  api.interceptors.response.use(
    (res) => res,
    (err) => handle401(err, api, apiAuth)
  );
}