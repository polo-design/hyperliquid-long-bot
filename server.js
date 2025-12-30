import express from "express";
import crypto from "crypto";

const app = express();
app.use(express.json());

/* ================== CONFIG ================== */
const API_URL = "https://api.hyperliquid.xyz";
const SYMBOL = "BTC";
const LEVERAGE = 10; // możesz zmienić, ale 10 działa przy małym kapitale

const PRIVATE_KEY = process.env.HL_PRIVATE_KEY;
const ACCOUNT = process.env.HL_ACCOUNT;

/* ================== CHECK ENV ================== */
if (!PRIVATE_KEY || !ACCOUNT) {
  console.error("❌ Missing ENV variables");
  process.exit(1);
}

console.log("✅ ENV OK");
console.log("👛 ACCOUNT:", ACCOUNT);

/* ================== HELPERS ================== */
function sign(payload) {
  return crypto
    .createHmac("sha256", Buffer.from(PRIVATE_KEY, "hex"))
    .update(JSON.stringify(payload))
    .digest("hex");
}

async function hlFetch(endpoint, payload) {
  const sig = sign(payload);

  const res = await fetch(`${API_URL}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-HL-Signature": sig,
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(text);
  }
}

/* ================== CORE ================== */
async function getBalanceAndPrice() {
  const state = await hlFetch("/info", { type: "state" });

  const user = state.users.find(
    (u) => u.address.toLowerCase() === ACCOUNT.toLowerCase()
  );

  if (!user) throw new Error("User not found");

  const usdc = Number(user.marginSummary.accountValue);
  if (usdc <= 0) throw new Error("No balance");

  const market = state.markets.find((m) => m.name === SYMBOL);
  const price = Number(market.mid);

  return { usdc, price };
}

async function placeOrder(side) {
  const { usdc, price } = await getBalanceAndPrice();

  // size w BTC
  const size = ((usdc * LEVERAGE) / price) * 0.95;

  const payload = {
    type: "order",
    account: ACCOUNT,
    orders: [
      {
        coin: SYMBOL,
        isBuy: side === "long",
        sz: Number(size.toFixed(6)),
        limitPx: null,
        orderType: "market",
        reduceOnly: side === "short",
      },
    ],
  };

  return hlFetch("/exchange", payload);
}

/* ================== WEBHOOK ================== */
app.post("/webhook", async (req, res) => {
  const { side } = req.body;

  if (side !== "long" && side !== "short") {
    return res.status(422).json({ error: "invalid payload" });
  }

  console.log("📩 WEBHOOK:", side);

  try {
    const result = await placeOrder(side);
    console.log("✅ ORDER OK", result);
    res.json({ status: "ok", side });
  } catch (e) {
    console.error("❌ EXECUTION ERROR:", e.message);
    res.status(500).json({ error: "execution failed" });
  }
});

/* ================== START ================== */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 BOT LIVE on ${PORT}`);
});
