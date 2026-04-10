import { attachInterceptors } from "./interceptors/interceptor"
import { ip } from "../utils/ip"
import axios from "axios"

// TODO: Em producao fica -> baseURL: `${ip}:2399/api`
export const authApi = axios.create({
  baseURL: `${ip}:2399/api`,
  withCredentials: true
});

export const api = axios.create({
  baseURL: `${ip}:3333`,
  withCredentials: true
});

attachInterceptors(api, authApi);