import express from "express";
import { Wallet, keccak256, toUtf8Bytes } from "ethers";

const app = express();
app.use(express.json());

// ===== ENV =====
const {
  HL_PRIVATE_KEY,
  HL_ACCOUNT,
  PORT = 10000
} = process.env;

if (!HL_PRIVATE_KEY || !HL_ACCOUNT) {
  console.error("❌ Missing ENV variables");
  process.exit(1);
}

if (!HL_PRIVATE_KEY.startsWith("0x")) {
  console.error("❌ HL_PRIVATE_KEY must start with 0x");
  process.exit(1);
}

console.log("✅ ENV OK");
console.log("👛 ACCOUNT:", HL_ACCOUNT);

// ===== WALLET =====
const wallet = new Wallet(HL_PRIVATE_KEY);

// ===== HL CONSTANTS =====
const HL_API = "https://api.hyperliquid.xyz/exchange";
const BTC_ASSET_ID = 0;
const LEVERAGE = 10;

// ===== SIGN =====
function signPayload(payload) {
  const hash = keccak256(toUtf8Bytes(JSON.stringify(payload)));
  return wallet.signMessage(hash);
}

// ===== SEND TO HL =====
async function sendToHL(payload) {
  const signature = await signPayload(payload);

  console.log("📤 HL PAYLOAD:", JSON.stringify(payload, null, 2));
  console.log("✍️ SIGNATURE:", signature);

  const res = await fetch(HL_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: payload,
      signature,
      nonce: Date.now()
    })
  });

  const text = await res.text();
  console.log("📥 HL RESPONSE:", text);
  return text;
}

// ===== SET LEVERAGE =====
async function setLeverage() {
  const payload = {
    type: "updateLeverage",
    asset: BTC_ASSET_ID,
    leverage: LEVERAGE,
    isCross: true
  };

  console.log(`⚙️ SET LEVERAGE ${LEVERAGE}x`);
  await sendToHL(payload);
}

// ===== MARKET ORDER =====
async function marketOrder(side) {
  const isLong = side === "long";

  const payload = {
    type: "order",
    orders: [
      {
        a: BTC_ASSET_ID,
        b: isLong,          // true = long, false = short
        p: "0",             // MARKET (MUST be string)
        s: "50",            // SIZE (number as string, NOT "ALL")
        r: false,
        tif: "Ioc"          // MARKET
      }
    ]
  };

  console.log(`🚀 REAL ORDER: ${side.toUpperCase()}`);
  await sendToHL(payload);
}

// ===== WEBHOOK =====
app.post("/webhook", async (req, res) => {
  try {
    const { side } = req.body;
    console.log("📩 WEBHOOK:", side);

    if (!side || !["long", "short"].includes(side)) {
      return res.status(400).json({ error: "Invalid side" });
    }

    await setLeverage();
    await marketOrder(side);

    res.json({ success: true, side });
  } catch (err) {
    console.error("❌ EXECUTION ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ===== START =====
app.listen(PORT, () => {
  console.log(`🚀 BOT LIVE on ${PORT}`);
});
