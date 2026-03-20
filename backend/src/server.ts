import express from 'express';
import cors from 'cors';
import { routes } from './routes';

const app = express();

app.use(cors({ exposedHeaders: ['X-Total-Count'] }));
app.use(express.json());

// Engatando o "roteador" no nosso motor principal
app.use(routes);

const PORT = Number(process.env.PORT) || 3333;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Servidor SOBRACORTE blindado e rodando na porta ${PORT}`);
});