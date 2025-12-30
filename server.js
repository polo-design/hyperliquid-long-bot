import express from "express";
import bodyParser from "body-parser";
import crypto from "crypto";

// ================= CONFIG =================
const PORT = process.env.PORT || 10000;
const PRIVATE_KEY = process.env.PRIVATE_KEY; // BEZ "0x0x", tylko 0x + hex
const ACCOUNT = process.env.ACCOUNT;         // 0x...
const SYMBOL = "BTC";                         // BTC-PERP
const LEVERAGE = 1;                           // możesz zmienić
const BASE_URL = "https://api.hyperliquid.xyz";

// ================= SANITY CHECK =================
if (!PRIVATE_KEY || !ACCOUNT) {
  console.error("❌ Missing ENV variables");
  process.exit(1);
}

console.log("✅ ENV OK");
console.log("👛 ACCOUNT:", ACCOUNT);

// ================= HELPERS =================
function signMessage(message) {
  return crypto
    .createHmac("sha256", Buffer.from(PRIVATE_KEY.replace(/^0x/, ""), "hex"))
    .update(message)
    .digest("hex");
}

async function hlRequest(endpoint, payload) {
  const body = JSON.stringify(payload);
  const signature = signMessage(body);

  console.log("➡️ REQUEST", endpoint);
  console.log("➡️ PAYLOAD", payload);

  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "HL-Account": ACCOUNT,
      "HL-Signature": signature,
    },
    body,
  });

  const text = await res.text();

  try {
    const json = JSON.parse(text);
    console.log("⬅️ RESPONSE", json);
    return json;
  } catch {
    console.error("❌ NON-JSON RESPONSE:", text);
    throw new Error("Invalid response");
  }
}

// ================= HYPERLIQUID CALLS =================
async function getBalance() {
  const res = await hlRequest("/info", {
    type: "accountState",
    user: ACCOUNT,
  });

  const usdc = Number(res.marginSummary?.accountValue || 0);
  console.log("💰 BALANCE USDC:", usdc);
  return usdc;
}

async function getPrice() {
  const res = await hlRequest("/info", { type: "allMids" });
  const price = Number(res[`${SYMBOL}`]);
  console.log("📈 PRICE:", price);
  return price;
}

async function placeOrder(side) {
  const balance = await getBalance();
  if (balance <= 0) throw new Error("No balance");

  const price = await getPrice();
  const size = (balance * LEVERAGE) / price;

  console.log("🧮 SIZE:", size);

  const order = {
    type: "order",
    orders: [
      {
        a: SYMBOL,
        b: side === "long",
        p: price,
        s: size,
        r: false,
      },
    ],
  };

  return await hlRequest("/exchange", order);
}

// ================= SERVER =================
const app = express();
app.use(bodyParser.json());

app.post("/webhook", async (req, res) => {
  try {
    console.log("📩 WEBHOOK:", req.body);

    const { side } = req.body;
    if (!side || !["long", "short"].includes(side)) {
      return res.status(400).json({ error: "invalid payload" });
    }

    const result = await placeOrder(side);
    res.json({ status: "ok", result });
  } catch (err) {
    console.error("❌ EXECUTION ERROR:", err.message);
    res.status(500).json({ error: "execution failed" });
  }
});

app.get("/", (_, res) => res.send("BOT ONLINE"));

app.listen(PORT, () => {
  console.log(`🚀 BOT LIVE on ${PORT}`);
});
