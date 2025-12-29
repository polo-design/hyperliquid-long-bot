import os
from fastapi import FastAPI, Request
from hyperliquid.client import Client

app = FastAPI()

HL_ACCOUNT = os.getenv("HL_ACCOUNT")
HL_PRIVATE_KEY = os.getenv("HL_PRIVATE_KEY")

client = Client(
    wallet_address=HL_ACCOUNT,
    private_key=HL_PRIVATE_KEY,
    is_testnet=False
)

SYMBOL = "BTC"        # BTC PERPS
USE_BALANCE = 0.90    # 90% kapitału

@app.get("/")
def root():
    return {"status": "alive"}

@app.post("/webhook")
async def webhook(req: Request):
    data = await req.json()
    action = data.get("action")

    account = client.account()
    balance = float(account["marginSummary"]["accountValue"])
    notional = balance * USE_BALANCE

    if action == "LONG":
        result = client.order(
            coin=SYMBOL,
            is_buy=True,
            sz=notional,
            order_type={"market": {}},
            reduce_only=False
        )
        return {"status": "LONG opened", "result": result}

    if action == "CLOSE":
        result = client.order(
            coin=SYMBOL,
            is_buy=False,
            sz=notional,
            order_type={"market": {}},
            reduce_only=True
        )
        return {"status": "position closed", "result": result}

    return {"error": "unknown action"}
