#!/usr/bin/env python3
import argparse
import json
import os
import sys

import httpx


KNOWN_LANG_CODES = {
    "en", "ta", "hi", "kn", "ml", "te", "bn", "mr", "gu", "pa", "or", "ur"
}


def main():
    parser = argparse.ArgumentParser(
        description="Send document(s) to Sarvam explain API and print pretty JSON."
    )
    parser.add_argument(
        "inputs",
        nargs="+",
        help="Path(s) to document file(s) and optionally target language as the last argument (e.g. sample.jpg ta)",
    )
    parser.add_argument(
        "--lang",
        "-l",
        default=None,
        help="Target language code (e.g. en, ta, hi). Overrides positional lang if provided.",
    )
    parser.add_argument(
        "--url",
        "-u",
        default=os.environ.get("SERVICE_URL", "http://localhost:8080"),
        help="API base URL (default: http://localhost:8080 or SERVICE_URL env var)",
    )

    args = parser.parse_args()

    inputs = args.inputs
    lang = args.lang

    if lang is None:
        # Check if the last positional argument is a language code or doesn't exist as a file
        if len(inputs) > 1 and (
            not os.path.exists(inputs[-1]) or inputs[-1].lower() in KNOWN_LANG_CODES
        ):
            lang = inputs[-1]
            file_paths = inputs[:-1]
        else:
            lang = "ta"
            file_paths = inputs
    else:
        file_paths = inputs

    # Verify files exist
    for p in file_paths:
        if not os.path.exists(p):
            print(f"Error: File not found: {p}", file=sys.stderr)
            sys.exit(1)

    url = args.url.rstrip("/") + "/api/explain"

    files_to_send = []
    opened_files = []
    try:
        for p in file_paths:
            f = open(p, "rb")
            opened_files.append(f)
            filename = os.path.basename(p)
            mime_type = "application/octet-stream"
            if filename.lower().endswith(".pdf"):
                mime_type = "application/pdf"
            elif filename.lower().endswith((".jpg", ".jpeg")):
                mime_type = "image/jpeg"
            elif filename.lower().endswith(".png"):
                mime_type = "image/png"
            files_to_send.append(("files", (filename, f, mime_type)))

        data = {"lang": lang}

        with httpx.Client(timeout=120.0) as client:
            response = client.post(url, files=files_to_send, data=data)

        try:
            res_json = response.json()
            print(json.dumps(res_json, indent=2, ensure_ascii=False))
        except Exception:
            print(response.text)

        if response.status_code != 200:
            sys.exit(1)

    except Exception as e:
        print(f"Request failed: {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        for f in opened_files:
            f.close()


if __name__ == "__main__":
    main()
