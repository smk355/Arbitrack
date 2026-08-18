import json
import os
import httpx
import config


def get_login_url() -> str:
    return (
        f"{config.UPSTOX_AUTH_URL}"
        f"?response_type=code"
        f"&client_id={config.UPSTOX_API_KEY}"
        f"&redirect_uri={config.UPSTOX_REDIRECT_URI}"
    )


def exchange_code_for_token(auth_code: str) -> str:
    response = httpx.post(
        config.UPSTOX_TOKEN_URL,
        headers={
            "accept": "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        data={
            "code": auth_code,
            "client_id": config.UPSTOX_API_KEY,
            "client_secret": config.UPSTOX_API_SECRET,
            "redirect_uri": config.UPSTOX_REDIRECT_URI,
            "grant_type": "authorization_code",
        },
    )
    if response.status_code != 200:
        print("Upstox error response:", response.text)
    response.raise_for_status()
    access_token = response.json()["access_token"]
    _save_token(access_token)
    return access_token


def get_access_token() -> str:
    """Returns the cached access token from today's login.

    Upstox tokens expire daily (~3:30am IST). Raises if no token has
    been fetched yet today — run the login flow again in that case.
    """
    if not os.path.exists(config.TOKEN_FILE):
        raise RuntimeError(
            "No access token found. Visit the login URL from "
            "get_login_url() and complete the OAuth flow first."
        )
    with open(config.TOKEN_FILE) as f:
        return json.load(f)["access_token"]


def _save_token(access_token: str) -> None:
    with open(config.TOKEN_FILE, "w") as f:
        json.dump({"access_token": access_token}, f)


if __name__ == "__main__":
    print("Open this URL, log in, then paste the `code` query param below:")
    print(get_login_url())
    code = input("code: ").strip()
    token = exchange_code_for_token(code)
    print(f"Access token saved to {config.TOKEN_FILE}")
