import os
from fastapi import FastAPI, Request, HTTPException
from hyperliquid.exchange import Exchange
from hyperliquid.info import Info

# ================== ENV ==================
HL_ACCOUNT = os.environ["HL_ACCOUNT"]
HL_PRIVATE_KEY = os.environ["HL_PRIVATE_KEY"]
WEBHOOK_SECRET = os.environ["WEBHOOK_SECRET"]

SYMBOL = "BTC-USDC"
CAPITAL_PCT = 0.90  # 90% kapitału

# ================== APP ==================
app = FastAPI()

# ================== HL CLIENT ==================
exchange = Exchange(HL_ACCOUNT, HL_PRIVATE_KEY)
info = Info()

# ================== HEALTH ==================
@app.get("/")
def health():
    return {"status": "ok"}

# ================== WEBHOOK ==================
@app.post("/webhook")
async def webhook(req: Request):
    data = await req.json()

    # --- security ---
    if data.get("secret") != WEBHOOK_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden")

    action = data.get("action")  # "buy" | "close"

    # --- account state ---
    state = info.user_state(HL_ACCOUNT)
    available = float(state["marginSummary"]["availableMargin"])

    if available <= 0:
        raise HTTPException(status_code=400, detail="No available margin")

    usd_size = available * CAPITAL_PCT

    # --- BUY (LONG) ---
    if action == "buy":
        exchange.order(
            name=SYMBOL,
            is_buy=True,
            sz=usd_size,
            limit_px=None,
            order_type="market"
        )
        return {"status": "LONG opened", "usd": usd_size}

    # --- CLOSE ---
    if action == "close":
        exchange.close_position(SYMBOL)
        return {"status": "Position closed"}

    raise HTTPException(status_code=400, detail="Unknown action")
