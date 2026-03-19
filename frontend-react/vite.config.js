import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@legacy': path.resolve(__dirname, '../frontend/js'),
            '@legacy-pages': path.resolve(__dirname, '../frontend/js/pages'),
        },
    },
    server: {
        fs: {
            allow: [path.resolve(__dirname, '..')],
        },
    },
    build: {
        outDir: 'dist',
        emptyOutDir: true,
    },
});
