import express from "express";
import { Hyperliquid } from "hyperliquid";

const PORT = process.env.PORT || 10000;
const PRIVATE_KEY = process.env.HL_PRIVATE_KEY;
const ACCOUNT = process.env.HL_ACCOUNT;

if (!PRIVATE_KEY || !PRIVATE_KEY.startsWith("0x")) {
  throw new Error("❌ HL_PRIVATE_KEY missing or invalid (must start with 0x)");
}
if (!ACCOUNT || !ACCOUNT.startsWith("0x")) {
  throw new Error("❌ HL_ACCOUNT missing or invalid");
}

// ===== INIT HL CLIENT =====
const hl = new Hyperliquid({
  privateKey: PRIVATE_KEY,
  walletAddress: ACCOUNT,
  testnet: false
});

const app = express();
app.use(express.json());

// ===== HEALTH =====
app.get("/", (_, res) => {
  res.send("HL BOT LIVE");
});

// ===== WEBHOOK =====
app.post("/webhook", async (req, res) => {
  try {
    const { side } = req.body;
    if (!side || !["long", "short"].includes(side)) {
      return res.status(400).json({ error: "side must be long or short" });
    }

    console.log("📩 WEBHOOK:", side);

    const symbol = "BTC-USDC";
    const isBuy = side === "long";

    // ===== SET LEVERAGE 10x CROSS =====
    console.log("⚙️ SET LEVERAGE 10x");
    await hl.setLeverage({
      symbol,
      leverage: 10,
      isCross: true
    });

    // ===== GET ACCOUNT STATE =====
    const state = await hl.getAccountState();
    const usdc = Number(state.withdrawable);

    if (usdc <= 1) {
      throw new Error("❌ Not enough USDC");
    }

    console.log("💰 USDC:", usdc);

    // ===== GET MARK PRICE =====
    const mid = await hl.getMidPrice(symbol);
    const price = Number(mid);

    // ===== ALL-IN SIZE (10x) =====
    const size = (usdc * 10) / price;

    console.log("📐 SIZE:", size);

    // ===== PLACE MARKET ORDER =====
    console.log("🚀 REAL ORDER:", side.toUpperCase());

    const order = await hl.placeOrder({
      symbol,
      isBuy,
      size,
      price: null,     // MARKET
      reduceOnly: false,
      ioc: true
    });

    console.log("✅ ORDER RESULT:", order);

    res.json({ success: true, order });

  } catch (err: any) {
    console.error("❌ ERROR:", err.message || err);
    res.status(500).json({ error: err.message || "execution failed" });
  }
});

// ===== START =====
app.listen(PORT, () => {
  console.log("✅ ENV OK");
  console.log("👛 ACCOUNT:", ACCOUNT);
  console.log("🚀 BOT LIVE on", PORT);
});
