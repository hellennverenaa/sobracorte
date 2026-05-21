/// <reference types="vite/client" />
import { attachInterceptors } from "./interceptors/interceptor"
import { ip } from "../utils/ip"
import axios from "axios"

const isLocal = import.meta.env.DEV;

// 1. LOGIN: Local roda puro na 2399. Produção usa o /api do Gateway!
export const authApi = axios.create({
  baseURL: isLocal ? "http://localhost:2399" : `${ip}:2399/api`,
  withCredentials: true
});

// 2. MATERIAIS: Local bate direto na 3333. Produção passa pela pasta sobracorte.
export const api = axios.create({
  baseURL: isLocal ? "http://localhost:3333" : `${ip}:2399/api/sobracorte`,
  withCredentials: true
});

attachInterceptors(api, authApi);