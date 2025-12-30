import express from "express";
import { Hyperliquid } from "hyperliquid-sdk";

const app = express();
app.use(express.json());

/* ================= ENV ================= */
const PRIVATE_KEY = process.env.HL_PRIVATE_KEY;
const ACCOUNT = process.env.HL_ACCOUNT;

if (!PRIVATE_KEY || !ACCOUNT) {
  console.error("❌ Missing ENV variables");
  process.exit(1);
}

console.log("✅ ENV OK");
console.log("👛 ACCOUNT:", ACCOUNT);

/* ================= HL CLIENT ================= */
const hl = new Hyperliquid({
  privateKey: PRIVATE_KEY,
  account: ACCOUNT,
  isTestnet: false, // MAINNET
});

/* ================= HELPERS ================= */
async function getAvailableUSDC() {
  const state = await hl.getAccountState();
  return Number(state.availableBalance);
}

async function getBTCPrice() {
  const px = await hl.getMarkPrice("BTC");
  return Number(px);
}

/* ================= WEBHOOK ================= */
app.post("/webhook", async (req, res) => {
  try {
    const { side } = req.body;
    console.log("📩 WEBHOOK:", side);

    if (side !== "long" && side !== "short") {
      return res.status(422).json({ error: "invalid payload" });
    }

    const usdc = await getAvailableUSDC();
    if (usdc <= 1) {
      throw new Error("Balance too low");
    }

    const price = await getBTCPrice();
    const size = Number((usdc / price).toFixed(4)); // BTC size

    if (side === "long") {
      await hl.placeOrder({
        coin: "BTC",
        isBuy: true,
        size,
        limitPrice: price,
        reduceOnly: false,
      });

      console.log(`🚀 LONG BTC | size=${size}`);
    }

    if (side === "short") {
      await hl.placeOrder({
        coin: "BTC",
        isBuy: false,
        size: 999,
        reduceOnly: true,
      });

      console.log("🔻 CLOSE POSITION");
    }

    res.json({ status: "ok", side, size });
  } catch (err) {
    console.error("❌ EXECUTION ERROR:", err.message);
    res.status(500).json({ error: "execution failed", msg: err.message });
  }
});

/* ================= HEALTH ================= */
app.get("/", (_, res) => res.json({ status: "alive" }));

/* ================= START ================= */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 BOT LIVE on ${PORT}`);
});
