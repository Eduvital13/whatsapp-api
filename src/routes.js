const express = require('express');
const router = express.Router();
const { sendTextMessage, getStatus, getQRCode, setWebhook, getWebhook } = require('./whatsapp');

router.get('/status', (req, res) => {
  res.json({ status: getStatus() });
});

router.get('/qrcode', (req, res) => {
  const status = getStatus();

  if (status === 'conectado') {
    return res.send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:40px">
        <h2>✅ WhatsApp já está conectado!</h2>
      </body></html>
    `);
  }

  const qr = getQRCode();
  if (!qr) {
    return res.send(`
      <html>
        <head><meta http-equiv="refresh" content="3"></head>
        <body style="font-family:sans-serif;text-align:center;padding:40px">
          <h2>⏳ Aguardando QR Code...</h2>
          <p>A página vai atualizar automaticamente.</p>
        </body>
      </html>
    `);
  }

  res.send(`
    <html>
      <head><meta http-equiv="refresh" content="30"></head>
      <body style="font-family:sans-serif;text-align:center;padding:40px;background:#f0f0f0">
        <h2 style="color:#128C7E">📱 Escaneie o QR Code</h2>
        <p>WhatsApp → Dispositivos conectados → Conectar um dispositivo</p>
        <img src="${qr}" width="280" style="border:4px solid #25D366;border-radius:12px;padding:10px;background:white"/>
      </body>
    </html>
  `);
});

router.post('/send', async (req, res) => {
  const { number, message } = req.body;
  if (!number || !message) {
    return res.status(400).json({ error: 'Campos obrigatórios: "number" e "message"' });
  }
  try {
    const result = await sendTextMessage(number, message);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/webhook/set', (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'Campo obrigatório: "url"' });
  setWebhook(url);
  res.json({ success: true, webhook: url });
});

router.get('/webhook', (req, res) => {
  res.json({ webhook: getWebhook() || 'Nenhum webhook configurado' });
});

router.post('/flush', async (req, res) => {
  const { flushSession } = require('./whatsapp');
  const ok = await flushSession();
  res.json({ success: ok });
});

module.exports = router;