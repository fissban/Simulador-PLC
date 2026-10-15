import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";
import path from "node:path";

const apiTarget = process.env.VITE_API_TARGET ?? "http://127.0.0.1:8080";

export default defineConfig({
    plugins: [solidPlugin()],
    root: path.resolve(__dirname, "src", "server", "web", "client"),
    publicDir: path.resolve(__dirname, "src", "server", "web", "public"),
    server: {
        host: "0.0.0.0",
        port: 4173,
        proxy: {
            "/api": {
                target: apiTarget,
                changeOrigin: true
            }
        }
    },
    preview: {
        host: "0.0.0.0",
        port: 4173,
        proxy: {
            "/api": {
                target: apiTarget,
                changeOrigin: true
            }
        }
    },
    build: {
        outDir: path.resolve(__dirname, "dist", "server", "web", "public"),
        emptyOutDir: true,
        target: "es2022"
    },
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "src", "server", "web", "client")
        }
    }
});
