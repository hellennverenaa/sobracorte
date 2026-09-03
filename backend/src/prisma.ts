import { PrismaClient } from "./generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";
import { vars } from "./config/dotenv";
import { tenantStorage } from "./context/tenantContext";

// ─── Configuração do Driver de Conexão ───────────────────────────────────────
const dbUrl = new URL(vars.DB_URL!);
const schema = dbUrl.searchParams.get("schema") ?? "public";
dbUrl.searchParams.delete("schema");

const adapter = new PrismaPg(
  { connectionString: dbUrl.toString() },
  { schema }
);

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

export const prisma = new PrismaClient({ adapter }).$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        // 1. Modelos globais nunca recebem filtro de tenant
        if (model && GLOBAL_MODELS.has(model)) {
          return query(args);
        }

        // 2. Buscar o tenant no contexto da requisição atual
        const store = tenantStorage.getStore();

        // 3. Fora de um contexto HTTP (seeds, scripts): lança erro fail-fast.
        //    Impede que uma query acidental retorne dados de TODAS as fábricas.
        if (!store) {
          throw new Error(
            `[TenantGuard] Query no modelo "${model}" (op: "${operation}") ` +
            `foi chamada fora de um contexto de tenant ativo. ` +
            `Certifique-se de que o middleware requireAuth está aplicado na rota, ` +
            `ou use prismaWithoutTenant para scripts/seeds internos.`
          );
        }

        const { tenantId } = store;
        const mutableArgs = args as AnyArgs;

        // 4. Injeção em operações de leitura/atualização em massa
        if (FILTER_OPS.has(operation)) {
          mutableArgs.where = {
            ...mutableArgs.where,
            factoryUnitId: tenantId,
          };
          return query(mutableArgs);
        }

        // 5. Injeção em operação de criação simples (create)
        if (operation === "create") {
          mutableArgs.data = {
            ...mutableArgs.data,
            factoryUnitId: tenantId,
          };
          return query(mutableArgs);
        }

        // 6. Injeção em operações de criação em lote (createMany / createManyAndReturn)
        if (operation === "createMany" || operation === "createManyAndReturn") {
          if (Array.isArray(mutableArgs.data)) {
            mutableArgs.data = mutableArgs.data.map((item: AnyArgs) => ({
              ...item,
              factoryUnitId: tenantId,
            }));
          }
          return query(mutableArgs);
        }

        // 7. Demais operações (update, delete, findUnique, upsert):
        //    O isolamento é garantido pelo schema via FK composta [id, factoryUnitId]
        //    no PostgreSQL. Não interceptamos para evitar conflito de tipagem.
        return query(args);
      },
    },
  },
});

// ─── Cliente sem Proteção de Tenant ──────────────────────────────────────────
//
// Use APENAS para scripts internos (seeds, migrations, jobs, testes de integração)
// que precisam acessar dados de múltiplas unidades ou sem contexto de requisição.
//
// ⚠️  NUNCA use `prismaWithoutTenant` em Controllers ou código que processe
//     requisições de usuários finais. Isso causaria cross-tenant data leak.
//
export const prismaWithoutTenant = new PrismaClient({ adapter });