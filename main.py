import os
from fastapi import FastAPI
from hyperliquid.exchange import Exchange

# =========================
# ENV VARIABLES (RENDER)
# =========================
# HL_ACCOUNT      -> 0x... (TWÓJ ADRES)
# HL_PRIVATE_KEY  -> 0x... (TWÓJ PRIVATE KEY)

HL_ACCOUNT = os.environ.get("HL_ACCOUNT")
HL_PRIVATE_KEY = os.environ.get("HL_PRIVATE_KEY")

if not HL_ACCOUNT or not HL_PRIVATE_KEY:
    raise RuntimeError("Brakuje HL_ACCOUNT lub HL_PRIVATE_KEY w zmiennych środowiskowych")

# =========================
# FASTAPI
# =========================
app = FastAPI(title="Hyperliquid Bot")

# =========================
# HYPERLIQUID EXCHANGE
# =========================
exchange = Exchange(
    wallet=HL_ACCOUNT,
    private_key=HL_PRIVATE_KEY
)

# =========================
# ROUTES
# =========================
@app.get("/")
def root():
    return {
        "status": "ok",
        "wallet": HL_ACCOUNT
    }

@app.get("/balance")
def balance():
    """
    Test: pobranie balansu konta
    """
    state = exchange.info.user_state(HL_ACCOUNT)
    return state
