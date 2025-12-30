import express from "express";
import { Wallet } from "ethers";

const app = express();
app.use(express.json());

/* ================= CONFIG ================= */

const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) {
  console.error("❌ Missing PRIVATE_KEY");
  process.exit(1);
}

const wallet = new Wallet(PRIVATE_KEY);
const ACCOUNT = wallet.address.toLowerCase();

console.log("✅ ETH ACCOUNT:", ACCOUNT);

/* ================= FETCH ================= */

async function hl(body) {
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

/* ================= DATA ================= */

async function getAccountValue() {
  const r = await hl({ type: "accountState", user: ACCOUNT });
  return Number(r.marginSummary.accountValue);
}

async function getPrice() {
  const r = await hl({ type: "allMids" });
  return Number(r["BTC-USDC"]);
}

/* ================= ORDER ================= */

async function openLong100() {
  const usdc = await getAccountValue();
  if (usdc <= 0) throw new Error("NO BALANCE");

  const price = await getPrice();
  const size = Number((usdc / price).toFixed(6));

  console.log("💰 USDC:", usdc);
  console.log("📦 BTC SIZE:", size);

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
        tif: "Gtc",
        reduceOnly: false,
      },
    ],
  };

  const signature = await wallet.signMessage(
    JSON.stringify({ action, nonce })
  );

  return hl({ action, nonce, signature, user: ACCOUNT });
}

/* ================= WEBHOOK ================= */

app.post("/webhook", async (req, res) => {
  try {
    if (req.body.side !== "long") {
      return res.status(422).json({ error: "invalid payload" });
    }

    console.log("📩 WEBHOOK: LONG");

    const r = await openLong100();
    return res.json({ status: "ok", r });
  } catch (e) {
    console.error("❌ EXECUTION ERROR:", e.message);
    return res.status(500).json({ error: "execution failed" });
  }
});

app.get("/", (_, res) => res.json({ status: "alive" }));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("🚀 BOT LIVE on", PORT);
});
