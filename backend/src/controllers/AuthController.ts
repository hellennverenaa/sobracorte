import { Request, Response } from 'express';
import { deriveInitialRole } from '../auth/roles';
import { prisma, prismaWithoutTenant } from '../prisma';
import { vars } from '../config/dotenv';

type AuthenticatedUser = NonNullable<Express.Request['user']>;

function serializeUser<T extends { matriculaDass: bigint | null }>(user: T) {
  return {
    ...user,
    matriculaDass: user.matriculaDass === null ? null : Number(user.matriculaDass),
  };
}

async function syncUser(user: AuthenticatedUser, factoryUnitId: number, isGlobalAdmin: boolean = false) {
  const usuario = String(user.usuario || '').toUpperCase().trim();
  if (!usuario) throw new Error('Token sem identificação de usuário.');

  const email = user.email || `${usuario.toLowerCase()}@grupodass.com.br`;
  const commonData = {
    nome: user.nome || usuario,
    email,
    setor: user.setor || 'NÃO DEFINIDO',
    funcao: user.funcao || 'NÃO DEFINIDO',
    matriculaDass: user.matricula ? BigInt(user.matricula) : null,
  };

  const initialRole = isGlobalAdmin ? 'admin' : deriveInitialRole({ usuario, funcao: user.funcao });

  return prisma.user.upsert({
    where: { factoryUnitId_usuario: { factoryUnitId, usuario } },
    update: {
      ...commonData,
      ...(isGlobalAdmin ? { role: 'admin' } : {}),
    },
    create: {
      usuario,
      ...commonData,
      role: initialRole,
      factoryUnitId,
    },
  });
}

export class AuthController {
  async checkUser(req: Request, res: Response) {
    if (!req.user || !req.tenant) {
      return res.status(401).json({ error: 'Usuário não autenticado.' });
    }

    try {
      const usuario = String(req.user.usuario || '').toUpperCase().trim();
      const matricula = req.user.matricula ? BigInt(req.user.matricula) : null;

      // 1. Busca usuário no banco sem filtrar previamente por factoryUnitId usando prismaWithoutTenant
      const userInDbAnyUnit = await prismaWithoutTenant.user.findFirst({
        where: {
          OR: [
            ...(matricula ? [{ matriculaDass: matricula }] : []),
            { usuario },
          ],
        },
        include: { factoryUnit: true },
        orderBy: { role: 'asc' }, // se tiver 'admin' em alguma unidade, vem primeiro
      });

      const isNumericMatricula = req.user.matricula && Number.isSafeInteger(Number(req.user.matricula));
      const isConfigAdmin = isNumericMatricula && vars.GLOBAL_ADMIN_REGISTRATIONS.has(Number(req.user.matricula));
      const isAdmin = Boolean(req.isGlobalAdmin) || isConfigAdmin || userInDbAnyUnit?.role === 'admin';

      // 2. Se não for admin, validar se a unidade selecionada corresponde à unidade cadastrada
      if (!isAdmin && userInDbAnyUnit && userInDbAnyUnit.factoryUnitId !== req.tenant.id) {
        return res.status(403).json({
          error: `Acesso negado: Seu perfil está cadastrado na unidade ${userInDbAnyUnit.factoryUnit?.code || userInDbAnyUnit.factoryUnitId}. Você não possui permissão para acessar a unidade ${req.tenant.code}.`,
        });
      }

      // 3. Sincroniza usuário na unidade autorizada
      const user = await syncUser(req.user, req.tenant.id, isAdmin);
      const effectiveUser = isAdmin ? { ...user, role: 'admin' } : user;

      return res.status(200).json({
        message: 'Usuário sincronizado com sucesso.',
        user: serializeUser(effectiveUser),
        unit: req.tenant,
        isGlobalAdmin: Boolean(isAdmin),
      });
    } catch (error) {
      console.error('Erro ao sincronizar usuário autenticado.', error);
      return res.status(500).json({ error: 'Erro interno ao processar usuário.' });
    }
  }

  async login(_req: Request, res: Response) {
    return res.status(403).json({
      error: 'Login local desabilitado. Autentique-se pelo serviço oficial de autenticação.',
    });
  }
}
