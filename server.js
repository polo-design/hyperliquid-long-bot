/**
 * FINAL Hyperliquid Webhook Bot
 * - Node 18+/22 (native fetch)
 * - REAL orders (limit-as-market)
 * - 100% balance
 * - FULL DEBUG
 *
 * ENV REQUIRED:
 *  PRIVATE_KEY=0xabc... (ETH private key, JEDNO 0x)
 *  ACCOUNT=0xabc...     (ETH address)
 */

import express from "express";
import crypto from "crypto";
import { Wallet } from "ethers";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;
const HL_URL = "https://api.hyperliquid.xyz";

// ================== ENV CHECK ==================
const { PRIVATE_KEY, ACCOUNT } = process.env;

if (!PRIVATE_KEY || !ACCOUNT) {
  console.error("❌ Missing ENV variables");
  process.exit(1);
}

if (PRIVATE_KEY.startsWith("0x0x")) {
  console.error("❌ PRIVATE_KEY has double 0x");
  process.exit(1);
}

const wallet = new Wallet(PRIVATE_KEY);
console.log("✅ ENV OK");
console.log("👛 ACCOUNT:", ACCOUNT);

// ================== HELPERS ==================
async function postHL(path, body) {
  const res = await fetch(HL_URL + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("HL NON-JSON RESPONSE: " + text);
  }
}

function sign(payload) {
  const msg = JSON.stringify(payload);
  return wallet.signMessage(msg);
}

// ================== HL DATA ==================
async function getBalance() {
  const res = await postHL("/info", {
    type: "clearinghouseState",
    user: ACCOUNT,
  });

  const usdc = Number(res?.marginSummary?.accountValue || 0);
  console.log("💰 BALANCE USDC:", usdc);
  return usdc;
}

async function getMid() {
  const res = await postHL("/info", { type: "allMids" });
  const mid = Number(res?.BTC);
  if (!mid) throw new Error("No BTC mid price");
  console.log("📈 BTC MID:", mid);
  return mid;
}

// ================== REAL ORDER ==================
async function placeOrder(side) {
  console.log("🚀 REAL ORDER:", side);

  const balance = await getBalance();
  if (balance < 5) throw new Error("Balance too low");

  const mid = await getMid();

  const limitPx =
    side === "long"
      ? (mid * 1.05).toFixed(2)
      : (mid * 0.95).toFixed(2);

  const nonce = Date.now();

  const action = {
    type: "order",
    orders: [
      {
        coin: "BTC",
        isBuy: side === "long",
        sz: balance,          // 100% balance
        limitPx,              // ❗ NEVER NULL
        reduceOnly: false,
        orderType: "limit",   // ❗ limit-as-market
      },
    ],
  };

  const payload = { action, nonce };
  const signature = await sign(payload);

  console.log("📤 PAYLOAD:", JSON.stringify(payload, null, 2));
  console.log("✍️ SIGNATURE:", signature);

  const res = await postHL("/exchange", {
    ...payload,
    signature,
  });

  console.log("📥 HL RESPONSE:", JSON.stringify(res, null, 2));
  return res;
}

// ================== WEBHOOK ==================
app.post("/webhook", async (req, res) => {
  try {
    const { side } = req.body;
    console.log("📩 WEBHOOK:", req.body);

    if (side !== "long" && side !== "short") {
      return res.status(400).json({ error: "invalid payload" });
    }

    const result = await placeOrder(side);
    res.json({ success: true, result });
  } catch (e) {
    console.error("❌ EXECUTION ERROR:", e.message || e);
    res.status(500).json({
      error: "execution failed",
      details: e.message || String(e),
    });
  }
});

// ================== START ==================
app.listen(PORT, () => {
  console.log(`🚀 BOT LIVE on ${PORT}`);
});
