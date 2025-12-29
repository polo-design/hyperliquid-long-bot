import os
from fastapi import FastAPI, Request, HTTPException
from hyperliquid.exchange import Exchange

app = FastAPI()

# =========================
# ENVIRONMENT VARIABLES
# =========================
HL_PRIVATE_KEY = os.getenv("HL_PRIVATE_KEY")
WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET")

if not HL_PRIVATE_KEY or not WEBHOOK_SECRET:
    raise RuntimeError("Missing HL_PRIVATE_KEY or WEBHOOK_SECRET")

# =========================
# HYPERLIQUID SETUP
# =========================
exchange = Exchange(private_key=HL_PRIVATE_KEY)

SYMBOL = "BTC-USDC"   # <<< WAŻNE
SIZE = 0.001          # bardzo mały size na test

# =========================
# WEBHOOK ENDPOINT
# =========================
@app.post("/webhook")
async def webhook(request: Request):
    data = await request.json()

    # --- SECURITY ---
    if data.get("secret") != WEBHOOK_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden")

    signal = data.get("signal")

    try:
        # =========================
        # OPEN LONG
        # =========================
        if signal == "Go Long":
            exchange.order(
                coin=SYMBOL,
                is_buy=True,
                sz=SIZE,
                limit_px=None,
                order_type="market",
                reduce_only=False
            )
            return {"status": "LONG OPENED"}

        # =========================
        # CLOSE POSITION (NO SHORT)
        # =========================
        elif signal == "Go Short":
            exchange.order(
                coin=SYMBOL,
                is_buy=False,
                sz=SIZE,
                limit_px=None,
                order_type="market",
                reduce_only=True
            )
            return {"status": "POSITION CLOSED"}

        else:
            return {"status": "UNKNOWN SIGNAL"}

    except Exception as e:
        print("ERROR:", e)
        raise HTTPException(status_code=500, detail=str(e))
