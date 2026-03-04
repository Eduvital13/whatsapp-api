const express = require('express');
const app = express();
const { startWhatsApp, getStatus } = require('./whatsapp');
const routes = require('./routes');

app.use(express.json());

// ── Chave de segurança (API Key) ────────────────────────────────────────────
const API_KEY = process.env.API_KEY || 'minha-chave-secreta-123';

app.use('/api', (req, res, next) => {
  // A rota /api/qrcode pode ser acessada sem chave (para facilitar o login)
  if (req.path === '/qrcode' || req.path === '/status') return next();

  const key = req.headers['x-api-key'];
  if (!key || key !== API_KEY) {
    return res.status(401).json({ error: 'Acesso negado. Informe a chave correta no header x-api-key.' });
  }
  next();
});

app.use('/api', routes);

app.get('/', (req, res) => {
  res.json({
    name: 'WhatsApp API - Baileys',
    status: getStatus(),
    endpoints: {
      'GET  /api/status':      'Status da conexão',
      'GET  /api/qrcode':      'QR Code para autenticar',
      'POST /api/send':        'Enviar mensagem de texto',
      'POST /api/webhook/set': 'Configurar URL de webhook',
      'GET  /api/webhook':     'Ver webhook configurado'
    }
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log(`\n🚀 Servidor rodando em http://localhost:${PORT}`);
  console.log(`📱 Acesse http://localhost:${PORT}/api/qrcode para conectar\n`);
  await startWhatsApp();
});