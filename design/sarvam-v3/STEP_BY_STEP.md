# What you do, step by step (Wed 14 Oct → Fri 16 Oct)

Three agents, one order. You copy and paste; each agent ends with a HANDOFF block that you forward to the next one.

| Agent | Branch | Prompt |
|---|---|---|
| Antigravity | `fix/final-logic` → main (Part 1), then branches into `feat/sarvam-design-v3` | `prompts/2_ANTIGRAVITY_FINAL.md` |
| Cursor | `feat/sarvam-design-v3` (PR, not merged) | `prompts/1_CURSOR_FINAL_DESIGN.md` |
| Grok | deploys and tests only | `prompts/3_GROK_FINAL_DEPLOY_TEST.md` |

---

## Step 1 — Put the package in the repo (10 min, you)
1. Open `design/index.html` in Chrome. Play the tour video and click through the screens.
2. **Choose your screens.** If you do not want a screen, delete its files from `design/screens/`, `design/png/` and `design/motion/` (same number). The Cursor prompt says that a missing screen is out of scope. Keep 26 (content rules) and every result screen (10–15). Those are what make the app adapt to each document.
3. Copy the whole `sarvam-design-v3` folder into the repo as `design/sarvam-v3/`, then:
   ```
   git checkout main && git pull
   git add design/sarvam-v3
   git commit -m "Add design v3 package, samples and final prompts"
   git push
   ```

## Step 2 — Start Antigravity and Cursor at the same time (tonight)
- **Antigravity**: paste all of `prompts/2_ANTIGRAVITY_FINAL.md`. It does **Part 1 only**: Share leak, blank screen, speed, security, performance, the multi-document API, the new samples. Then it merges to `main`.
- **Cursor**: paste all of `prompts/1_CURSOR_FINAL_DESIGN.md`. It builds the full design v3 on `feat/sarvam-design-v3` and does not merge. It does not wait for Antigravity; it rebases when Antigravity's Part 1 lands.

## Step 3 — Grok Stage 1 (when Antigravity says "part: 1 … merged")
Paste `prompts/3_GROK_FINAL_DEPLOY_TEST.md` to Grok, then on a new line: `START STAGE 1` and Antigravity's HANDOFF block.
Grok deploys `main` live and retests the bugs, security, speed and every sample's facts.
- If Grok lists **DEFECTS FOR ANTIGRAVITY (STAGE 1)**: paste the block to Antigravity with "Fix these on a new branch from main, same Part 1 rules, then HANDOFF." Then repeat Step 3.
- After this step the **live app already has the bug fixes**, which is your safety net.

## Step 4 — Antigravity Part 2 (when Cursor gives its HANDOFF)
Send to Antigravity: `Cursor HANDOFF:` followed by Cursor's block. It wires the real logic into Cursor's design and makes every flow work, including Save as image and the multi-document result. It merges into `feat/sarvam-design-v3` (not `main`).

## Step 5 — Grok Stage 2 (preview test of the design)
Send to Grok: `START STAGE 2` + Antigravity's "part: 2" HANDOFF. Grok deploys the design branch to a **preview URL** (the live site is untouched) and compares every screen with the PNGs, using the sample files.
- **You**: open the preview URL on your iPhone. Try the Share sheet to WhatsApp with Hide ON, Save image → Save to Photos, and the health checkup sample.
- Grok ends with **DEFECTS FOR ANTIGRAVITY** → paste it to Antigravity under the heading `PART 3` (paste the block exactly as Grok wrote it). Antigravity fixes them on `fix/design-v3-defects` and gives a "part: 3" HANDOFF → back to Grok with `START STAGE 2` again. Repeat until Grok writes **DESIGN V3: READY FOR APPROVAL**.

## Step 6 — You approve, Antigravity merges, Grok goes live
1. You check the preview on your iPhone once more.
2. To Antigravity: `APPROVED: merge design v3` (Part 4).
3. To Grok: `START STAGE 3` + Antigravity's "part: 4" HANDOFF. Grok deploys live and smoke-tests. It ends with **LIVE: READY FOR DEMO VIDEO**.

## Step 7 — Your test and the recording (Thu evening)
Test on your iPhone from the live URL using only the sample tiles and sample files. Then record the screen. Suggested takes: the onboarding; Home; the pension notice in Tamil; the prescription to medicine reminders; the health checkup (one PDF split into three documents); Listen; Ask; Share with Hide ON; Save image to Photos; Accessibility. Send me the recordings and screenshots, and I will make the new deck and video in this design.

## Deadline guard
- **Thu 15 Oct, 6 pm**: if Step 6 is not done, submit with the live app from Step 3. It has all the bug fixes and the new samples. Merge the design right after submitting.
- Submit by **Fri 16 Oct, noon**. The portal closes Sun 18 Oct, 11:59 PM IST.

## If an agent gets stuck
- An agent asks for an interface that is missing: forward its question to the other agent verbatim.
- Cursor's PR conflicts with Antigravity's merge: tell Cursor "rebase on origin/main, keep both sides, re-run tests".
- Grok reports a **Blocker** (personal data in a share or an image): stop everything else; that goes to Antigravity first.
