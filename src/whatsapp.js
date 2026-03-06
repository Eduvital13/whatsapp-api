const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  initAuthCreds,
  BufferJSON
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const axios = require('axios');
const { createClient } = require('redis');
const path = require('path');

let sock = null;
let qrCodeData = null;
let connectionStatus = 'desconectado';
let webhookUrl = null;

let redisClient = null;

async function getRedis() {
  if (redisClient && redisClient.isOpen) return redisClient;
  const url = process.env.REDIS_URL;
  if (!url) {
    console.log('⚠️  REDIS_URL não definida. Usando sessão local.');
    return null;
  }
  redisClient = createClient({ url });
  redisClient.on('error', (err) => console.error('Redis erro:', err));
  await redisClient.connect();
  console.log('✅ Redis conectado!');
  return redisClient;
}

async function useRedisAuthState() {
  const redis = await getRedis();
  if (!redis) {
    const SESSION_PATH = path.join(__dirname, 'session');
    return useMultiFileAuthState(SESSION_PATH);
  }

  const KEY = 'whatsapp:session';
  let creds;
  try {
    const raw = await redis.get(`${KEY}:creds`);
    creds = raw ? JSON.parse(raw, BufferJSON.reviver) : initAuthCreds();
  } catch {
    creds = initAuthCreds();
  }

  const state = {
    creds,
    keys: {
      get: async (type, ids) => {
        const data = {};
        for (const id of ids) {
          try {
            const raw = await redis.get(`${KEY}:${type}:${id}`);
            if (raw) data[id] = JSON.parse(raw, BufferJSON.reviver);
          } catch {}
        }
        return data;
      },
      set: async (data) => {
        for (const [type, ids] of Object.entries(data)) {
          for (const [id, value] of Object.entries(ids)) {
            if (value) {
              await redis.set(`${KEY}:${type}:${id}`, JSON.stringify(value, BufferJSON.replacer));
            } else {
              await redis.del(`${KEY}:${type}:${id}`);
            }
          }
        }
      }
    }
  };

  const saveCreds = async () => {
    await redis.set(`${KEY}:creds`, JSON.stringify(state.creds, BufferJSON.replacer));
  };

  return { state, saveCreds };
}

async function startWhatsApp() {
  const { state, saveCreds } = await useRedisAuthState();
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
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
        console.log('🔒 Sessão encerrada. Escaneie o QR Code novamente.');
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

async function flushSession() {
  const redis = await getRedis();
  if (!redis) return false;
  await redis.flushAll();
  return true;
}

module.exports = { startWhatsApp, sendTextMessage, getStatus, getQRCode, setWebhook, getWebhook, flushSession };
