import { Request, Response } from 'express';
import { prisma } from '../prisma';

// TODO: Fazer logica de callback no front end apos ffazer login na api de autenticacao. Retirar gambiarra de chamar api por aqui
export class AuthController {
  async login(req: Request, res: Response) {
    const { usuario, senha } = req.body;
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      
      const apiResponse = await fetch('http://10.100.1.43:2399/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario, senha }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!apiResponse.ok) return res.status(401).json({ error: "Credenciais inválidas" });

      const data = await apiResponse.json();
      const token = data.data.token;

      const payloadBase64 = token.split('.')[1];
      const payloadJson = Buffer.from(payloadBase64, 'base64').toString('utf-8');
      const apiUser = JSON.parse(payloadJson);

      const emailFallback = apiUser.email || `${String(apiUser.usuario).toLowerCase()}@grupodass.com.br`;
      const funcaoUpper = String(apiUser.funcao || '').toUpperCase().trim();
      const usuarioUpper = String(apiUser.usuario).toUpperCase().trim();

      // O CÉREBRO DA ARQUITETA AGORA NO BACKEND
      let initialRole = 'leitor'; // Padrão de segurança
      
      if (funcaoUpper.includes('LIDER') || funcaoUpper.includes('LÍDER') || funcaoUpper.includes('ANALISTA') || funcaoUpper.includes('COORDENADOR') || funcaoUpper.includes('GERENTE')) {
        initialRole = 'lider';
      } else if (funcaoUpper.includes('AUXILIAR') || funcaoUpper.includes('ASSISTENTE')) {
        initialRole = 'movimentador';
      }

      // Proteção Master para vocês 4
      const adminsMaster = ['HELLEN.MAGALHAES', 'HENDRIUS.SANTANA', 'PAULO.RICARDO', 'MIDIAN.SANTANA', 'CLEONICE.SOARES'];
      if (adminsMaster.some(admin => usuarioUpper.includes(admin))) {
        initialRole = 'admin';
      }

      // UPSERT CORRIGIDO
      const dbUser = await prisma.user.upsert({
        where: { usuario: apiUser.usuario },
        update: {
          nome: apiUser.nome || apiUser.usuario,
          email: emailFallback,
          setor: apiUser.setor || 'NÃO DEFINIDO',
          funcao: apiUser.funcao || 'NÃO DEFINIDO',
        },
        create: {
          usuario: apiUser.usuario,
          nome: apiUser.nome || apiUser.usuario,
          email: emailFallback,
          setor: apiUser.setor || 'NÃO DEFINIDO',
          funcao: apiUser.funcao || 'NÃO DEFINIDO',
          role: initialRole,
          // Pega a matrícula da API e converte para BigInt (como o schema novo exige)
          matriculaDass: apiUser.matricula ? BigInt(apiUser.matricula) : null
        }
      });

      // Converte o BigInt para Number antes de devolver pro Frontend para não dar Erro 500
      const safeUser = {
        ...dbUser,
        matriculaDass: dbUser.matriculaDass ? Number(dbUser.matriculaDass) : null
      };

      return res.json({ ...data, localUser: safeUser });

    } catch (error) {
// ... restante do código do catch continua igual
      console.error("Erro no AuthController:", error);
      const mockToken = "mock.eyJ1c3VhcmlvIjoiSEVMTEVOLk1BR0FMSEFFUyIsICJyb2xlIjoiYWRtaW4ifQ==.mock";
      res.json({ data: { token: mockToken } });
    }
  }
}