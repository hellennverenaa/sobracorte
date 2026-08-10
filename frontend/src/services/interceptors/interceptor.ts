import { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from "axios";

type QueueItem = {
  resolve: () => void;
  reject: (reason: unknown) => void
}

type RetryableRequestConfig = InternalAxiosRequestConfig & { _retry?: boolean };

export function attachInterceptors(api: AxiosInstance, apiAuth: AxiosInstance) {
  let isRefreshing: boolean = false;
  let queue: QueueItem[] = [];

  const enqueue = () => {
    return new Promise<void>((resolve, reject) => queue.push({ resolve, reject }));
  }

  // Requests diretas ao backend local precisam do access token no cabeçalho.
  api.interceptors.request.use((config) => {
    const userStr = localStorage.getItem("user");
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        if (user.token && !config.headers.Authorization) {
          config.headers.Authorization = `Bearer ${user.token}`;
        }
      } catch {
        localStorage.removeItem('user');
      }
    }
    return config;
  });

  const handle401 = async (error: AxiosError, instance: AxiosInstance, authInstance: AxiosInstance) => {
    const originalRequest = error.config as RetryableRequestConfig | undefined;

    if (
      originalRequest.url?.includes("/auth/login") ||
      originalRequest?.url?.includes("/auth/me")
    ) {
      return Promise.reject(error);
    }

    if (error.response?.status !== 401 || originalRequest?._retry || !originalRequest) throw error

    originalRequest._retry = true;

    if (isRefreshing) {
      await enqueue();
      return instance(originalRequest);
    }

    isRefreshing = true;
    try {
      const response = await authInstance.post("/auth/me", null, {
        withCredentials: true,
      });
      const newToken = response.data?.data?.token;
      const userStr = localStorage.getItem('user');
      if (!newToken || !userStr) throw new Error('Não foi possível renovar a sessão.');

      const user = JSON.parse(userStr);
      localStorage.setItem('user', JSON.stringify({ ...user, token: newToken }));
      sessionStorage.setItem(
        "expirationTime",
        response.data.tokenExpirationTime
      );

      queue.forEach((p) => p.resolve());
      queue = [];

      return instance(originalRequest);
    } catch (refreshError) {

      queue.forEach((p) => p.reject(refreshError));
      queue = [];

      localStorage.removeItem('user');
      sessionStorage.removeItem('expirationTime');
      window.location.reload();
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
