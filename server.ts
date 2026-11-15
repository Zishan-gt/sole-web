import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { ensureSeeded } from './src/db/seed.ts';
import { attachWebSocketServer } from './src/lib/realtime.ts';
import { publicRouter } from './src/server/routes/public.ts';
import { ownerRouter } from './src/server/routes/owner.ts';
import { adminRouter } from './src/server/routes/admin.ts';
import { authRouter } from './src/server/routes/auth.ts';
import { aiRouter } from './src/server/routes/ai.ts';
import { chatRouter } from './src/server/routes/chat.ts';
import { injectSeoMetaIntoHtml, seoRouter } from './src/server/routes/seo.ts';
import { syncSeededSocialToFirestore } from './src/lib/firestore-sync.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const PORT = 3000;

  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true, limit: '5mb' }));

  // Serve generated business/product assets & uploaded reel videos statically
  const uploadsDir = path.join(__dirname, 'uploads');
  fs.mkdirSync(path.join(uploadsDir, 'media'), { recursive: true });
  app.use(
    '/src/assets/images',
    express.static(path.join(__dirname, 'src/assets/images'))
  );
  app.use('/uploads', express.static(uploadsDir));

  // Lazy-seed database once on first API request (avoids blocking server startup)
  app.use('/api', async (_req, _res, next) => {
    try {
      await ensureSeeded();
      void syncSeededSocialToFirestore();
    } catch (e) {
      console.error('Lazy seed failed:', e);
    }
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'SoleWeb' });
  });

  app.use('/', seoRouter);
  app.use('/api', publicRouter);
  app.use('/api', authRouter);
  app.use('/api/ai', aiRouter);
  app.use('/api/chat', chatRouter);
  app.use('/api/owner', ownerRouter);
  app.use('/api/admin', adminRouter);

  // Attach real-time WebSocket server on port 3000 (/ws)
  attachWebSocketServer(server);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: { server },
        hmr: process.env.DISABLE_HMR === 'true' ? false : { server },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    const templateHtml = fs.readFileSync(path.join(distPath, 'index.html'), 'utf8');
    app.use(express.static(distPath, { index: false }));
    app.get('*', async (req, res) => {
      const html = await injectSeoMetaIntoHtml(templateHtml, req);
      res.type('text/html').send(html);
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`SoleWeb full-stack server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start SoleWeb server:', err);
  process.exit(1);
});
