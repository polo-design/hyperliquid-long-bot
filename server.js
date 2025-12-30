import express know import express from 'express';
import crypto from 'crypto';

const app = express();
app.use(express.json());

// ================== ENV ==================
const PRIVATE_KEY = process.env.HL_PRIVATE_KEY;
const ACCOUNT = process.env.HL_ACCOUNT;
const PORT = process.env.PORT || 10000;

if (!PRIVATE_KEY || !ACCOUNT) {
  console.error('❌ Brak HL_PRIVATE_KEY lub HL_ACCOUNT');
  process.exit(1);
}

if (!PRIVATE_KEY.startsWith('0x')) {
  console.error('❌ HL_PRIVATE_KEY musi zaczynać się od 0x');
  process.exit(1);
}

console.log('✅ ENV OK');
console.log('👛 ACCOUNT:', ACCOUNT);

// ================== HYPERLIQUID ==================
const HL_URL = 'https://api.hyperliquid.xyz/exchange';

// podpis payloadu
function signPayload(payload) {
  const msg = JSON.stringify(payload);
  const hash = crypto.createHash('sha256').update(msg).digest();
  const sig = crypto.sign(null, hash, {
    key: Buffer.from(PRIVATE_KEY.slice(2), 'hex'),
    dsaEncoding: 'ieee-p1363'
  });
  return '0x' + sig.toString('hex');
}

// wysyłka do HL
async function sendHL(payload) {
  const signature = signPayload(payload);

  const res = await fetch(HL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'HL-Account': ACCOUNT,
      'HL-Signature': signature
    },
    body: JSON.stringify(payload)
  });

  const text = await res.text();
  console.log('📥 HL RESPONSE:', text);
  return text;
}

// ================== WEBHOOK ==================
app.post('/webhook', async (req, res) => {
  try {
    const { side } = req.body;
    console.log('📩 WEBHOOK:', side);

    if (!side || !['long', 'short'].includes(side)) {
      return res.status(400).json({ error: 'side must be long or short' });
    }

    // ❗ NIE USTAWIAMY LEVERAGE
    // ❗ Hyperliquid użyje dźwigni z UI

    const orderPayload = {
      type: 'order',
      orders: [
        {
          a: 0,                    // BTC
          b: side === 'long',       // true = long, false = short
          p: null,                 // market
          s: 'ALL',                // cały dostępny margin
          r: false,
          ioc: true
        }
      ]
    };

    console.log('📤 ORDER PAYLOAD:', JSON.stringify(orderPayload, null, 2));

    const result = await sendHL(orderPayload);

    return res.json({
      success: true,
      result
    });

  } catch (err) {
    console.error('❌ ERROR:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ================== START ==================
app.listen(PORT, () => {
  console.log(`🚀 BOT LIVE on ${PORT}`);
});
