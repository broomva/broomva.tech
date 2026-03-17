import { defineConfig } from "evalite/config";
import { createSqliteStorage } from "evalite/sqlite-storage";
import tsconfigPaths from "vite-tsconfig-paths";
export default defineConfig({
  storage: () => createSqliteStorage("./evals/db/evalite.db"),
  setupFiles: ["./evals/setup.ts"],
  viteConfig: {
    // @ts-expect-error this is actually the correct way to pass vitest config
    plugins: [tsconfigPaths()],
  },
});
