import express from "express";
import crypto from "crypto";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;

// =======================
// ENV
// =======================
const HL_ACCOUNT = process.env.HL_ACCOUNT;
const HL_PRIVATE_KEY = process.env.HL_PRIVATE_KEY;

if (!HL_ACCOUNT || !HL_PRIVATE_KEY) {
  console.error("❌ Missing ENV variables");
  process.exit(1);
}

console.log("✅ ENV OK");
console.log("👛 ACCOUNT:", HL_ACCOUNT);

// =======================
// HYPERLIQUID CONFIG
// =======================
const HL_API = "https://api.hyperliquid.xyz";

// =======================
// SIGN HELPERS
// =======================
function sign(payload) {
  return crypto
    .createHmac("sha256", Buffer.from(HL_PRIVATE_KEY, "hex"))
    .update(payload)
    .digest("hex");
}

async function hlPost(body) {
  const payload = JSON.stringify({
    ...body,
    nonce: Date.now(),
  });

  const signature = sign(payload);

  const res = await fetch(`${HL_API}/exchange`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Signature": signature,
      "X-Wallet": HL_ACCOUNT,
    },
    body: payload,
  });

  const text = await res.text();

  // 🔴 to był TWÓJ błąd wcześniej:
  // API czasem zwraca tekst, nie JSON
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(text);
  }
}

// =======================
// ORDERS
// =======================
async function openLong() {
  return hlPost({
    type: "order",
    orders: [
      {
        asset: "BTC",
        isBuy: true,
        reduceOnly: false,
        orderType: { market: {} },
        sz: "ALL",
      },
    ],
  });
}

async function closePosition() {
  return hlPost({
    type: "order",
    orders: [
      {
        asset: "BTC",
        isBuy: false,
        reduceOnly: true,
        orderType: { market: {} },
        sz: "ALL",
      },
    ],
  });
}

// =======================
// WEBHOOK
// =======================
app.post("/webhook", async (req, res) => {
  const { side } = req.body;

  console.log("📩 WEBHOOK:", side);

  try {
    if (side === "long") {
      const r = await openLong();
      return res.json({ status: "sent", side, result: r });
    }

    if (side === "short") {
      const r = await closePosition();
      return res.json({ status: "sent", side, result: r });
    }

    return res.status(400).json({ error: "invalid payload" });
  } catch (err) {
    console.error("❌ EXECUTION ERROR:", err.message);
    return res.status(500).json({ error: "execution failed" });
  }
});

app.get("/", (_, res) => {
  res.json({ status: "alive" });
});

app.listen(PORT, () => {
  console.log(`🚀 BOT LIVE on ${PORT}`);
});
