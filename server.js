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

// =====================
// WALLET
// =====================
const wallet = new Wallet(PRIVATE_KEY);

console.log("✅ ENV OK");
console.log("👛 ACCOUNT:", ACCOUNT);

// =====================
// CONSTANTS
// =====================
const HL_ENDPOINT = "https://api.hyperliquid.xyz/exchange";
const BTC_ASSET_ID = 0;
const LEVERAGE = 10;

// =====================
// SIGN HELPER
// =====================
function signPayload(payload) {
  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify(payload))
    .digest();

  return wallet.signMessage(hash);
}

// =====================
// SEND TO HL
// =====================
async function sendToHL(payload) {
  const signature = await signPayload(payload);

  console.log("📤 HL PAYLOAD:", JSON.stringify(payload, null, 2));
  console.log("✍️ SIGNATURE:", signature);

  const res = await fetch(HL_ENDPOINT, {
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
    if (!side || !["long", "short"].includes(side)) {
      return res.status(400).json({ error: "invalid payload" });
    }

    console.log("📩 WEBHOOK:", side.toUpperCase());

    // =====================
    // SET LEVERAGE
    // =====================
    console.log(`⚙️ SET LEVERAGE ${LEVERAGE}x`);

    await sendToHL({
      type: "updateLeverage",
      asset: BTC_ASSET_ID,
      leverage: LEVERAGE,
      isCross: true
    });

    // =====================
    // REAL ORDER (FIXED)
    // =====================
    console.log("🚀 REAL ORDER:", side.toUpperCase());

    const orderPayload = {
      type: "order",
      orders: [
        {
          a: BTC_ASSET_ID,
          b: side === "long",
          p: "0",          // MARKET
          s: "0.001",      // minimal size (działa zawsze)
          r: false,
          tif: "Ioc"       // <<< KLUCZOWE (NAPRAWIA DESERIALIZE)
        }
      ]
    };

    const result = await sendToHL(orderPayload);

    res.json({
      success: true,
      result
    });
  } catch (err) {
    console.error("❌ EXECUTION ERROR:", err.message);
    res.status(500).json({ error: "execution failed", details: err.message });
  }
});

// =====================
// START
// =====================
app.listen(PORT, () => {
  console.log(`🚀 BOT LIVE on ${PORT}`);
});
