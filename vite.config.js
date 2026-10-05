import { defineConfig } from 'vite';
import path from 'path';
import fs from 'fs';

function enemyDiscoveryPlugin() {
  const virtualModuleId = 'virtual:enemy-list';
  const resolvedVirtualId = '\0' + virtualModuleId;

  return {
    name: 'enemy-discovery-plugin',
    resolveId(id) {
      if (id === virtualModuleId) return resolvedVirtualId;
    },
    load(id) {
      if (id === resolvedVirtualId) {
        const searchDirs = [
          path.resolve(process.cwd(), 'public/images/enemies'),
          path.resolve(process.cwd(), 'images/enemies')
        ];
        const found = new Set();
        for (const dir of searchDirs) {
          if (fs.existsSync(dir)) {
            try {
              const files = fs.readdirSync(dir);
              for (const f of files) {
                if (/\.(png|jpe?g|webp|avif)$/i.test(f)) {
                  found.add(f);
                }
              }
            } catch (e) {
              // Ignore read errors
            }
          }
        }
        const list = Array.from(found);
        return `export const discoveredEnemyFiles = ${JSON.stringify(list)};`;
      }
    }
  };
}

export default defineConfig({
  base: '/blasting-through-kattaikonam/',
  server: {
    port: 5173,
    host: true, // Allow local network access for mobile testing
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) {
            return 'three';
          }
        }
      }
    }
  },
  plugins: [
    enemyDiscoveryPlugin(),
    {
      name: 'root-asset-fallback',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          // If a request for /images/... or /audio/... wasn't found in public, try root workspace folder
          if (req.url.startsWith('/images/') || req.url.startsWith('/audio/')) {
            const cleanUrl = req.url.split('?')[0];
            const localPath = path.resolve(process.cwd(), '.' + cleanUrl);
            if (fs.existsSync(localPath) && fs.statSync(localPath).isFile()) {
              const ext = path.extname(localPath).toLowerCase();
              const mimeTypes = {
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.png': 'image/png',
                '.webp': 'image/webp',
                '.avif': 'image/avif',
                '.mp3': 'audio/mpeg',
                '.wav': 'audio/wav',
                '.ogg': 'audio/ogg'
              };
              if (mimeTypes[ext]) {
                res.setHeader('Content-Type', mimeTypes[ext]);
              }
              fs.createReadStream(localPath).pipe(res);
              return;
            }
          }
          next();
        });
      }
    }
  ]
});
