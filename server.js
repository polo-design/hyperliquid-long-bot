import express from "express";
import crypto from "crypto";

const app = express();
app.use(express.json());

const HL_API = "https://api.hyperliquid.xyz";
const WALLET = process.env.HL_WALLET;
const PRIVATE_KEY = process.env.HL_PRIVATE_KEY;
const TRADE_PERCENT = 0.9;

// ===== SIGN =====
function sign(payload) {
  return crypto
    .createHmac("sha256", Buffer.from(PRIVATE_KEY, "hex"))
    .update(payload)
    .digest("hex");
}

// ===== POST =====
async function hlPost(body) {
  body.nonce = Date.now();
  const payload = JSON.stringify(body);

  const res = await fetch(HL_API + "/exchange", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Wallet": WALLET,
      "X-Signature": sign(payload),
    },
    body: payload,
  });

  return res.json();
}

// ===== BALANCE =====
async function getBalance() {
  const res = await fetch(HL_API + "/info", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "userState",
      wallet: WALLET,
    }),
  });

  const data = await res.json();
  return Number(data.marginSummary.accountValue);
}

// ===== ORDERS =====
async function openLong() {
  const balance = await getBalance();
  const notional = balance * TRADE_PERCENT;

  return hlPost({
    type: "order",
    orders: [{
      asset: "BTC",
      isBuy: true,
      reduceOnly: false,
      orderType: { market: {} },
      sz: notional,
    }],
  });
}

async function closeAll() {
  return hlPost({
    type: "order",
    orders: [{
      asset: "BTC",
      isBuy: false,
      reduceOnly: true,
      orderType: { market: {} },
      sz: "ALL",
    }],
  });
}

// ===== WEBHOOK =====
app.post("/webhook", async (req, res) => {
  const { side } = req.body;

  try {
    if (side === "long") {
      const r = await openLong();
      return res.json({ status: "LONG OPENED", r });
    }

    if (side === "short") {
      const r = await closeAll();
      return res.json({ status: "POSITION CLOSED", r });
    }

    return res.status(422).json({ error: "invalid payload" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "execution failed" });
  }
});

app.get("/", (_, res) => res.json({ status: "alive" }));

app.listen(10000, () => {
  console.log("🚀 REAL BOT LIVE");
});
