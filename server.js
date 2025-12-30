import express from "express";
import { Wallet } from "ethers";

const app = express();
app.use(express.json());

/* =======================
   ENV CHECK
======================= */
if (!process.env.PRIVATE_KEY) {
  console.error("❌ Missing PRIVATE_KEY");
  process.exit(1);
}

const wallet = new Wallet(process.env.PRIVATE_KEY);
console.log("✅ ETH ACCOUNT:", wallet.address);

/* =======================
   HYPERLIQUID CONFIG
======================= */
const API_URL = "https://api.hyperliquid.xyz/exchange";
const SYMBOL = "BTC";
const LEVERAGE = 1; // real leverage is account-side

/* =======================
   HELPERS
======================= */
async function hlRequest(payload) {
  const body = JSON.stringify(payload);
  const signature = await wallet.signMessage(body);

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "HX-SIGNATURE": signature,
      "HX-ADDRESS": wallet.address
    },
    body
  });

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(text);
  }
}

/* =======================
   GET BALANCE
======================= */
async function getUsdcBalance() {
  const data = await hlRequest({
    type: "accountState"
  });

  const usdc = data?.balances?.find(b => b.coin === "USDC");
  return usdc ? Number(usdc.total) : 0;
}

/* =======================
   GET PRICE
======================= */
async function getBtcPrice() {
  const res = await fetch("https://api.hyperliquid.xyz/info", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "allMids" })
  });

  const data = await res.json();
  return Number(data[SYMBOL]);
}

/* =======================
   PLACE ORDER
======================= */
async function placeOrder(side) {
  const balance = await getUsdcBalance();
  if (balance <= 0) throw new Error("No USDC balance");

  const price = await getBtcPrice();

  // 100% balance
  const size = (balance * LEVERAGE) / price;

  console.log(`📊 Balance: ${balance} USDC`);
  console.log(`📈 BTC price: ${price}`);
  console.log(`📦 Size: ${size}`);

  return hlRequest({
    type: "order",
    orders: [
      {
        coin: SYMBOL,
        isBuy: side === "long",
        sz: size,
        limitPx: price,
        orderType: "market",
        reduceOnly: false
      }
    ]
  });
}

/* =======================
   WEBHOOK
======================= */
app.post("/webhook", async (req, res) => {
  try {
    const { side } = req.body;

    if (side !== "long" && side !== "short") {
      return res.status(400).json({ error: "invalid payload" });
    }

    console.log("📩 WEBHOOK:", side);
    const result = await placeOrder(side);
    res.json({ status: "ok", result });

  } catch (err) {
    console.error("❌ EXECUTION ERROR:", err.message);
    res.status(500).json({ error: "execution failed" });
  }
});

/* =======================
   START
======================= */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 BOT LIVE on ${PORT}`);
});
