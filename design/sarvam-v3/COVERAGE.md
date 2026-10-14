# Design v3 coverage

Checked against `design/sarvam-v3/design/screens/` on 14 Oct 2026. "Partly" means the screen is in the app and uses the v3 colours, type and radii, and a listed piece is still short of the PNG.

| Screen | Elements | Matches PNG | Missing | Motion |
|---|---|---|---|---|
| 01 Onboarding welcome | Wordmark, language, start | partly | Not compared pixel for pixel with the PNG | yes |
| 02 Simple words | Example card | partly | Not compared pixel for pixel with the PNG | yes |
| 03 Listen and ask | Two promises | partly | Not compared pixel for pixel with the PNG | yes |
| 04 Home | 10 sample tiles, full-width health checkup, next up | partly | Not compared pixel for pixel with the PNG | yes |
| 05 All documents | Filters and the same tiles | partly | Not compared pixel for pixel with the PNG | yes |
| 06 Reading A | Scan | partly | Not compared pixel for pixel with the PNG | yes |
| 07 Reading B | Photo pages | partly | Not compared pixel for pixel with the PNG | yes |
| 08 Reading C | Your language | partly | Not compared pixel for pixel with the PNG | yes |
| 09 Reading D | Key facts | partly | Not compared pixel for pixel with the PNG | yes |
| 10 Insurance result | Glance A or F, summary card | partly | Not compared pixel for pixel with the PNG | yes |
| 11 Lab report | D or D+ sections, flags only where printed | partly | Page map from screen 15 is not on a single report | yes |
| 12 Pension Tamil | Glance C | partly | Not compared pixel for pixel with the PNG | yes |
| 13 Prescription | Teal medicine panel, mustard reminder button | partly | Not compared pixel for pixel with the PNG | yes |
| 14 Challan, legal, investment, form | Kind profiles and glance B, C, F, E | partly | Not compared pixel for pixel with the PNG | yes |
| 15 Multi-document | One profile per part | partly | Page map, tabs and scroll-spy | yes |
| 16 Listen | Quick and full, voice and speed | partly | Waveform and layout are the earlier sheet, recoloured | yes |
| 17 Ask | Chips, input, lavender answer | partly | Sheet chrome is recoloured, not rebuilt to the PNG | yes |
| 18 Share | WhatsApp, Email, Copy text, Save image, More | partly | Five targets work; not compared pixel for pixel | yes |
| 19 Save as image | Summary or full page, personal details masked | partly | Export works; not compared pixel for pixel | yes |
| 20 Reminders | Upcoming dates, calendar, copy | partly | Cards recoloured; not rebuilt to the PNG | yes |
| 21 Medicine reminders | Default ticks, day chips when duration is blank | partly | Rules and colours are in; not compared pixel for pixel | yes |
| 22 Password | Unlock | partly | Button and field recoloured | yes |
| 23 Delete | Keep and delete | partly | Sheet recoloured; delete uses the danger red | yes |
| 24 Accessibility | Text size, contrast, motion | partly | Not restyled to the PNG this round | yes |
| 25 Offline | Saved results still open | partly | Home state exists; not compared pixel for pixel | yes |
| 26 Mapping rules | Design reference | no | Not an app screen | no |

0 of 26 match a PNG pixel for pixel in this check. 24 are partly built. Screen 26 is the design reference.

## New-document check

The 11 Round 8 cases were checked as extracted results (invented names and amounts, no `sample-` file name) through `inferKind` and `resolveProfile`. Two wrong kinds were fixed before this table: an electricity bill that mentioned a rebate was read as a tax notice, and one that mentioned "premium" was read as insurance. Short cue words are now whole words, and electricity is recognised before those generic words.

| Case | Expected kind | Got kind | Glance | Kind blocks | Values |
|---|---|---|---|---|---|
| Lab, 18 values, 5 headings, 4 flags | lab_report | lab_report | D+ | sections, not a diagnosis | yes |
| Prescription, BD / TDS / HS / SOS / weekly | prescription | prescription | E | medicines | yes |
| Discharge summary, 3 medicines, follow-up | discharge_summary | discharge_summary | C | diagnosis, medicines, advice | yes |
| Home loan sanction | loan | loan | F | next EMI, loan terms | yes |
| Rental agreement, 2-month notice, end 2027-09-01 | agreement | agreement | E | key terms, timeline | yes, notice by 2027-07-01 |
| GST invoice, 4 items, warranty | invoice | invoice | F | items, warranty | yes |
| Electricity bill with a rebate | utility_bill | utility_bill | A | — | yes |
| Electricity bill, one amount | utility_bill | utility_bill | B | — | yes |
| Pension notice with a deadline | pension_notice | pension_notice | C | — | yes |
| Government notice, instructions only | government_notice | government_notice | E | directions | yes |
| Mutual fund statement | investment | investment | F | — | yes |
| Salary slip | salary_slip | salary_slip | F | — | yes |
| Account-opening form | form | form | E | numbered steps | yes |
| One file with lab, prescription and bill | per part | lab_report, prescription, hospital_bill | multi | each part's own blocks | yes |

14 of 14 kinds rendered with their profile. A title that is only `sample-lab-report.pdf` stays `other`.

These PDFs were not sent to the reader, and the result screens were not screenshotted at 390 px. The live API does not have `document_kind` until the tagged Cloud Run deploy.
