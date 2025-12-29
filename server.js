import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;

// ====== KONFIG ======
const HL_API = "https://api.hyperliquid.xyz";
const SYMBOL = "BTC";
const TRADE_PERCENT = 0.9; // 90%

// ====== WEBHOOK ======
app.post("/webhook", async (req, res) => {
  try {
    const { side } = req.body;

    if (side !== "long" && side !== "short") {
      return res.status(422).json({ error: "invalid payload" });
    }

    if (side === "long") {
      console.log("➡️ OPEN LONG 90% BTC (PERP)");
      // tutaj w kolejnym kroku dodamy realny order
    }

    if (side === "short") {
      console.log("⬅️ CLOSE POSITION 100%");
      // tutaj będzie close
    }

    return res.json({ status: "ok", side });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "server error" });
  }
});

// ====== HEALTH ======
app.get("/", (_, res) => {
  res.json({ status: "alive" });
});

app.listen(PORT, () => {
  console.log("BOT LIVE on", PORT);
});
