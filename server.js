import express from "express";
import crypto from "crypto";

const app = express();
app.use(express.json());

/* ===================== CONFIG ===================== */

const HL_API = "https://api.hyperliquid.xyz/exchange";
const PORT = process.env.PORT || 10000;

const PRIVATE_KEY = process.env.HL_PRIVATE_KEY;
const ACCOUNT = process.env.HL_ACCOUNT;

if (!PRIVATE_KEY || !ACCOUNT) {
  console.error("❌ Missing ENV variables");
  process.exit(1);
}

if (!PRIVATE_KEY.startsWith("0x")) {
  console.error("❌ HL_PRIVATE_KEY must start with 0x");
  process.exit(1);
}

console.log("✅ ENV OK");
console.log("👛 ACCOUNT:", ACCOUNT);

/* ===================== HELPERS ===================== */

// Hyperliquid signing (HMAC-SHA256)
function signPayload(payload) {
  const msg = JSON.stringify(payload);
  return (
    "0x" +
    crypto
      .createHmac("sha256", Buffer.from(PRIVATE_KEY.slice(2), "hex"))
      .update(msg)
      .digest("hex")
  );
}

async function sendToHL(payload) {
  const nonce = Date.now();
  const signature = signPayload({ ...payload, nonce });

  const body = {
    ...payload,
    nonce,
    signature
  };

  console.log("📤 HL PAYLOAD:", JSON.stringify(body, null, 2));

  const res = await fetch(HL_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const text = await res.text();
  console.log("📥 HL RESPONSE:", text);
  return text;
}

/* ===================== ACTIONS ===================== */

async function setLeverage10x() {
  console.log("⚙️ SET LEVERAGE 10x");

  return sendToHL({
    type: "updateLeverage",
    asset: 0,        // BTC
    leverage: 10,
    isCross: true
  });
}

async function marketLongBTC() {
  console.log("🚀 REAL ORDER: LONG");

  return sendToHL({
    type: "order",
    orders: [
      {
        a: 0,          // BTC
        b: true,       // BUY / LONG
        p: "0",        // MARKET
        s: "0.001",    // SIZE (STRING!)
        r: false,
        tif: "Ioc"
      }
    ]
  });
}

/* ===================== WEBHOOK ===================== */

app.post("/webhook", async (req, res) => {
  try {
    const { side } = req.body;

    if (!side) {
      return res.status(400).json({ error: "missing side" });
    }

    console.log("📩 WEBHOOK:", side);

    if (side === "long") {
      await setLeverage10x();
      const result = await marketLongBTC();
      return res.json({ success: true, result });
    }

    res.status(400).json({ error: "unsupported side" });
  } catch (err) {
    console.error("❌ EXECUTION ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ===================== START ===================== */

app.listen(PORT, () => {
  console.log("🚀 BOT LIVE on", PORT);
});
