const express = require('express');
const app = express();
const { startWhatsApp, getStatus } = require('./whatsapp');
const routes = require('./routes');

app.use(express.json());
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

const PORT = 3000;

app.listen(PORT, async () => {
  console.log(`\n🚀 Servidor rodando em http://localhost:${PORT}`);
  console.log(`📱 Acesse http://localhost:${PORT}/api/qrcode para conectar\n`);
  await startWhatsApp();
});