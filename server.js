import express from "express";

const app = express();
app.use(express.json());

// ===== ENV =====
const HL_ACCOUNT = process.env.HL_ACCOUNT;
const HL_PRIVATE_KEY = process.env.HL_PRIVATE_KEY;

if (!HL_ACCOUNT || !HL_PRIVATE_KEY) {
  console.error("❌ Missing ENV variables");
  process.exit(1);
}

console.log("✅ ENV OK");
console.log("👛 ACCOUNT:", HL_ACCOUNT);

// ===== HEALTHCHECK =====
app.get("/", (_, res) => {
  res.json({ status: "alive" });
});

// ===== WEBHOOK =====
app.post("/webhook", async (req, res) => {
  try {
    const { side } = req.body;

    console.log("📩 WEBHOOK:", side);

    if (side !== "long" && side !== "short") {
      return res.status(422).json({ error: "invalid payload" });
    }

    // ===== TU NORMALNIE IDZIE HYPERLIQUID =====
    // Na razie robimy STUB, żeby backend był STABILNY
    // i żeby TradingView + Render działały bez crasha

    if (side === "long") {
      console.log("🚀 EXECUTE: OPEN LONG");
    }

    if (side === "short") {
      console.log("🛑 EXECUTE: CLOSE POSITION");
    }

    // ===== ZAWSZE POPRAWNA ODPOWIEDŹ =====
    return res.json({
      status: "sent",
      side,
      account: HL_ACCOUNT,
    });

  } catch (err) {
    console.error("❌ EXECUTION ERROR:", err.message);
    return res.status(500).json({ error: "execution failed" });
  }
});

// ===== SERVER =====
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 BOT LIVE on ${PORT}`);
});
