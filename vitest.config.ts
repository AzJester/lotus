import { defineConfig } from "vitest/config";

// Logic tests run in jsdom so the persisted store (localStorage) works.
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
