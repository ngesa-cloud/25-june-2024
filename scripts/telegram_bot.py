#!/usr/bin/env python3
"""
Telegram Corruption Watch Broadcaster for 25.06.2024 Accountability Platform
Selects a corrupt politician profile and broadcasts an investigative alert to Telegram.
Environment Variables:
  - TELEGRAM_BOT_TOKEN: Telegram Bot API Token from @BotFather
  - TELEGRAM_CHAT_ID: Target Telegram Channel or Chat ID (e.g., @KenyaCorruptionWatch or -100...)
"""

import os
import sys
import json
import random
import argparse
import urllib.parse

try:
    import requests
except ImportError:
    import urllib.request
    requests = None

BASE_URL = "https://ngesa-cloud.github.io/25-june-2024"

def get_repo_root():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    parent_dir = os.path.dirname(script_dir)
    if os.path.exists(os.path.join(parent_dir, "public")):
        return parent_dir
    return os.getcwd()

def format_amount(raw_num, fallback_str=""):
    if raw_num >= 1_000_000_000:
        val = raw_num / 1_000_000_000
        return f"Ksh {val:.2f} Billion" if not val.is_integer() else f"Ksh {int(val)} Billion"
    if raw_num >= 1_000_000:
        val = raw_num / 1_000_000
        return f"Ksh {val:.1f} Million" if not val.is_integer() else f"Ksh {int(val)} Million"
    return fallback_str or f"Ksh {raw_num:,}"

def generate_watch_message(target_slug=None):
    repo_root = get_repo_root()
    index_paths = [
        os.path.join(repo_root, "public", "api", "politicians", "index.json"),
        os.path.join(repo_root, "api", "politicians", "index.json")
    ]

    slugs = []
    for ip in index_paths:
        if os.path.exists(ip):
            try:
                with open(ip, "r", encoding="utf-8") as f:
                    slugs = json.load(f)
                    break
            except Exception:
                pass

    if not slugs:
        slugs = ["william-ruto", "johnson-sakaja", "edwin-sifuna", "robert-alai", "rigathi-gachagua", "raila-odinga", "kalonzo-musyoka"]

    chosen_slug = target_slug if (target_slug and target_slug in slugs) else random.choice(slugs)

    pol_data = None
    candidate_pol_paths = [
        os.path.join(repo_root, "public", "api", "politicians", f"{chosen_slug}.json"),
        os.path.join(repo_root, "api", "politicians", f"{chosen_slug}.json")
    ]
    for cp in candidate_pol_paths:
        if os.path.exists(cp):
            try:
                with open(cp, "r", encoding="utf-8") as f:
                    pol_data = json.load(f)
                    break
            except Exception:
                pass

    if not pol_data:
        raise ValueError(f"Could not load politician data for: {chosen_slug}")

    name = pol_data.get("name", "Unknown Politician")
    position = pol_data.get("position", "Public Official")

    # Calculate total tracked amount
    total_amount_raw = 0
    scandals = pol_data.get("scandals", [])
    for sc in scandals:
        total_amount_raw += sc.get("raw_amount", 0)

    if total_amount_raw > 0:
        total_amount_str = format_amount(total_amount_raw)
    else:
        total_amount_str = scandals[0].get("amount", "Ksh 0") if scandals else "Ksh 0"

    # Count total verified evidence files
    evidence_count = len(pol_data.get("evidence", []))
    for sc in scandals:
        evidence_count += len(sc.get("evidence", []))
    for pr in pol_data.get("promises", []):
        evidence_count += len(pr.get("evidence", []))

    profile_url = f"{BASE_URL}/profile.html?id={urllib.parse.quote(chosen_slug)}"

    # Exact format matching specifications
    message = (
        f"🚨 *CORRUPTION WATCH* 🚨\n\n"
        f"👤 *{name}* ({position})\n"
        f"💰 *Tracked Scandals:* {total_amount_str}\n"
        f"📂 *Evidence Files:* {evidence_count} Verified Documents\n\n"
        f"🔗 *Read the Evidence Locker:*\n{profile_url}\n\n"
        f"#Kenya #Corruption #Accountability"
    )

    return chosen_slug, message

def send_telegram_broadcast(message):
    bot_token = os.environ.get("TELEGRAM_BOT_TOKEN")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID")

    if not bot_token or not chat_id:
        print("[!] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set in environment.")
        print("[*] Running in DRY-RUN simulation mode. Broadcast payload preview:")
        print("-" * 60)
        print(message)
        print("-" * 60)
        print("[✓] Dry-run completed successfully without network transmission.")
        return True

    api_url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": message,
        "parse_mode": "Markdown",
        "disable_web_page_preview": False
    }

    print(f"[*] Dispatching Corruption Watch broadcast to Telegram Chat ID: {chat_id}...")

    if requests:
        res = requests.post(api_url, json=payload, timeout=20)
        if res.status_code == 200:
            print("[✓] Message dispatched successfully to Telegram!")
            return True
        else:
            print(f"[✗] Telegram API Error ({res.status_code}): {res.text}", file=sys.stderr)
            return False
    else:
        import urllib.request
        data_bytes = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(api_url, data=data_bytes, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=20) as resp:
            if resp.status == 200:
                print("[✓] Message dispatched successfully via urllib!")
                return True
            else:
                print(f"[✗] Telegram Error: {resp.read().decode('utf-8')}", file=sys.stderr)
                return False

def main():
    parser = argparse.ArgumentParser(description="Broadcast Corruption Watch alert to Telegram")
    parser.add_argument("--politician", help="Specific politician slug (e.g., johnson-sakaja)")
    args = parser.parse_args()

    slug, msg = generate_watch_message(args.politician)
    success = send_telegram_broadcast(msg)
    if not success:
        sys.exit(1)

if __name__ == "__main__":
    main()
