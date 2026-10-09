import argparse
import datetime
import json
import os
import sys
import time
import httpx

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def main():
    parser = argparse.ArgumentParser(description="Sarvam API Eval Harness")
    parser.add_argument("--base-url", default="http://127.0.0.1:8099", help="Base URL of running API")
    args = parser.parse_args()

    base_dir = os.path.dirname(os.path.abspath(__file__))
    cases_dir = os.path.join(base_dir, "cases")
    out_dir = os.path.join(base_dir, "out")
    os.makedirs(out_dir, exist_ok=True)
    report_file = os.path.join(out_dir, "report.md")

    case_ids = [d for d in os.listdir(cases_dir) if os.path.isdir(os.path.join(cases_dir, d))]
    case_ids.sort()

    results = []
    print(f"Running evals against {args.base_url} across {len(case_ids)} cases...")

    client = httpx.Client(base_url=args.base_url, timeout=120.0)

    for cid in case_ids:
        case_json_path = os.path.join(cases_dir, cid, "case.json")
        if not os.path.exists(case_json_path):
            continue

        with open(case_json_path, "r", encoding="utf-8") as f:
            cdata = json.load(f)

        cname = cdata.get("name", cid)
        file_rel = cdata.get("file_path")
        file_path = os.path.normpath(os.path.join(cases_dir, cid, file_rel))
        mime_type = cdata.get("mime_type", "application/pdf")
        explain_lang = cdata.get("explain_lang", "en")
        translate_lang = cdata.get("translate_lang", "ta")
        expected = cdata.get("expected", {})

        print(f"Testing case: {cname} ({cid})...")
        if not os.path.exists(file_path):
            print(f"  Warning: File {file_path} not found!")
            results.append({
                "id": cid,
                "name": cname,
                "status": "SKIPPED",
                "error": "File not found",
            })
            continue

        # 1. Test Explain
        t0 = time.time()
        with open(file_path, "rb") as f_in:
            files = [("files", (os.path.basename(file_path), f_in.read(), mime_type))]
        resp = client.post("/api/explain", files=files, data={"lang": explain_lang})
        explain_sec = time.time() - t0

        if resp.status_code != 200:
            print(f"  Explain failed: {resp.status_code} - {resp.text}")
            results.append({
                "id": cid,
                "name": cname,
                "explain_status": resp.status_code,
                "explain_sec": explain_sec,
                "status": "FAIL",
                "error": f"Explain returned {resp.status_code}",
            })
            continue

        explain_json = resp.json()

        # 2. Test Translate
        t1 = time.time()
        trans_resp = client.post("/api/translate", json={"result": explain_json, "lang": translate_lang})
        translate_sec = time.time() - t1

        trans_status = trans_resp.status_code
        trans_json = trans_resp.json() if trans_status == 200 else {}

        # 3. Assertions
        passed = True
        notes = []
        if "document_type" in expected and explain_json.get("document_type") != expected["document_type"]:
            passed = False
            notes.append(f"Doc type mismatch: got {explain_json.get('document_type')}, expected {expected['document_type']}")

        if "source_kind" in expected and explain_json.get("source_kind") != expected["source_kind"]:
            passed = False
            notes.append(f"Source kind mismatch: got {explain_json.get('source_kind')}, expected {expected['source_kind']}")

        if "protected_terms" in expected:
            pt = explain_json.get("protected_terms", [])
            for term in expected["protected_terms"]:
                if term not in pt:
                    notes.append(f"Expected protected term '{term}' not found in {pt}")

        if "excluded_protected_terms" in expected:
            pt = explain_json.get("protected_terms", [])
            for term in expected["excluded_protected_terms"]:
                if term in pt:
                    passed = False
                    notes.append(f"Excluded term '{term}' was erroneously included in protected_terms")

        # Check wrongly_matched
        wrongly_matched = 0
        from evidence import normalize_text_for_evidence
        doc_raw_text = ""
        if mime_type == "application/pdf":
            import pypdf
            try:
                pdf_r = pypdf.PdfReader(file_path)
                doc_raw_text = " ".join(p.extract_text() or "" for p in pdf_r.pages)
            except Exception:
                pass

        norm_doc = normalize_text_for_evidence(doc_raw_text)
        all_eval_items = (
            explain_json.get("actions", [])
            + explain_json.get("warnings", [])
            + explain_json.get("facts", [])
            + explain_json.get("medicines", [])
        )
        for item in all_eval_items:
            if item.get("evidence") == "matched":
                quote = item.get("quote", "")
                if quote:
                    norm_q = normalize_text_for_evidence(quote)
                    if norm_q not in norm_doc:
                        wrongly_matched += 1

        if wrongly_matched > 0:
            passed = False
            notes.append(f"wrongly_matched={wrongly_matched} > 0")

        results.append({
            "id": cid,
            "name": cname,
            "document_type": explain_json.get("document_type"),
            "source_kind": explain_json.get("source_kind"),
            "explain_sec": explain_sec,
            "translate_sec": translate_sec,
            "explain_status": resp.status_code,
            "translate_status": trans_status,
            "wrongly_matched": wrongly_matched,
            "passed": passed and (trans_status == 200),
            "notes": ", ".join(notes) if notes else "All checks passed",
        })

    # Generate Markdown Report
    with open(report_file, "w", encoding="utf-8") as rf:
        rf.write("# Sarvam API Evaluation Report\n\n")
        rf.write(f"Generated on: {datetime.datetime.now().isoformat()}\n")
        rf.write(f"Base URL: `{args.base_url}`\n\n")
        rf.write("| Case | Document Type | Source Kind | Explain (s) | Translate (s) | Wrongly Matched | Status | Notes |\n")
        rf.write("|---|---|---|---|---|---|---|---|\n")
        for r in results:
            stat = "PASS" if r.get("passed") else "FAIL"
            rf.write(f"| {r.get('name')} | {r.get('document_type', '-')} | {r.get('source_kind', '-')} | {r.get('explain_sec', 0):.2f} | {r.get('translate_sec', 0):.2f} | {r.get('wrongly_matched', 0)} | **{stat}** | {r.get('notes', '-')} |\n")
        rf.write("\n")

    print(f"Eval report written to {report_file}")

if __name__ == "__main__":
    main()
