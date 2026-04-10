import dotenv from "dotenv"
import path from "path"

const envFile = ".env"

dotenv.config({
  path: path.resolve(__dirname, "../../", envFile)
})

export const vars = {
  DB_URL: process.env.DATABASE_URL || "",
  PRIVATE_KEY: process.env.PRIVATE_KEY
}
