/// <reference types="vite/client" />
import { attachInterceptors } from "./interceptors/interceptor"
import axios from "axios"

export const authApi = axios.create({
  baseURL: import.meta.env.VITE_AUTH_API_URL,
  withCredentials: true
});

export const api = axios.create({
  baseURL: import.meta.env.VITE_SOBRACORTE_API_URL,
  withCredentials: true
});

attachInterceptors(api, authApi);
