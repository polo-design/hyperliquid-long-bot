import express from "express";

const app = express();
app.use(express.json());

const HL_API = "https://api.hyperliquid.xyz";
const SYMBOL = "BTC";
const TRADE_PERCENT = 0.9;

// =========================
// ENV
// =========================
const WALLET = process.env.HL_WALLET;
const PRIVATE_KEY = process.env.HL_PRIVATE_KEY;

if (!WALLET || !PRIVATE_KEY) {
  console.error("❌ Missing ENV variables");
  process.exit(1);
}

// =========================
// HELPERS
// =========================
async function hlInfo(body) {
  const res = await fetch(`${HL_API}/info`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function hlExchange(body) {
  const res = await fetch(`${HL_API}/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

// =========================
// STATE
// =========================
async function getUserState() {
  return hlInfo({
    type: "userState",
    user: WALLET,
  });
}

function getOpenPosition(state) {
  return state.assetPositions?.find(
    (p) => p.position && p.position.szi !== "0"
  );
}

// =========================
// ACTIONS
// =========================
async function openLong() {
  const state = await getUserState();
  const pos = getOpenPosition(state);

  if (pos) {
    return { status: "ignored", reason: "position already open" };
  }

  const equity = Number(state.marginSummary.accountValue);
  const notional = equity * TRADE_PERCENT;

  const res = await hlExchange({
    type: "order",
    orders: [
      {
        asset: SYMBOL,
        isBuy: true,
        reduceOnly: false,
        orderType: { market: {} },
        sz: notional.toFixed(2),
      },
    ],
  });

  return { status: "long_sent", res };
}

async function closePosition() {
  const state = await getUserState();
  const pos = getOpenPosition(state);

  if (!pos) {
    return { status: "ignored", reason: "no open position" };
  }

  const res = await hlExchange({
    type: "order",
    orders: [
      {
        asset: SYMBOL,
        isBuy: false,
        reduceOnly: true,
        orderType: { market: {} },
        sz: "100%",
      },
    ],
  });

  return { status: "closed", res };
}

// =========================
// WEBHOOK
// =========================
app.post("/webhook", async (req, res) => {
  try {
    const { side } = req.body;

    if (side === "long") {
      const r = await openLong();
      return res.json(r);
    }

    if (side === "short") {
      const r = await closePosition();
      return res.json(r);
    }

    return res.status(422).json({ error: "invalid payload" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "execution failed" });
  }
});

app.get("/", (_, res) => res.json({ status: "alive" }));

app.listen(10000, () => {
  console.log("✅ BOT LIVE on 10000");
});
