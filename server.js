import express from "express";
import crypto from "crypto";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const ACCOUNT = process.env.ACCOUNT_ADDRESS;

if (!PRIVATE_KEY || !ACCOUNT) {
  console.error("❌ Missing ENV variables");
  process.exit(1);
}

console.log("✅ ETH ACCOUNT:", ACCOUNT);

// ====== HELPERS ======

const API_URL = "https://api.hyperliquid.xyz";

function signPayload(payload) {
  const message = JSON.stringify(payload);
  return crypto
    .createHmac("sha256", Buffer.from(PRIVATE_KEY, "hex"))
    .update(message)
    .digest("hex");
}

async function hlFetch(endpoint, body) {
  const signature = signPayload(body);

  const res = await fetch(API_URL + endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "HL-ACCOUNT": ACCOUNT,
      "HL-SIGNATURE": signature,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(text);
  return JSON.parse(text);
}

// ====== CORE LOGIC ======

async function getBalance() {
  const data = await hlFetch("/info", {
    type: "userState",
    user: ACCOUNT,
  });

  return Number(data.marginSummary.availableMargin);
}

async function getBTCPrice() {
  const data = await hlFetch("/info", {
    type: "allMids",
  });

  return Number(data.BTC);
}

async function placeOrder(isBuy, size) {
  const order = {
    type: "order",
    orders: [
      {
        asset: "BTC",
        isBuy,
        sz: size.toFixed(6),
        limitPx: null,
        orderType: "Market",
        reduceOnly: false,
      },
    ],
  };

  return await hlFetch("/exchange", order);
}

// ====== WEBHOOK ======

app.post("/webhook", async (req, res) => {
  try {
    const { side } = req.body;

    if (!side || !["long", "short"].includes(side)) {
      return res.status(400).json({ error: "invalid payload" });
    }

    console.log("📩 WEBHOOK:", side);

    const balance = await getBalance();
    const price = await getBTCPrice();

    if (balance <= 0) throw new Error("No margin available");

    const size = balance / price; // 100% kapitału
    const isBuy = side === "long";

    const result = await placeOrder(isBuy, size);

    console.log("✅ ORDER SENT", result);
    res.json({ status: "ok", size });
  } catch (err) {
    console.error("❌ EXECUTION ERROR:", err.message);
    res.status(500).json({ error: "execution failed" });
  }
});

// ====== START ======

app.listen(PORT, () => {
  console.log(`🚀 BOT LIVE on ${PORT}`);
});
