import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// =======================
// CONFIG (ENV NA RENDERZE)
// =======================
const HL_API = "https://api.hyperliquid.xyz";
const WALLET = process.env.HL_WALLET;        // 0x...
const PRIVATE_KEY = process.env.HL_PRIVATE_KEY; // hex (bez 0x)
const TRADE_PERCENT = 0.9; // 90%
const SYMBOL = "BTC";

// =======================
// UTILS
// =======================
function now() {
  return Date.now();
}

async function hlInfo(body) {
  const r = await fetch(`${HL_API}/info`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

async function hlExchange(body) {
  const r = await fetch(`${HL_API}/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

// =======================
// BALANCE
// =======================
async function getAccountValue() {
  const state = await hlInfo({
    type: "userState",
    user: WALLET,
  });

  if (!state?.marginSummary?.accountValue) {
    throw new Error("Cannot read account value");
  }

  return Number(state.marginSummary.accountValue);
}

// =======================
// ORDERS
// =======================
async function openLong() {
  const accountValue = await getAccountValue();
  const notional = accountValue * TRADE_PERCENT;

  console.log("ACCOUNT VALUE:", accountValue);
  console.log("OPEN LONG NOTIONAL:", notional);

  const order = {
    type: "order",
    orders: [
      {
        asset: SYMBOL,
        isBuy: true,
        reduceOnly: false,
        orderType: { market: {} },
        sz: notional,
      },
    ],
    nonce: now(),
  };

  return hlExchange(order);
}

async function closePosition() {
  console.log("CLOSE POSITION 100%");

  const order = {
    type: "order",
    orders: [
      {
        asset: SYMBOL,
        isBuy: false,
        reduceOnly: true,
        orderType: { market: {} },
        sz: "ALL",
      },
    ],
    nonce: now(),
  };

  return hlExchange(order);
}

// =======================
// WEBHOOK
// =======================
app.post("/webhook", async (req, res) => {
  try {
    const { side } = req.body;

    if (side !== "long" && side !== "short") {
      return res.status(422).json({ error: "invalid payload" });
    }

    console.log("WEBHOOK RECEIVED:", side);

    if (side === "long") {
      const result = await openLong();
      console.log("LONG RESULT:", result);
      return res.json({ status: "sent", side: "long" });
    }

    if (side === "short") {
      const result = await closePosition();
      console.log("CLOSE RESULT:", result);
      return res.json({ status: "sent", side: "short" });
    }
  } catch (err) {
    console.error("EXECUTION ERROR:", err.message);
    return res.status(500).json({ error: "execution failed" });
  }
});

// =======================
// HEALTH
// =======================
app.get("/", (_, res) => {
  res.json({ status: "alive" });
});

// =======================
// START
// =======================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("BOT LIVE on", PORT);
});
