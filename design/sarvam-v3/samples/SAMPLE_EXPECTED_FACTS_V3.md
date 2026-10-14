# Sarvam samples v3: expected facts and the screen each one must produce

All files are fictional and watermarked "SAMPLE · FICTIONAL". Facts below were written from the documents, not from the app.
Labels: **[M]** printed in the document (must show as Matched / "found in your document"), **[C]** calculated in code from printed dates.
"Days left" in the design PNGs was computed on **14 Oct 2026**. On another day the number changes; everything else must match.

| File | Screen in design | Glance layout |
|---|---|---|
| sample-insurance-letter.pdf (existing) | 10 (3a) | A split amounts |
| **sample-lab-report.pdf (NEW, replaces the old one)** | 11 (3b) | D values (≤ 4 values) |
| sample-pension-notice.jpg (existing), output in Tamil | 12 (3c) | C deadline |
| **sample-prescription.jpg (NEW)** | 13 (3d) → 20, 21 | E + Medicine reminders |
| sample-echallan.pdf (existing) | 14 challan (3e) | B to pay |
| **sample-court-summons.pdf (NEW)** | 14 legal notice (3e) | C deadline |
| **sample-mutual-fund-statement.pdf (NEW)** | 14 investment (3e) | F amount strip |
| **sample-bank-deposit-slip.jpg (NEW)** | 14 form (3e) | E + numbered steps |
| **sample-health-checkup.pdf (NEW, 5 pages, 3 documents)** | 15 (3f) | parts: sectioned values + medicines + F |
| sample-property-tax-notice.pdf (existing) | rules only | A split (₹3,840 = ₹3,648 + ₹192) |
| sample-invoice-warranty.pdf (existing) | rules only | F strip |

Home shows these as sample tiles in this order: Lab report, Insurance letter, Pension notice, Phone invoice & warranty, Property tax notice, Traffic e-challan, Prescription, Mutual fund statement, Court summons, Bank deposit slip (form), then the full-width **Health checkup · PDF · 5 pages** tile (screen 04).

---

## 1. sample-lab-report.pdf → screen 11 (3b)
- Lab: City Diagnostics, 2nd Main, Indiranagar, Bengaluru 560038 [M]; phone 080 0000 0000 [M].
- Patient Mr. Suresh Babu, 48 Y / M [M]. Lab No. CD-2026-11873 [M]. Referred by Dr. A. Rao [M].
- Sample collected 08 Oct 2026 [M]; report date 09 Oct 2026 [M].
- Values (tiles, in this order): Haemoglobin **11.2 g/dL**, range 13.0 – 17.0, printed flag **Low** [M] · Fasting blood sugar **126 mg/dL**, range 70 – 100, printed flag **High** [M] · Total cholesterol **182 mg/dL**, "Below 200", no printed flag → pill **In range** · 4th tile: Report date 9 Oct 2026, "Sample collected 8 Oct" (teal-tint date tile).
- Headline: "Blood test from City Diagnostics: 2 values are marked outside the normal range."
- Action: take the report to your doctor; the report says "Please consult your doctor for follow-up of the flagged values" [M]. No date.
- Watch out: "Not a diagnosis" (medical documents).
- Places & contacts: the lab address (Directions), lab phone (Call).
- Key facts: tests Blood count, blood sugar, lipid profile; Referred by Dr. A. Rao; Lab number CD-2026-11873.
- Must NOT appear: any diagnosis, any advice beyond "show your doctor", any value not printed.
- Share (Hide ON): `Mr. S***** B***`, `Dr. A. R**`, lab number keeps only its last 3 characters, phone `**********`. City Diagnostics, values and dates stay.

## 2. sample-prescription.jpg → screens 13 (3d), 20 and 21 (photo, 1 page)
- Shanthi Family Clinic, Dr. S. Rao, Rayasandra, Bengaluru; phone 080 2222 3344 [M]. Patient Lakshmi Narayan, 62 / F [M]. Date 13/10/2026 [M]. Dx: throat infection [M].
- Medicines [M], frequency_raw exactly as written:
  1. Tab. Amoxicillin **500 mg**, `1-1-1`, 7 days, after food → Morning 8:00 · Afternoon 2:00 · Night 9:00.
  2. Tab. Paracetamol **650 mg**, `1-0-1`, 5 days, after food → Morning 8:00 · Night 9:00.
  3. Tab. Cetirizine **10 mg**, `0-0-1`, 5 days, at bedtime → Bedtime 10:00, food line "At bedtime".
- Headline: "3 medicines prescribed, for 5 to 7 days." Chips: Prescription · Oct 13, 2026 · Photo · 1 page.
- Follow-up: "Review on 20/10/2026" [M] → action with date chip Oct 20, 2026 + Remind me (6 days left on 14 Oct).
- Medicine reminders sheet (screen 21 component): with a clear photo all three are matched + decoded → all slots ticked by default, every duration printed → **"Add 6 reminders"**. Screen 21 itself shows the edge cases (an unclear medicine, a missing duration) to build the rules; it is not this sample.
- .ics: one VEVENT per ticked slot, "Take Amoxicillin 500 mg", `RRULE:FREQ=DAILY;COUNT=7` (Paracetamol and Cetirizine COUNT=5), disclaimer in the description.
- Must NOT appear: a dose, a duration or a medicine that is not written; any medical advice.

## 3. sample-health-checkup.pdf → screen 15 (3f), 5 pages, 3 documents
- **Part 1, Lab report, pages 1–3**: Green Leaf Diagnostics, 14 Lake Road, Anand Nagar; phone 080 1111 2222 [M]. Patient Mr. Prakash N., 52 Y / M; Lab No. GL-2026-55821; Referred by Dr. K. Menon; collected and reported 10 Oct 2026 [M].
  Sections (the report's own headings) and values [M]:
  - Blood sugar (p1): Fasting blood sugar 118 mg/dL (70 – 100) **High**; HbA1c 6.1 % (4.0 – 5.6) **High**.
  - Complete blood count (p1): Haemoglobin 14.2 g/dL (13.0 – 17.0); Total WBC count 7,200 cells/cumm (4,000 – 11,000); Platelet count 2.4 lakh/cumm (1.5 – 4.5). No flags.
  - Lipid profile (p2): Total cholesterol 212 mg/dL (Below 200) **High**; LDL 138 (Below 130) **High**; HDL 46 (Above 40); Triglycerides 145 (Below 150).
  - Thyroid profile (p3): TSH 2.8 mIU/L (0.4 – 4.0).
  - Kidney function (p3): Serum creatinine 0.9 mg/dL (0.7 – 1.3).
  - Vitamins (p3): Vitamin D (25-OH) 18 ng/mL (30 – 100) **Low**.
  - Report note: "Values outside the reference range are flagged. Please consult your doctor for interpretation." [M]
  - Expected: "Look at these first" lists the 5 flagged values (FBS, HbA1c, Total cholesterol, LDL, Vitamin D). Sections with flags open first in report order (Blood sugar, Lipid profile, Vitamins), then the all-in-range sections collapsed (Complete blood count, Thyroid profile, Kidney function).
- **Part 2, Prescription, page 4**: Green Leaf Clinic, Dr. K. Menon, 12 Oct 2026 [M].
  - Tab. Atorvastatin 10 mg, `0-0-1`, after food, 30 days → Night 9:00.
  - Cap. Vitamin D3 60,000 IU, `Once a week`, after food, 8 weeks → not a daily pattern: **no slot ticked**, dashed chip "Pick a day and time"; never guess the day.
  - "Review on 15 Jan 2027 with repeat lipid profile and HbA1c." [M] → action, date chip Jan 15, 2027 + Remind me.
- **Part 3, Bill, page 5**: Green Leaf Diagnostics, Bill No. GLD/B/2026/3307, 10 Oct 2026 [M]. Executive health checkup package ₹3,499.00; Doctor consultation ₹500.00; Total paid ₹3,999.00; paid by UPI on 10 Oct 2026 [M] → F strip "Checkup package / Consultation / Total paid", "nothing left to pay".
- Headline: "Your health checkup: a lab report, a prescription and a bill." Chips: 3 documents · PDF · 5 pages · View document.
- What you need to do: 3 actions, each tagged with its part (Lab report, Prescription, Prescription).
- Share (Hide ON): `Mr. P****** N.` style mask for the patient, IDs keep the last 3, phones fully masked.

## 4. sample-mutual-fund-statement.pdf → screen 14 investment (F)
- Suryodaya Mutual Fund, Flexi Cap Fund, Direct Plan, Growth [M]. Investor Ms. Meera Iyer [M]; address, email, mobile, PAN printed [M]. Folio 1234567/89 [M]. Period 01 Apr 2026 – 30 Sep 2026 [M].
- Summary as on 30 Sep 2026 [M]: total invested **₹1,10,000**; units held **2,200.00**; NAV **₹56.50**; market value **₹1,24,300**; gain **₹14,300**.
- Headline: "Your mutual fund is now worth ₹1,24,300." Strip: Invested ₹1,10,000 · Value now ₹1,24,300 · Gain +₹14,300. Bars compare only these two printed values; no trend line.
- Key facts: Folio 1234567/89, Units held 2,200.00, NAV on Sep 30 ₹56.50.
- "Next SIP instalment: 05-Oct-2026" [M] is in the past on 14 Oct → "Date has passed", no Remind me.
- Printed warnings (market risks; past performance) may appear in Watch out; nothing else. Footer: "It does not give investment advice."
- Share (Hide ON): investor name, address `[hidden]`, email, phone `**********`, PAN and folio masked (last 3 kept).

## 5. sample-court-summons.pdf → screen 14 legal notice (C)
- Court of the City Civil Judge, Bengaluru (fictional); O.S. No. 4417 / 2026 [M]. Summons to defendant, issued 10 Oct 2026 [M].
- Plaintiff Shri Anand Rao; Defendant Shri Karthik S. [M]. Nature of suit: recovery of unpaid rent and possession of premises [M]. **No amount is printed.**
- Hearing **12 Nov 2026, 10:30 AM, Court Hall No. 4**, City Civil Court Complex, K.G. Road [M] → C date tile NOV 12 / 10:30 AM, "29 days left" on 14 Oct.
- Actions [M]: appear in person or through a pleader (bring the rent agreement and documents you rely on) — date chip Nov 12 · 10:30 AM + Remind me; file the written statement on or before the hearing date.
- Watch out [M]: if you do not appear, the suit may be heard and decided in your absence.
- Contacts: plaintiff's advocate phone and email [M]; free legal aid, District Legal Services Authority, helpline 15100 [M].
- Share (Hide ON): both party names and addresses masked; the court name, date and hall stay.

## 6. sample-bank-deposit-slip.jpg → screen 14 form (E + numbered steps)
- Sample Bank Ltd (fictional), cash deposit slip, a blank form [M]. Six numbered boxes [M]: 1 Date, 2 Account No., 3 Name of the account holder, 4 Amount in words ("for example: Five thousand only"), 5 Denomination (notes, count, amount, total), 6 Depositor's signature. Instruction: write in block letters, sign and bring the slip to the cash counter [M].
- Headline: "Cash deposit slip. Fill 6 boxes, then sign." No dates → numbered steps, header "0 of 6" on a fresh open (the design shows 2 of 6 to demonstrate the done state).
- Below the steps: "Stuck on a box? Tap Ask and say which one."

## 7. Existing samples (unchanged)
- sample-echallan.pdf → screen 14 challan: facts in `sample_expected_facts_new3.md` (helmet violation, ₹1,000, pay or contest by 05 Dec 2026, Virtual Court warning). The design now shows exactly these.
- sample-insurance-letter.pdf → screen 10; sample-pension-notice.jpg → screen 12 (life certificate by 30 Nov 2026); sample-property-tax-notice.pdf and sample-invoice-warranty.pdf: as before.
- If the insurance or pension screen in the design shows a value the file does not print, that is a design-data mismatch: report it as `DATA` (not a code defect) and do not change code to copy the design text.
