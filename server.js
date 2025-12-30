import express from "express";
import crypto from "crypto";
import { ethers } from "ethers";

const app = express();
app.use(express.json());

/* ================= ENV ================= */
const ACCOUNT = process.env.HL_ACCOUNT;
const PK_RAW = process.env.HL_PRIVATE_KEY;

if (!ACCOUNT || !PK_RAW) {
  console.error("❌ Missing ENV");
  process.exit(1);
}

const wallet = new ethers.Wallet("0x" + PK_RAW);
console.log("✅ ENV OK");
console.log("👛 ACCOUNT:", wallet.address);

/* ================= CONST ================= */
const HL = "https://api.hyperliquid.xyz";
const ASSET = 0;          // BTC
const LEVERAGE = 10;
const PORT = process.env.PORT || 10000;

/* ================= SIGN ================= */
function sign(action, nonce) {
  const msg = JSON.stringify({ action, nonce });
  const hash = crypto.createHash("sha256").update(msg).digest();
  return wallet.signMessage(hash);
}

/* ================= HL CALL ================= */
async function callHL(action) {
  const nonce = Date.now();
  const signature = await sign(action, nonce);

  const body = {
    action,
    nonce,
    signature,
    account: wallet.address,
  };

  console.log("📤 HL BODY:", JSON.stringify(body, null, 2));

  const res = await fetch(`${HL}/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  console.log("📥 HL RESPONSE:", text);
  return text;
}

/* ================= HELPERS ================= */
async function getMarkPrice() {
  const res = await fetch(`${HL}/info`);
  const data = await res.json();
  return Number(data.markPx[ASSET]);
}

async function setLeverage() {
  return callHL([
    {
      type: "updateLeverage",
      asset: ASSET,
      leverage: LEVERAGE,
      isCross: true,
    },
  ]);
}

async function placeOrder(side) {
  const isBuy = side === "long";
  const price = await getMarkPrice();

  // minimalny size – HL sam użyje marginu
  const size = 0.001;

  return callHL([
    {
      type: "order",
      orders: [
        {
          a: ASSET,
          b: isBuy,
          p: price,
          s: size,
          r: false,
          ioc: true,
        },
      ],
    },
  ]);
}

/* ================= WEBHOOK ================= */
app.post("/webhook", async (req, res) => {
  try {
    const { side } = req.body;
    if (!["long", "short"].includes(side)) {
      return res.status(400).json({ error: "bad payload" });
    }

    console.log("📩 WEBHOOK:", side);

    await setLeverage();
    const result = await placeOrder(side);

    res.json({ success: true, result });
  } catch (e) {
    console.error("❌ ERROR:", e);
    res.status(500).json({ error: e.message });
  }
});

/* ================= START ================= */
app.listen(PORT, () => {
  console.log("🚀 BOT LIVE on", PORT);
});
