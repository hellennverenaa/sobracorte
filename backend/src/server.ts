import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { routes } from './routes';
import rateLimit from 'express-rate-limit';

const app = express();

app.use(cors({ exposedHeaders: ['X-Total-Count'] }));
app.use(express.json());

// ==========================================
// 🛡️ CAMADA DE SEGURANÇA (SecOps)
// ==========================================

// 1. HELMET: O Capacete. Ele esconde dos hackers que o servidor roda Node.js/Express 
// e blinda os cabeçalhos HTTP contra ataques de injeção.
app.use(helmet());

// 2. RATE LIMITING: O Segurança da Porta (Anti Força-Bruta e DDoS)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // Janela de 15 minutos
  max: 150, // Limite de 150 requisições por IP a cada 15 minutos
  message: { error: '⚠️ Tráfego suspeito detectado. Acesso bloqueado temporariamente por 15 minutos.' }
});
app.use(limiter);

// 3. CORS: A Lista VIP (Blindagem de Origem)
app.use(cors({
  // Por enquanto liberamos o localhost. Quando a equipe de Redes da DASS for colocar
  // no servidor oficial, eles vão trocar isso para o IP do domínio da fábrica.
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'], 
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'] // Trava para aceitar só JSON e Token
}));

// ==========================================
// CONFIGURAÇÕES PADRÃO DO EXPRESS
// ==========================================
app.use(express.json());

// Engatando o "roteador" no nosso motor principal
app.use(routes);

const PORT = Number(process.env.PORT) || 3333;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Servidor SOBRACORTE blindado e rodando na porta ${PORT}`);
});