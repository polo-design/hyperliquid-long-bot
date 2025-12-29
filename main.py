import os
from fastapi import FastAPI, Request, HTTPException
from hyperliquid.exchange import Exchange
from hyperliquid.info import Info

# ===== ENV =====
HL_ACCOUNT = os.environ["HL_ACCOUNT"]        # 0x...
HL_PRIVATE_KEY = os.environ["HL_PRIVATE_KEY"]
WEBHOOK_SECRET = os.environ["WEBHOOK_SECRET"]

SYMBOL = "BTC"
SIZE = 0.001  # testowo mała pozycja

# ===== INIT =====
exchange = Exchange(HL_ACCOUNT, HL_PRIVATE_KEY)
info = Info()

app = FastAPI()

@app.post("/webhook")
async def webhook(request: Request):
    secret = request.headers.get("x-webhook-secret")
    if secret != WEBHOOK_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden")

    data = await request.json()
    action = data.get("action")  # "buy" albo "close"

    # ---- BUY ----
    if action == "buy":
        result = exchange.order(
            coin=SYMBOL,
            is_buy=True,
            sz=SIZE,
            limit_px=None,
            order_type={"market": {}},
            reduce_only=False,
        )
        return {"status": "opened", "result": result}

    # ---- CLOSE ----
    if action == "close":
        state = info.user_state(HL_ACCOUNT)
        positions = state["assetPositions"]

        pos = next(
            (p for p in positions if p["position"]["coin"] == SYMBOL),
            None
        )

        if not pos:
            return {"status": "no_position"}

        size = abs(float(pos["position"]["szi"]))
        is_long = float(pos["position"]["szi"]) > 0

        result = exchange.order(
            coin=SYMBOL,
            is_buy=not is_long,
            sz=size,
            limit_px=None,
            order_type={"market": {}},
            reduce_only=True,
        )
        return {"status": "closed", "result": result}

    return {"status": "ignored"}
