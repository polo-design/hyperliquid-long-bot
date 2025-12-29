import express from "express";
import WebSocket from "ws";
import crypto from "crypto";

const app = express();
app.use(express.json());

const HL_WS = "wss://api.hyperliquid.xyz/ws";
const WALLET = process.env.HL_WALLET;
const PRIVATE_KEY = Buffer.from(process.env.HL_PRIVATE_KEY, "hex");

let ws;
let ready = false;

// =======================
// CONNECT WS
// =======================
function connect() {
  ws = new WebSocket(HL_WS);

  ws.on("open", () => {
    console.log("✅ WS CONNECTED");
    ready = true;
  });

  ws.on("message", (msg) => {
    // debug (opcjonalne)
    // console.log("WS:", msg.toString());
  });

  ws.on("close", () => {
    console.log("❌ WS CLOSED – reconnecting...");
    ready = false;
    setTimeout(connect, 2000);
  });
}

connect();

// =======================
// SIGN
// =======================
function sign(payload) {
  return crypto
    .createHmac("sha256", PRIVATE_KEY)
    .update(payload)
    .digest("hex");
}

// =======================
// SEND ORDER
// =======================
function sendOrder(isBuy, reduceOnly) {
  if (!ready) throw new Error("WS not ready");

  const action = {
    type: "order",
    orders: [{
      asset: "BTC",
      isBuy,
      reduceOnly,
      orderType: { market: {} },
      sz: "ALL", // HL interpretuje ALL poprawnie
    }]
  };

  const payload = JSON.stringify(action);
  const signature = sign(payload);

  ws.send(JSON.stringify({
    method: "post",
    id: Date.now(),
    payload: action,
    signature,
    wallet: WALLET
  }));
}

// =======================
// WEBHOOK
// =======================
app.post("/webhook", (req, res) => {
  try {
    const { side } = req.body;

    if (side === "long") {
      sendOrder(true, false); // open
    } else if (side === "short") {
      sendOrder(false, true); // close
    } else {
      return res.status(422).json({ error: "invalid payload" });
    }

    res.json({ status: "sent", side });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "execution failed" });
  }
});

app.get("/", (_, res) => res.json({ status: "alive" }));

app.listen(10000, () => console.log("🚀 BOT LIVE on 10000"));
