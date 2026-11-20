"""Run the eval against a LOCAL Karma API with one model.

    cd backend
    export ANTHROPIC_API_KEY=...  KARMA_PASSWORD=...
    uv run --no-project --python 3.12 --with-requirements assistant/requirements.txt \
        python -m assistant.eval.run --username admin [--model anthropic:claude-opus-5-5] [--code] [--only id,id]

Prints a table and writes assistant/eval/results/<timestamp>-<model>.json.
Every question runs in a fresh conversation. This spends real API money:
roughly $0.05–0.50 per question on Opus.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import unicodedata
from pathlib import Path

from ..agent import Conversation
from ..cli import LOCAL_HOSTS
from ..karma_client import KarmaClient
from ..registry import resolve
from .cases import CASES, Expect

RESULTS = Path(__file__).with_name("results")
_ARABIC_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩٫٬", "0123456789.,")


def numbers_in(text: str) -> list[float]:
    t = text.translate(_ARABIC_DIGITS)
    out = []
    for m in re.finditer(r"-?\d[\d,]*(?:\.\d+)?", t):
        try:
            out.append(float(m.group().replace(",", "")))
        except ValueError:
            pass
    return out


def _norm(s: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", s).split()).casefold()


def grade(answer: str, expect: Expect) -> tuple[bool, list[str]]:
    misses = []
    found = numbers_in(answer)
    for n in expect.numbers:
        tol = max(1.0, abs(n) * 0.01)
        if not any(abs(f - n) <= tol for f in found):
            misses.append(f"number {n:g}")
    a = _norm(answer)
    for name in expect.names:
        if name and _norm(name) not in a:
            misses.append(f"name {name!r}")
    return not misses, misses


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", default=os.environ.get("KARMA_API", "http://localhost:5000"))
    ap.add_argument("--username", default=os.environ.get("KARMA_USERNAME"))
    ap.add_argument("--model", default=None)
    ap.add_argument("--effort", default=None)
    ap.add_argument("--code", action="store_true")
    ap.add_argument("--only", default=None)
    args = ap.parse_args(argv)

    from urllib.parse import urlparse
    if (urlparse(args.api).hostname or "") not in LOCAL_HOSTS:
        sys.exit("The eval runs against a LOCAL Karma API only.")
    spec = resolve(args.model)
    if not spec.configured:
        sys.exit(f"{spec.api_key_env} is not set.")
    password = os.environ.get("KARMA_PASSWORD")
    if not (args.username and password):
        sys.exit("Set --username and KARMA_PASSWORD.")

    cases = [c for c in CASES if not args.only or c.id in args.only.split(",")]
    rows = []
    for case in cases:
        client = KarmaClient.login(args.api, args.username, password)
        convo = Conversation(client=client, spec=spec, code_calling=args.code, effort=args.effort)
        expect = case.truth(convo.executor)
        t0 = time.monotonic()
        try:
            r = convo.ask(case.question)
            ok, misses = grade(r.text, expect)
            row = dict(id=case.id, ok=ok, misses=misses, answer=r.text, cost=r.cost_usd, seconds=r.seconds,
                       timing=r.timing,
                       model_calls=r.model_calls, tool_calls=len(r.tool_calls), tools=[c["tool"] for c in r.tool_calls],
                       errors=sum(1 for c in r.tool_calls if c["error"]), stop=r.stop_reason, usage=r.usage)
        except Exception as e:  # keep going; record the failure
            row = dict(id=case.id, ok=False, misses=[f"exception {type(e).__name__}: {e}"], answer="", cost=0.0,
                       seconds=time.monotonic() - t0, model_calls=0, tool_calls=0, tools=[], errors=0, stop="exception")
        row["expected"] = {"numbers": expect.numbers, "names": expect.names}
        rows.append(row)
        print(f"{'PASS' if row['ok'] else 'FAIL'}  {case.id:<24} ${row['cost']:.3f}  {row['seconds']:5.1f}s  "
              f"{row['model_calls']} calls / {row['tool_calls']} tools  {'; '.join(row['misses'])}", flush=True)

    passed = sum(r["ok"] for r in rows)
    cost = sum(r["cost"] for r in rows)
    secs = sum(r["seconds"] for r in rows)
    print(f"\n{spec.label}{' +code' if args.code else ''}: {passed}/{len(rows)} passed · "
          f"${cost:.2f} total (${cost / max(1, len(rows)):.3f}/question) · {secs / max(1, len(rows)):.1f}s/question")
    RESULTS.mkdir(exist_ok=True)
    out = RESULTS / f"{time.strftime('%Y%m%d-%H%M%S')}-{spec.id.replace(':', '_')}{'-code' if args.code else ''}.json"
    out.write_text(json.dumps({"model": spec.id, "code": args.code, "effort": args.effort, "rows": rows},
                              ensure_ascii=False, indent=1))
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
