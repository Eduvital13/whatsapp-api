const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const axios = require('axios');
const path = require('path');

let sock = null;
let qrCodeData = null;
let connectionStatus = 'desconectado';
let webhookUrl = null;

const SESSION_PATH = path.join(__dirname, 'session');

async function startWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: true,
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      const QRCode = require('qrcode');
      qrCodeData = await QRCode.toDataURL(qr);
      connectionStatus = 'aguardando_qr';
      console.log('📲 QR Code gerado! Acesse /api/qrcode para escanear.');
    }

    if (connection === 'open') {
      qrCodeData = null;
      connectionStatus = 'conectado';
      console.log('✅ WhatsApp conectado com sucesso!');
    }

    if (connection === 'close') {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

      connectionStatus = 'desconectado';
      console.log('❌ Conexão encerrada. Reconectando:', shouldReconnect);

      if (shouldReconnect) {
        setTimeout(startWhatsApp, 3000);
      } else {
        console.log('🔒 Sessão encerrada. Delete a pasta "session" e reinicie.');
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (msg.key.fromMe) continue;

      const from = msg.key.remoteJid;
      const text = msg.message?.conversation
                || msg.message?.extendedTextMessage?.text
                || '';

      console.log(`📨 Mensagem de ${from}: ${text}`);

      if (webhookUrl) {
        await dispararWebhook({ from, text, timestamp: msg.messageTimestamp });
      }
    }
  });
}

async function sendTextMessage(number, text) {
  if (!sock || connectionStatus !== 'conectado') {
    throw new Error('WhatsApp não está conectado.');
  }
  const jid = number.replace(/\D/g, '') + '@s.whatsapp.net';
  await sock.sendMessage(jid, { text });
  return { success: true, to: jid, message: text };
}

async function dispararWebhook(payload) {
  try {
    await axios.post(webhookUrl, payload, { timeout: 5000 });
  } catch (err) {
    console.error(`⚠️ Erro no webhook: ${err.message}`);
  }
}

function getStatus()     { return connectionStatus; }
function getQRCode()     { return qrCodeData; }
function setWebhook(url) { webhookUrl = url; }
function getWebhook()    { return webhookUrl; }

module.exports = { startWhatsApp, sendTextMessage, getStatus, getQRCode, setWebhook, getWebhook };