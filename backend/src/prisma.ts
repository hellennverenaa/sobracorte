import { PrismaClient } from "./generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";
import { vars } from "./config/dotenv";

const dbUrl = new URL(vars.DB_URL!);
const schema = dbUrl.searchParams.get("schema") ?? "public";
dbUrl.searchParams.delete("schema");

const adapter = new PrismaPg(
  { connectionString: dbUrl.toString() },
  { schema }
);

export const prisma = new PrismaClient({ adapter });