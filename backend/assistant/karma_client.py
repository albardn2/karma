"""Calls the Karma API AS THE SIGNED-IN USER.

The assistant never touches the database and never holds a credential of its
own: every request carries the user's JWT, so the API's request chokepoint
(app/__init__.py `_load_request_identity`) applies the tenant scope, the
account feature cap and the per-user ACL exactly as it does for the UI.
"""
from __future__ import annotations

import re
from urllib.parse import quote

import httpx

CLIENT_HEADER = "X-Karma-Client"


class KarmaError(Exception):
    def __init__(self, status: int, body: str):
        super().__init__(f"HTTP {status}: {body[:500]}")
        self.status = status
        self.body = body


_PATH_PARAM = re.compile(r"<(?:[a-z_]+:)?([a-z_]+)>")


def fill_path(path: str, params: dict) -> str:
    def sub(m):
        name = m.group(1)
        if name not in params or params[name] in (None, ""):
            raise ValueError(f"missing path parameter '{name}'")
        return quote(str(params[name]), safe="")
    return _PATH_PARAM.sub(sub, path)


class KarmaClient:
    def __init__(self, base_url: str, token: str | None = None, conversation_id: str | None = None,
                 timeout: float = 60.0):
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.conversation_id = conversation_id
        self.http = httpx.Client(base_url=self.base_url, timeout=timeout)

    @classmethod
    def login(cls, base_url: str, username: str, password: str, **kw) -> "KarmaClient":
        c = cls(base_url, **kw)
        r = c.http.post("/auth/login", json={"username_or_email": username, "password": password})
        if r.status_code != 200:
            raise KarmaError(r.status_code, r.text)
        c.token = r.json()["access_token"]
        return c

    def _headers(self) -> dict:
        h = {CLIENT_HEADER: "assistant"}
        if self.token:
            h["Authorization"] = f"Bearer {self.token}"
        if self.conversation_id:
            h["X-Assistant-Conversation"] = self.conversation_id
        return h

    def request(self, method: str, path: str, params: dict | None = None, body: dict | None = None,
                idempotency_key: str | None = None):
        params = {k: v for k, v in (params or {}).items() if v is not None}
        # Flask reads repeated keys for lists; httpx encodes lists that way.
        params = {k: (str(v).lower() if isinstance(v, bool) else v) for k, v in params.items()}
        headers = self._headers()
        if idempotency_key:
            # the API replays the stored response instead of writing twice
            headers["Idempotency-Key"] = idempotency_key
        r = self.http.request(method, path, params=params, json=body, headers=headers)
        if r.status_code >= 400:
            raise KarmaError(r.status_code, r.text)
        if not r.content:
            return None
        try:
            return r.json()
        except ValueError:
            return r.text

    def me(self) -> dict:
        return self.request("GET", "/auth/me")
