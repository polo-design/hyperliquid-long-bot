import express from "express";
import crypto from "crypto";
import { Wallet } from "ethers";

const app = express();
app.use(express.json());

// =====================
// ENV
// =====================
const PRIVATE_KEY = process.env.HL_PRIVATE_KEY;
const ACCOUNT = process.env.HL_ACCOUNT;
const PORT = process.env.PORT || 10000;

if (!PRIVATE_KEY || !ACCOUNT) {
  console.error("❌ Missing ENV variables");
  process.exit(1);
}
if (!PRIVATE_KEY.startsWith("0x")) {
  console.error("❌ HL_PRIVATE_KEY must start with 0x");
  process.exit(1);
}

const wallet = new Wallet(PRIVATE_KEY);

console.log("✅ ENV OK");
console.log("👛 ACCOUNT:", ACCOUNT);

// =====================
// CONSTANTS
// =====================
const HL_URL = "https://api.hyperliquid.xyz/exchange";
const BTC = 0;
const LEVERAGE = 10;
const SIZE = "0.001"; // MINIMALNY, PEWNY ROZMIAR

// =====================
// SIGN
// =====================
function sign(payload) {
  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify(payload))
    .digest();
  return wallet.signMessage(hash);
}

// =====================
// SEND
// =====================
async function send(payload) {
  const signature = await sign(payload);

  console.log("📤 HL PAYLOAD:", JSON.stringify(payload, null, 2));
  console.log("✍️ SIGNATURE:", signature);

  const res = await fetch(HL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-SIGNATURE": signature,
      "X-API-ADDRESS": ACCOUNT
    },
    body: JSON.stringify(payload)
  });

  const text = await res.text();
  console.log("📥 HL RESPONSE:", text);
  return text;
}

// =====================
// WEBHOOK
// =====================
app.post("/webhook", async (req, res) => {
  try {
    const { side } = req.body;
    if (!["long", "short"].includes(side)) {
      return res.status(400).json({ error: "invalid side" });
    }

    console.log("📩 WEBHOOK:", side.toUpperCase());

    // 1️⃣ SET LEVERAGE
    await send({
      type: "updateLeverage",
      asset: BTC,
      leverage: LEVERAGE,
      isCross: true
    });

    // 2️⃣ REAL MARKET ORDER (POPRAWNY)
    const order = {
      type: "order",
      orders: [
        {
          a: BTC,                 // asset
          b: side === "long",     // buy / sell
          p: null,                // MARKET
          s: SIZE,                // SIZE (STRING)
          r: false,               // not reduce
          tif: "Ioc",             // REQUIRED
          cloid: crypto.randomUUID() // REQUIRED
        }
      ]
    };

    const result = await send(order);

    res.json({ success: true, result });
  } catch (e) {
    console.error("❌ ERROR:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// =====================
app.listen(PORT, () => {
  console.log(`🚀 BOT LIVE on ${PORT}`);
});
