import { defineConfig } from "drizzle-kit";
import { DB_PATH } from "./src/lib/db/paths";

export default defineConfig({
  schema: "./src/lib/db/schema/index.ts",
  out: "./ljadev/drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: DB_PATH,
  },
});
