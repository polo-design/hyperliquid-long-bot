import express from "express";
import fetch from "node-fetch";
import { Wallet } from "ethers";

const app = express();
app.use(express.json());

/* ===================== CONFIG ===================== */

const PRIVATE_KEY = process.env.PRIVATE_KEY; // BEZ "0x0x"
if (!PRIVATE_KEY) {
  console.error("❌ Missing PRIVATE_KEY");
  process.exit(1);
}

const wallet = new Wallet(PRIVATE_KEY);
const ACCOUNT = wallet.address.toLowerCase();

console.log("✅ETH ACCOUNT:", ACCOUNT);

/* ===================== HELPERS ===================== */

async function hlRequest(body) {
  const res = await fetch("https://api.hyperliquid.xyz/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(text);
  }
}

/* ===================== ACCOUNT ===================== */

async function getAccountState() {
  return hlRequest({
    type: "accountState",
    user: ACCOUNT,
  });
}

async function getMidPrice() {
  const res = await hlRequest({ type: "allMids" });
  return Number(res["BTC-USDC"]);
}

/* ===================== ORDER ===================== */

async function openLong100() {
  const state = await getAccountState();
  const usdc = Number(state.marginSummary.accountValue);

  if (usdc <= 0) throw new Error("NO BALANCE");

  const price = await getMidPrice();
  const size = Number((usdc / price).toFixed(6));

  console.log("USDC:", usdc);
  console.log("BTC SIZE:", size);

  const nonce = Date.now();

  const action = {
    type: "order",
    orders: [
      {
        asset: "BTC-USDC",
        isBuy: true,
        sz: size,
        limitPx: price * 1.01,
        orderType: "limit",
        reduceOnly: false,
        tif: "Gtc",
      },
    ],
  };

  const signature = await wallet.signMessage(
    JSON.stringify({ action, nonce })
  );

  return hlRequest({
    action,
    nonce,
    signature,
    user: ACCOUNT,
  });
}

/* ===================== WEBHOOK ===================== */

app.post("/webhook", async (req, res) => {
  try {
    const { side } = req.body;

    if (side !== "long") {
      return res.status(422).json({ error: "invalid payload" });
    }

    console.log("📩 WEBHOOK:", side);

    const result = await openLong100();

    console.log("✅ ORDER SENT");
    return res.json({ status: "ok", result });
  } catch (err) {
    console.error("❌ EXECUTION ERROR:", err.message);
    return res.status(500).json({ error: "execution failed" });
  }
});

app.get("/", (_, res) => res.json({ status: "alive" }));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("🚀 BOT LIVE on", PORT);
});
