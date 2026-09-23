import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Logic tests run in jsdom so the persisted store (localStorage) works; the
// React plugin gives .tsx tests the automatic JSX runtime.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
