import express from "express";
import { ethers } from "ethers";

const app = express();
app.use(express.json());

/* =========================
   ENV – MUSZĄ ISTNIEĆ
========================= */
const ACCOUNT = process.env.HL_ACCOUNT;
const PRIVATE_KEY = process.env.HL_PRIVATE_KEY;

if (!ACCOUNT || !PRIVATE_KEY) {
  console.error("❌ Missing ENV variables");
  process.exit(1);
}

console.log("✅ ENV OK");
console.log("👛 ACCOUNT:", ACCOUNT);

/* =========================
   CONSTANTS
========================= */
const API = "https://api.hyperliquid.xyz";
const SYMBOL = "BTC";
const PORT = process.env.PORT || 10000;

/* =========================
   SIGNER
========================= */
const wallet = new ethers.Wallet("0x" + PRIVATE_KEY);

function sign(body) {
  const msg = JSON.stringify(body);
  return wallet.signMessage(msg);
}

/* =========================
   API CALL
========================= */
async function hlPost(body) {
  const signature = await sign(body);

  const res = await fetch(API + "/exchange", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "HL-Signature": signature,
      "HL-Account": ACCOUNT
    },
    body: JSON.stringify(body)
  });

  const text = await res.text();

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(text);
  }
}

/* =========================
   GET BALANCE (USDC)
========================= */
async function getBalance() {
  const res = await fetch(API + "/info", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "userState",
      user: ACCOUNT
    })
  });

  const data = await res.json();

  const usdc = Number(data.marginSummary?.accountValue || 0);

  if (usdc <= 0) throw new Error("Balance = 0");

  return usdc;
}

/* =========================
   OPEN LONG – 100% BALANCE
========================= */
async function openLong() {
  const balance = await getBalance();

  const order = {
    type: "order",
    orders: [
      {
        asset: SYMBOL,
        isBuy: true,
        reduceOnly: false,
        orderType: { market: {} },
        sz: balance
      }
    ]
  };

  return hlPost(order);
}

/* =========================
   CLOSE POSITION – 100%
========================= */
async function closeAll() {
  const order = {
    type: "order",
    orders: [
      {
        asset: SYMBOL,
        isBuy: false,
        reduceOnly: true,
        orderType: { market: {} },
        sz: "ALL"
      }
    ]
  };

  return hlPost(order);
}

/* =========================
   WEBHOOK
========================= */
app.post("/webhook", async (req, res) => {
  const { side } = req.body;

  console.log("📩 WEBHOOK:", side);

  try {
    if (side === "long") {
      const r = await openLong();
      return res.json({ status: "LONG OPENED", result: r });
    }

    if (side === "short") {
      const r = await closeAll();
      return res.json({ status: "POSITION CLOSED", result: r });
    }

    return res.status(400).json({ error: "invalid payload" });

  } catch (e) {
    console.error("❌ EXECUTION ERROR:", e.message);
    return res.status(500).json({ error: "execution failed" });
  }
});

/* =========================
   HEALTH
========================= */
app.get("/", (_, res) => {
  res.json({ status: "alive" });
});

/* =========================
   START
========================= */
app.listen(PORT, () => {
  console.log("🚀 BOT LIVE on", PORT);
});
