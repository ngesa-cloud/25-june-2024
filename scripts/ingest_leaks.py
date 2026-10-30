#!/usr/bin/env python3
"""
Evidence Ingestion Engine for 25.06.2024 Accountability Platform
Scans data/leaks/ for OSINT files (.txt, .csv, .json), extracts snippets,
and generates public/api/leaks/index.json and api/leaks/index.json.
"""

import os
import sys
import json
import glob
from datetime import datetime, timezone

MAX_SNIPPET_CHARS = 5000

def get_repo_root():
    # If run from scripts/, root is parent directory
    script_dir = os.path.dirname(os.path.abspath(__file__))
    parent_dir = os.path.dirname(script_dir)
    if os.path.exists(os.path.join(parent_dir, "data")):
        return parent_dir
    # Fallback to current working directory
    return os.getcwd()

def ingest_leaks():
    repo_root = get_repo_root()
    leaks_dir = os.path.join(repo_root, "data", "leaks")
    
    if not os.path.exists(leaks_dir):
        print(f"[!] Leaks directory not found at: {leaks_dir}")
        os.makedirs(leaks_dir, exist_ok=True)
        print(f"[+] Created empty leaks directory: {leaks_dir}")

    supported_extensions = ["*.txt", "*.csv", "*.json"]
    found_files = []
    for ext in supported_extensions:
        found_files.extend(glob.glob(os.path.join(leaks_dir, ext)))

    # Sort for deterministic output
    found_files.sort()

    print(f"[*] Ingesting OSINT leaks from: {leaks_dir}")
    print(f"[*] Found {len(found_files)} leak file(s)")

    indexed_records = []

    for file_path in found_files:
        filename = os.path.basename(file_path)
        base_id, ext = os.path.splitext(filename)
        file_type = ext.replace(".", "").lower()

        try:
            stat_info = os.stat(file_path)
            file_mtime = datetime.fromtimestamp(stat_info.st_mtime, tz=timezone.utc).isoformat()
            file_size = stat_info.st_size

            with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                content = f.read(MAX_SNIPPET_CHARS)

            # Clean snippet for JSON storage
            clean_snippet = content.strip()

            indexed_records.append({
                "id": base_id,
                "filename": filename,
                "file_type": file_type,
                "snippet": clean_snippet,
                "date_added": file_mtime,
                "size_bytes": file_size,
                "github_url": f"https://github.com/ngesa-cloud/25-june-2024/blob/main/data/leaks/{filename}"
            })

            print(f"  ✓ Indexed: {filename} ({file_type.upper()}, {len(clean_snippet)} chars)")
        except Exception as e:
            print(f"  ✗ Failed to read {filename}: {e}", file=sys.stderr)

    # Output target directories
    output_dirs = [
        os.path.join(repo_root, "public", "api", "leaks"),
        os.path.join(repo_root, "api", "leaks")
    ]

    for out_dir in output_dirs:
        os.makedirs(out_dir, exist_ok=True)
        out_file = os.path.join(out_dir, "index.json")
        with open(out_file, "w", encoding="utf-8") as out_f:
            json.dump(indexed_records, out_f, indent=2, ensure_ascii=False)
        print(f"[+] Successfully wrote {len(indexed_records)} indexed leak(s) to: {out_file}")

    return len(indexed_records)

if __name__ == "__main__":
    count = ingest_leaks()
    print(f"[✓] Evidence Ingestion Complete. {count} file(s) indexed.")
