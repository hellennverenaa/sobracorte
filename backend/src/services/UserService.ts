import { SectorType } from '../generated/prisma';
import { UserRole, canAssignRole } from '../auth/roles';

export class UserNotFoundError extends Error {
  constructor(message = 'Usuário não encontrado.') {
    super(message);
    this.name = 'UserNotFoundError';
  }
}

export class UserConcurrencyConflictError extends Error {
  constructor(message = 'O nível de acesso deste usuário foi alterado por outro administrador enquanto você editava. Recarregue a página para ver o estado mais recente.') {
    super(message);
    this.name = 'UserConcurrencyConflictError';
  }
}

export class UnauthorizedRoleAssignmentError extends Error {
  constructor(message = "Apenas Administradores Globais podem conceder o perfil de Administrador Master ('admin').") {
    super(message);
    this.name = 'UnauthorizedRoleAssignmentError';
  }
}

export interface UpdateUserRoleInput {
  targetUserId: number;
  factoryUnitId: number;
  newRole: UserRole;
  newSector?: SectorType | null;
  expectedRole?: string;
  actor: {
    matricula?: string | null;
    nome: string;
    usuario: string;
    isGlobalAdmin: boolean;
  };
}

export interface UpdateUserRoleResult {
  user: any;
  changed: boolean;
  auditLog?: any;
}

export class UserService {
  /**
   * Atualização atômica de permissões e setor RBAC com auditoria e trava de concorrência.
   */
  async updateUserRole(
    prisma: any,
    input: UpdateUserRoleInput
  ): Promise<UpdateUserRoleResult> {
    const { targetUserId, factoryUnitId, newRole, newSector, expectedRole, actor } = input;

    // 1. Validar elevação de privilégios
    if (!canAssignRole(newRole, actor.isGlobalAdmin)) {
      throw new UnauthorizedRoleAssignmentError();
    }

    return await prisma.$transaction(async (tx: any) => {
      // 2. Buscar usuário atual na fábrica
      const currentUser = await tx.user.findFirst({
        where: { id: targetUserId, factoryUnitId },
      });

      if (!currentUser) {
        throw new UserNotFoundError();
      }

      // 3. Trava de concorrência otimista (caso o papel tenha sido alterado entre a abertura da tela e a confirmação)
      if (expectedRole && currentUser.role !== expectedRole) {
        throw new UserConcurrencyConflictError();
      }

      const normalizedCurrentSector = currentUser.assignedSector || null;
      const normalizedNewSector = newSector || null;

      // 4. Detecção de idempotência (sem alterações -> não gera log redundante)
      if (currentUser.role === newRole && normalizedCurrentSector === normalizedNewSector) {
        return {
          user: currentUser,
          changed: false,
        };
      }

      // 5. Atualizar o usuário
      const updatedUser = await tx.user.update({
        where: { id: targetUserId },
        data: {
          role: newRole,
          assignedSector: normalizedNewSector,
        },
      });

      // 6. Registrar na tabela dedicada de auditoria LGPD / Segurança
      const auditLog = await tx.roleChangeAudit.create({
        data: {
          factoryUnitId,
          userId: currentUser.id,
          usuario: currentUser.usuario,
          nome: currentUser.nome,
          previousRole: currentUser.role,
          newRole,
          previousSector: normalizedCurrentSector,
          newSector: normalizedNewSector,
          changedById: actor.matricula || null,
          changedByName: actor.nome || actor.usuario,
        },
      });

      // 7. Registrar na trilha corporativa de auditoria unificada de configurações
      await tx.stockMovement.create({
        data: {
          factoryUnitId,
          sector: 'CONFIGURACOES',
          type: 'EDICAO_CONFIGURACAO',
          quantity: 0,
          operatorId: actor.matricula || null,
          operatorName: actor.nome || actor.usuario,
          origem: 'Gestão de Usuários - RBAC',
          reason: `Alteração de permissões do usuário ${currentUser.usuario} (${currentUser.nome}): papel de '${currentUser.role}' para '${newRole}' e setor de '${normalizedCurrentSector || 'TODOS'}' para '${normalizedNewSector || 'TODOS'}'.`,
        },
      });

      return {
        user: updatedUser,
        changed: true,
        auditLog,
      };
    });
  }

  /**
   * Consulta o histórico de auditoria de alterações de papéis de usuários da unidade.
   */
  async getRoleAuditHistory(prisma: any, factoryUnitId: number, limit = 50) {
    return await prisma.roleChangeAudit.findMany({
      where: { factoryUnitId },
      orderBy: { changedAt: 'desc' },
      take: limit,
    });
  }
}

export const userService = new UserService();
