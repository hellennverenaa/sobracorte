import { PrismaClient } from "./generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { vars } from "./config/dotenv";
import { tenantStorage } from "./context/tenantContext";

// ─── Configuração do Pool de Conexões PostgreSQL ──────────────────────────────
const dbUrl = new URL(vars.DB_URL!);
const schema = dbUrl.searchParams.get("schema") ?? "public";
dbUrl.searchParams.delete("schema");

export const pool = new Pool({
  connectionString: dbUrl.toString(),
  max: vars.DB_POOL_MAX,
  idleTimeoutMillis: vars.DB_POOL_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: vars.DB_POOL_CONN_TIMEOUT_MS,
});

pool.on("error", (err) => {
  console.error("[PgPool] Erro inesperado em cliente ocioso no pool:", err);
});

const adapter = new PrismaPg(pool, {
  schema,
  disposeExternalPool: true,
});

// ─── Modelos Globais (Sem Isolamento por Tenant) ──────────────────────────────
//
// Esses modelos NÃO possuem a coluna `factoryUnitId` e devem ser excluídos
// do interceptor automático de tenant.
//
// ⚠️  REGRA: Nunca adicione aqui modelos que possuam `factoryUnitId`.
//     Se um modelo for adicionado incorretamente, dados de todas as fábricas
//     ficarão expostos sem filtro de tenant.
const GLOBAL_MODELS = new Set<string>([
  "FactoryUnit",   // Tabela-pai do tenant — sem factoryUnitId próprio
  "AuthIdentity",  // consultada por identidade nativa durante o bootstrap autenticado
]);

// ─── Operações que injetam `where.factoryUnitId` ─────────────────────────────
const FILTER_OPS = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "count",
  "aggregate",
  "groupBy",
  "updateMany",
  "deleteMany",
]);

// ─── PrismaClient com Extensão de Multi-Tenancy ───────────────────────────────
//
// O $extends intercepta TODAS as operações em TODOS os modelos.
// Para contornar as restrições de tipo do Prisma em $allOperations,
// usamos `any` de forma controlada e localizada apenas neste módulo.
// Isso é o padrão oficial documentado pelo Prisma para extensões genéricas.
// Ref: https://www.prisma.io/docs/concepts/components/prisma-client/client-extensions
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyArgs = Record<string, any>;

export class TenantGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenantGuardError';
  }
}

function failTenantGuard(model: string | undefined, operation: string, message: string): never {
  throw new TenantGuardError(`[TenantGuard] ${model ?? 'unknown'}.${operation}: ${message}`);
}

function ensureTenantValue(value: unknown, tenantId: number, model: string | undefined, operation: string) {
  if (value !== tenantId) {
    failTenantGuard(model, operation, `factoryUnitId deve ser a unidade ativa (${tenantId}).`);
  }
}

/**
 * Finds `factoryUnitId` in a Prisma unique selector. Prisma names compound
 * selectors after their fields (for example `id_factoryUnitId`), therefore
 * checking only the top level would let singular operations escape the guard.
 */
function tenantIdInUniqueSelector(selector: unknown): unknown {
  if (!selector || typeof selector !== 'object' || Array.isArray(selector)) return undefined;
  const record = selector as Record<string, unknown>;
  if (Object.hasOwn(record, 'factoryUnitId')) return record.factoryUnitId;
  for (const [key, value] of Object.entries(record)) {
    if (!key.split('_').includes('factoryUnitId')) continue;
    if (value && typeof value === 'object' && !Array.isArray(value) && Object.hasOwn(value, 'factoryUnitId')) {
      return (value as Record<string, unknown>).factoryUnitId;
    }
  }
  return undefined;
}

function requireTenantUniqueSelector(args: AnyArgs, tenantId: number, model: string | undefined, operation: string) {
  const value = tenantIdInUniqueSelector(args.where);
  if (value === undefined) {
    failTenantGuard(model, operation, 'operações singulares exigem factoryUnitId explícito ou seletor composto equivalente.');
  }
  ensureTenantValue(value, tenantId, model, operation);
}

function rejectForeignTenantInWhere(where: unknown, tenantId: number, model: string | undefined, operation: string) {
  if (!where || typeof where !== 'object' || Array.isArray(where)) return;
  const record = where as Record<string, unknown>;
  if (Object.hasOwn(record, 'factoryUnitId')) {
    const value = record.factoryUnitId;
    if (typeof value !== 'object' || value === null) ensureTenantValue(value, tenantId, model, operation);
  }
}

/** Exported for focused no-database tests of the fail-fast boundary. */
export function applyTenantGuard(model: string | undefined, operation: string, args: AnyArgs, tenantId: number): AnyArgs {
  if (FILTER_OPS.has(operation)) {
    rejectForeignTenantInWhere(args.where, tenantId, model, operation);
    if (operation === 'updateMany' && args.data?.factoryUnitId !== undefined) {
      ensureTenantValue(args.data.factoryUnitId, tenantId, model, operation);
    }
    return { ...args, where: { ...args.where, factoryUnitId: tenantId } };
  }

  if (operation === 'create') {
    if (args.data?.factoryUnitId !== undefined) ensureTenantValue(args.data.factoryUnitId, tenantId, model, operation);
    return { ...args, data: { ...args.data, factoryUnitId: tenantId } };
  }

  if (operation === 'createMany' || operation === 'createManyAndReturn') {
    const data = Array.isArray(args.data) ? args.data : [args.data];
    for (const item of data) {
      if (item?.factoryUnitId !== undefined) ensureTenantValue(item.factoryUnitId, tenantId, model, operation);
    }
    return {
      ...args,
      data: Array.isArray(args.data)
        ? data.map((item: AnyArgs) => ({ ...item, factoryUnitId: tenantId }))
        : { ...args.data, factoryUnitId: tenantId },
    };
  }

  if (operation === 'findUnique' || operation === 'findUniqueOrThrow' || operation === 'update' || operation === 'delete' || operation === 'upsert') {
    requireTenantUniqueSelector(args, tenantId, model, operation);
    if (operation === 'update' && args.data?.factoryUnitId !== undefined) {
      ensureTenantValue(args.data.factoryUnitId, tenantId, model, operation);
    }
    if (operation === 'upsert') {
      for (const branch of ['create', 'update']) {
        if (args[branch]?.factoryUnitId !== undefined) ensureTenantValue(args[branch].factoryUnitId, tenantId, model, operation);
      }
      return { ...args, create: { ...args.create, factoryUnitId: tenantId } };
    }
  }

  return args;
}

export function requireTenantContext(model: string | undefined, operation: string): number {
  const store = tenantStorage.getStore();
  if (!store) {
    throw new TenantGuardError(
      `[TenantGuard] Query no modelo "${model}" (op: "${operation}") foi chamada fora de um contexto de tenant ativo. ` +
      `Certifique-se de que o middleware requireAuth está aplicado na rota, ou use prismaForInternalUse exclusivamente em scripts internos identificados.`,
    );
  }
  return store.tenantId;
}

export const prisma = new PrismaClient({ adapter }).$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        // 1. Modelos globais nunca recebem filtro de tenant
        if (model && GLOBAL_MODELS.has(model)) {
          return query(args);
        }

        // 2. Buscar o tenant no contexto da requisição atual
        // 3. Fora de um contexto HTTP (seeds, scripts): lança erro fail-fast.
        //    Impede que uma query acidental retorne dados de TODAS as fábricas.
        const tenantId = requireTenantContext(model, operation);
        return query(applyTenantGuard(model, operation, args as AnyArgs, tenantId));
      },
    },
  },
});

// ─── Cliente sem Proteção de Tenant ──────────────────────────────────────────
//
// Use APENAS para scripts internos identificados (seed, migration, smoke test).
//
// ⚠️  NUNCA use `prismaForInternalUse` em Controllers ou código que processe
//     requisições de usuários finais. Isso causaria cross-tenant data leak.
//
export const prismaForInternalUse = new PrismaClient({ adapter });

/** Tipo da transação com as mesmas extensões de tenant do cliente da aplicação. */
export type StockTransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
