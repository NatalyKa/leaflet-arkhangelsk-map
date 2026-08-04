import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

function saveLayersPlugin() {
  return {
    name: 'save-layers-plugin',
    configureServer(server) {
      server.middlewares.use('/api/save-photo-layers', (req, res, next) => {
        if (req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const filePath = path.resolve(__dirname, 'data/photo_layers.json');
              fs.writeFileSync(filePath, body, 'utf-8');
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true }));
            } catch (err) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            }
          });
        } else {
          next();
        }
      });
    }
  };
}

export default defineConfig({
  base: './',
  plugins: [saveLayersPlugin()],
  resolve: {
    conditions: ['browser', 'import', 'module', 'default']
  }
});
