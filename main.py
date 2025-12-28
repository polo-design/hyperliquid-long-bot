from fastapi import FastAPI, Request, HTTPException
from hyperliquid.exchange import Exchange
import os

app = FastAPI()

# ===== ENV VARIABLES =====
HL_PRIVATE_KEY = os.getenv("HL_PRIVATE_KEY")
WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET")

if not HL_PRIVATE_KEY:
    raise RuntimeError("HL_PRIVATE_KEY not set")

if not WEBHOOK_SECRET:
    raise RuntimeError("WEBHOOK_SECRET not set")

# ===== HYPERLIQUID EXCHANGE =====
exchange = Exchange(HL_PRIVATE_KEY)

SYMBOL = "BTC"
ORDER_SIZE = 0.01  # <-- zmień później jeśli chcesz

# ===== WEBHOOK ENDPOINT =====
@app.post("/webhook")
async def webhook(req: Request):
    data = await req.json()

    # --- security ---
    if data.get("secret") != WEBHOOK_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden")

    signal = data.get("signal")

    # --- get current position ---
    position = exchange.get_position(SYMBOL)

    # ===== LONG ONLY LOGIC =====

    # OPEN LONG
    if signal == "Go Long":
        if position is None:
            exchange.market_open(
                SYMBOL,
                is_buy=True,
                size=ORDER_SIZE
            )
            return {"status": "long opened"}
        else:
            return {"status": "long already open"}

    # CLOSE LONG (NO SHORTS)
    if signal == "Go Short":
        if position is not None:
            exchange.market_close(SYMBOL)
            return {"status": "long closed"}
        else:
            return {"status": "no position to close"}

    return {"status": "ignored"}
