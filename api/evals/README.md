# Sarvam Evaluation Harness

The evaluation harness benchmarks accuracy, document understanding, and guard compliance across sample official documents.

## Directory Structure
- `cases/`: Test cases with input fixtures and expected schemas.
  - `cases/insurance_letter/`: Claim rejection PDF case.
  - `cases/pension_notice/`: Photo government pension notice.
  - `cases/lab_report/`: Medical diagnostics lab report.
- `out/`: Evaluation reports and generated markdown summaries (`out/report.md`). Ignored by git.

## Running Evaluations
Run against the live API on port 8099:
```bash
python run_evals.py --base-url http://127.0.0.1:8099
```

Output results are written directly to `out/report.md`.
