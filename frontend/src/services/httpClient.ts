import { attachInterceptors } from "./interceptors/interceptor"
import { ip } from "../utils/ip"
import axios from "axios"

// fazer verificacao de ambiente dev para preencher as apis dinamicamente

// TODO: Em producao fica -> baseURL: `${ip}:2399/api`
export const authApi = axios.create({
  baseURL: `${ip}:2399/api`,
  withCredentials: true
});

export const api = axios.create({
  baseURL: `${ip}:2399/api/sobracorte`,
  withCredentials: true
});

attachInterceptors(api, authApi);