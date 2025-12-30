import express from "express";
import crypto from "crypto";

const app = express();
app.use(express.json());

/* =======================
   ENV
======================= */
const HL_ACCOUNT = process.env.HL_ACCOUNT;
const HL_PRIVATE_KEY = process.env.HL_PRIVATE_KEY;

if (!HL_ACCOUNT || !HL_PRIVATE_KEY) {
  console.error("❌ Missing ENV variables");
  process.exit(1);
}
if (!HL_PRIVATE_KEY.startsWith("0x")) {
  console.error("❌ HL_PRIVATE_KEY must start with 0x");
  process.exit(1);
}

console.log("✅ ENV OK");
console.log("👛 ACCOUNT:", HL_ACCOUNT);

/* =======================
   CONSTANTS
======================= */
const HL_URL = "https://api.hyperliquid.xyz/exchange";
const BTC_ASSET_ID = 0; // BTC-PERP

/* =======================
   HELPERS
======================= */
function sign(payload) {
  const msg = JSON.stringify(payload);
  return (
    "0x" +
    crypto
      .createHmac("sha256", Buffer.from(HL_PRIVATE_KEY.slice(2), "hex"))
      .update(msg)
      .digest("hex")
  );
}

async function hlRequest(action) {
  const nonce = Date.now();
  const payload = { action, nonce };
  const signature = sign(payload);

  const res = await fetch(HL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, signature }),
  });

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(text);
  }
}

/* =======================
   LEVERAGE 10x (CROSS)
======================= */
async function setLeverage() {
  const action = {
    type: "updateLeverage",
    asset: BTC_ASSET_ID,
    leverage: 10,
    isCross: true,
  };

  console.log("⚙️ SET LEVERAGE 10x");
  const res = await hlRequest(action);
  console.log("📥 HL RESPONSE:", res);
  return res;
}

/* =======================
   MARKET ORDER – ALL IN
======================= */
async function placeOrder(side) {
  const isBuy = side === "long";

  const action = {
    type: "order",
    orders: [
      {
        a: BTC_ASSET_ID, // asset
        b: isBuy,        // buy=true / sell=false
        p: null,         // market
        s: "ALL",        // 100% balance
        r: false,        // reduceOnly
        ioc: true,       // market execution
      },
    ],
  };

  console.log("🚀 REAL ORDER:", side.toUpperCase());
  const res = await hlRequest(action);
  console.log("📥 HL RESPONSE:", res);
  return res;
}

/* =======================
   WEBHOOK
======================= */
app.post("/webhook", async (req, res) => {
  try {
    const { side } = req.body;
    if (!side || !["long", "short"].includes(side)) {
      return res.status(400).json({ error: "invalid payload" });
    }

    console.log("📩 WEBHOOK:", side);

    await setLeverage();
    const result = await placeOrder(side);

    res.json({ success: true, result });
  } catch (err) {
    console.error("❌ EXECUTION ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* =======================
   START
======================= */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("🚀 BOT LIVE on", PORT);
});
