import express from "express";
import crypto from "crypto";
import { ethers } from "ethers";

const app = express();
app.use(express.json());

/* =======================
   ENV CHECK
======================= */
const ACCOUNT = process.env.HL_ACCOUNT;
const PRIVATE_KEY_RAW = process.env.HL_PRIVATE_KEY;

if (!ACCOUNT || !PRIVATE_KEY_RAW) {
  console.error("❌ Missing ENV variables");
  process.exit(1);
}

if (PRIVATE_KEY_RAW.startsWith("0x")) {
  console.error("❌ HL_PRIVATE_KEY MUST be WITHOUT 0x");
  process.exit(1);
}

const PRIVATE_KEY = "0x" + PRIVATE_KEY_RAW;
const wallet = new ethers.Wallet(PRIVATE_KEY);

console.log("✅ ENV OK");
console.log("👛 ACCOUNT:", wallet.address);

/* =======================
   CONSTANTS
======================= */
const HL_API = "https://api.hyperliquid.xyz";
const SYMBOL = "BTC-USDC";
const ASSET = 0;          // BTC index
const LEVERAGE = 10;      // <<< 10x
const PORT = process.env.PORT || 10000;

/* =======================
   SIGN HELPER
======================= */
function signPayload(payload) {
  const msg = JSON.stringify(payload);
  const hash = crypto.createHash("sha256").update(msg).digest("hex");
  return wallet.signMessage(ethers.getBytes("0x" + hash));
}

/* =======================
   SEND TO HL
======================= */
async function sendHL(payload) {
  const signature = await signPayload(payload);

  console.log("📤 HL PAYLOAD:", JSON.stringify(payload, null, 2));
  console.log("✍️ SIGNATURE:", signature);

  const res = await fetch(`${HL_API}/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: payload,
      signature,
      account: wallet.address,
    }),
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }

  console.log("📥 HL RESPONSE:", json);
  return json;
}

/* =======================
   SET LEVERAGE
======================= */
async function setLeverage() {
  const payload = {
    type: "updateLeverage",
    asset: ASSET,
    leverage: LEVERAGE,
    isCross: true,
  };

  console.log(`⚙️ SET LEVERAGE ${LEVERAGE}x`);
  return sendHL(payload);
}

/* =======================
   PLACE ORDER (ALL IN)
======================= */
async function placeOrder(side) {
  const isBuy = side === "long";

  const payload = {
    type: "order",
    orders: [
      {
        a: ASSET,
        b: isBuy,
        p: null,        // MARKET
        s: "ALL",       // 100% balance
        r: false,
        ioc: true,
      },
    ],
  };

  console.log("🚀 REAL ORDER:", side.toUpperCase());
  return sendHL(payload);
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

    // 1️⃣ SET LEVERAGE (required)
    await setLeverage();

    // 2️⃣ PLACE ORDER
    const result = await placeOrder(side);

    res.json({ success: true, result });
  } catch (err) {
    console.error("❌ EXECUTION ERROR:", err);
    res.status(500).json({
      error: "execution failed",
      details: err?.message || err,
    });
  }
});

/* =======================
   START
======================= */
app.listen(PORT, () => {
  console.log(`🚀 BOT LIVE on ${PORT}`);
});
