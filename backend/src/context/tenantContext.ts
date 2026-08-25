import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Contexto de execução do Tenant (Unidade Fabril).
 *
 * Armazena o `tenantId` ativo durante o ciclo de vida de uma requisição HTTP.
 * É populado pelo middleware `requireAuth` e lido automaticamente pela
 * extensão `$extends` do PrismaClient para injetar `factoryUnitId` em todas
 * as queries de modelos multi-tenant.
 *
 * @see backend/src/middlewares/roleMiddleware.ts — onde o contexto é ativado
 * @see backend/src/prisma.ts — onde o contexto é consumido pelo ORM
 */
export type TenantStore = {
  tenantId: number;
};

export const tenantStorage = new AsyncLocalStorage<TenantStore>();
