import { PrismaClient } from "./generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { vars } from "./config/dotenv";

const dbUrl = new URL(vars.DB_URL!);
const schema = dbUrl.searchParams.get("schema") ?? "public";
dbUrl.searchParams.delete("schema");

const pool = new Pool({ connectionString: dbUrl.toString() });
const adapter = new PrismaPg(pool, { schema });

export const prisma = new PrismaClient({ adapter });