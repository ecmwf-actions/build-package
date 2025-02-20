import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        globals: true,
        clearMocks: true,
        restoreMocks: true,
        coverage: {
            provider: "v8",
            include: ["src/**/*.ts"],
            exclude: ["src/**/*.d.ts", "node_modules/**"],
        },
    },
});
