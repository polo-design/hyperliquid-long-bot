import express from "express";
import { Wallet } from "ethers";
import { Exchange } from "@hyperliquid/sdk";

const app = express();
app.use(express.json());

/* =====================
   CONFIG
===================== */
const PRIVATE_KEY = process.env.HL_PRIVATE_KEY;
const WALLET_ADDR = process.env.HL_WALLET;

if (!PRIVATE_KEY || !WALLET_ADDR) {
  throw new Error("❌ Missing HL_PRIVATE_KEY or HL_WALLET");
}

const wallet = new Wallet(PRIVATE_KEY);
const exchange = new Exchange(wallet, "mainnet");

const SYMBOL = "BTC";
const TRADE_PERCENT = 0.9; // 90%

/* =====================
   HELPERS
===================== */
async function getAccountValue() {
  const state = await exchange.info.userState(WALLET_ADDR);
  return Number(state.marginSummary.accountValue);
}

async function openLong() {
  const accountValue = await getAccountValue();
  const usdSize = accountValue * TRADE_PERCENT;

  console.log("🟢 OPEN LONG", usdSize, "USD");

  return exchange.order({
    coin: SYMBOL,
    isBuy: true,
    sz: usdSize,
    orderType: { market: {} },
    reduceOnly: false,
  });
}

async function closePosition() {
  console.log("🔴 CLOSE POSITION (ALL)");

  return exchange.order({
    coin: SYMBOL,
    isBuy: false,
    sz: 0,
    orderType: { market: {} },
    reduceOnly: true,
  });
}

/* =====================
   WEBHOOK
===================== */
app.post("/webhook", async (req, res) => {
  try {
    const { side } = req.body;

    if (side !== "long" && side !== "short") {
      return res.status(422).json({ error: "invalid payload" });
    }

    if (side === "long") {
      const result = await openLong();
      return res.json({ status: "LONG OPENED", result });
    }

    if (side === "short") {
      const result = await closePosition();
      return res.json({ status: "POSITION CLOSED", result });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});

app.get("/", (_, res) => res.json({ status: "alive" }));

app.listen(10000, () => {
  console.log("🤖 BOT LIVE on 10000");
});
