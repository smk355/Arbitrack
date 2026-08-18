import os

from dotenv import load_dotenv

load_dotenv()

UPSTOX_API_KEY = os.getenv("UPSTOX_API_KEY")
UPSTOX_API_SECRET = os.getenv("UPSTOX_API_SECRET")
UPSTOX_REDIRECT_URI = os.getenv("UPSTOX_REDIRECT_URI", "http://localhost:8000/callback")

UPSTOX_AUTH_URL = "https://api.upstox.com/v2/login/authorization/dialog"
UPSTOX_TOKEN_URL = "https://api.upstox.com/v2/login/authorization/token"

TOKEN_FILE = "token.json"

# Spread ranking: percentage of mid-price, (ask - bid) / midprice * 100
SPREAD_THRESHOLD_PCT = 0.5

# NSE trading symbols. Verified against live NIFTY 50 constituents
# (fetched 2026-08-18). Instrument keys (Upstox instrument_key per
# symbol) are resolved separately from the instruments master file and
# are not hardcoded here since they can change.
# NOTE: index rebalances periodically (typically March/September) — recheck
# before relying on this for anything beyond a prototype.
NIFTY_50_SYMBOLS = [
    "ADANIENT", "ADANIPORTS", "APOLLOHOSP", "ASIANPAINT", "AXISBANK",
    "BAJAJ-AUTO", "BAJFINANCE", "BAJAJFINSV", "BEL", "BHARTIARTL",
    "CIPLA", "COALINDIA", "DRREDDY", "EICHERMOT", "ETERNAL",
    "GRASIM", "HCLTECH", "HDFCBANK", "HDFCLIFE", "HINDALCO",
    "HINDUNILVR", "ICICIBANK", "INDIGO", "INFY", "ITC",
    "JIOFIN", "JSWSTEEL", "KOTAKBANK", "LT", "M&M",
    "MARUTI", "MAXHEALTH", "NESTLEIND", "NTPC", "ONGC",
    "POWERGRID", "RELIANCE", "SBILIFE", "SHRIRAMFIN", "SBIN",
    "SUNPHARMA", "TCS", "TATACONSUM", "TMPV", "TATASTEEL",
    "TECHM", "TITAN", "TRENT", "ULTRACEMCO", "WIPRO",
]

EXTRA_SYMBOLS = [
    "MAHABANK",
    "IDFCFIRSTB",
    "UJJIVANSFB",
    "AUBANK",
]

WATCHLIST_SYMBOLS = sorted(set(NIFTY_50_SYMBOLS) | set(EXTRA_SYMBOLS))
