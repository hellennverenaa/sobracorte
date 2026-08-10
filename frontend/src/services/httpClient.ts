/// <reference types="vite/client" />
import { attachInterceptors } from "./interceptors/interceptor"
import { ip } from "../utils/ip"
import axios from "axios"

// Detecta dinamicamente o IP ou Host onde o navegador está acessando a tela
const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';

// 1. LOGIN / AUTH: Serviço DASS Gateway na porta 2399
export const authApi = axios.create({
  baseURL: `http://${hostname === 'localhost' ? '10.100.1.43' : hostname}:2399/api`,
  withCredentials: true
});

// 2. SOBRACORTE BACKEND: Garante SEMPRE a porta 3333 e o prefixo /api
export const api = axios.create({
  baseURL: `http://${hostname}:3333/api`,
  withCredentials: true
});

attachInterceptors(api, authApi);