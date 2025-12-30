import express from "express";
import crypto from "crypto";
import https from "https";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;

const ACCOUNT = process.env.HL_ACCOUNT;
const PRIVATE_KEY = process.env.HL_PRIVATE_KEY;

if (!ACCOUNT || !PRIVATE_KEY) {
  console.error("❌ Missing ENV");
  process.exit(1);
}

console.log("✅ ENV OK");
console.log("👛 ACCOUNT:", ACCOUNT);

/* ================= HTTPS ================= */

function postHL(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);

    const req = https.request(
      {
        hostname: "api.hyperliquid.xyz",
        path,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        let out = "";
        res.on("data", (c) => (out += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(out));
          } catch {
            reject(out);
          }
        });
      }
    );

    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

/* ================= SIGN ================= */

function sign(payload) {
  const msg = JSON.stringify(payload);
  const hash = crypto.createHash("sha256").update(msg).digest();
  return (
    "0x" +
    crypto
      .createHmac("sha256", Buffer.from(PRIVATE_KEY, "hex"))
      .update(hash)
      .digest("hex")
  );
}

/* ================= BALANCE ================= */

async function getBalance() {
  const res = await postHL("/info", {
    type: "accountState",
    user: ACCOUNT,
  });

  return Number(res?.marginSummary?.accountValue || 0);
}

/* ================= ORDER ================= */

async function placeOrder(side) {
  const balance = await getBalance();
  if (balance < 5) throw "Balance too low";

  const nonce = Date.now();

  const action = {
    type: "order",
    orders: [
      {
        coin: "BTC",
        isBuy: side === "long",
        sz: balance,      // ALL IN
        limitPx: null,    // MARKET
        reduceOnly: false,
        orderType: "market",
      },
    ],
  };

  const payload = { action, nonce };
  const signature = sign(payload);

  console.log("📤 ORDER:", payload);

  return postHL("/exchange", {
    ...payload,
    signature,
  });
}

/* ================= WEBHOOK ================= */

app.post("/webhook", async (req, res) => {
  try {
    const { side } = req.body;
    if (!["long", "short"].includes(side))
      return res.status(400).json({ error: "invalid payload" });

    const result = await placeOrder(side);
    console.log("✅ RESULT:", result);

    res.json({ success: true, result });
  } catch (e) {
    console.error("❌ ERROR:", e);
    res.status(500).json({ error: "execution failed", details: String(e) });
  }
});

/* ================= START ================= */

app.listen(PORT, () => {
  console.log("🚀 BOT LIVE on", PORT);
});
