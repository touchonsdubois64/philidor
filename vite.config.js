import { defineConfig } from "vite";

export default defineConfig({
    base: "/philidor/",
    build: {
        outDir: "docs",
        emptyOutDir: true
    }
});