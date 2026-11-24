# NexvoraHub Studio

*Electrical load design studio* – load assessment, design reports, electrical drawing generation and AutoCAD (DXF) drawing review.

**Live app:** https://studio.nexvorahubconnection.com

Electrical load assessment and design tools for buildings, usable across 94 countries and regions (UK BS 7671 / IEC 60364, NEC, CEC, AS/NZS 3000 families).

## Contents

| Path | What it is |
|---|---|
| `Electrical Load Design Report.xlsx` | Excel design template (27 sheets): regional load schedules, NEC/CEC code calculation, equipment loads with demand/diversity/simultaneity factors, lifts, pumps, data centre, BS 7671 cable and protection, transformers and switchrooms, energy management, compliance checklist, utility application data. |
| `_build/` | Node.js scripts that generate the workbook. |
| `app/load-designer.html` | Single-file web app (NexvoraHub Studio): load assessment, design report, AI data-centre planning, electrical drawing generator (DXF), drawing review with legend learning, panel-schedule import and design on submitted layouts, MEP, testing, FM operations, asset management, and the Progress and FM performance boards. |
| `app/src/` | App source, AI data-centre library (`ai-dc-data.json`), data extractor, local preview server and headless tests. |
| `site/index.html` | Standalone build of the app for web hosting. Only this folder is published. |

## Progress and FM performance boards

Two board stages give an at-a-glance view of the project. Both read the data the other stages already hold, so nothing is entered twice. Each board has three looks (Deep blue, Brilliant blue, Brilliant white; the choice is remembered per browser), saves to CSV and prints to PDF.

| Stage | What it shows |
|---|---|
| **Progress board** | Six boards (electrical design, mechanical & plumbing, implementation & commissioning, energy management, asset management, facilities management), each measured against its own deliverables. Examples: load schedules, cable schedule and drawings for design; tests and LV certificates for implementation; energy model, measures and metered savings for energy; register, PPM, condition and replacement plan for assets. Each board shows a live percentage, red/amber/green status and its flagged actions (from the same rules as each role's My tasks). The overview shows progress across all boards plus a combined list of flagged actions. A deliverable not yet started counts as 0 %; one that does not apply is left out. |
| **FM board inputs** | Targets; a service-contract register for hard and soft services (contractor, term, value, SLA target and achieved, PPM planned/completed, KPI audit score); SOP compliance; OPEX; customer satisfaction; energy and water actuals; safety and fire; optimisation strategies. **Load example FM data** fills a worked example, adding example tickets, assets, soft services and capital projects only where those stages are still empty. |
| **FM performance board** | Executive summary; KPI progress to target (each parameter as a % of its target); gauges for SLA, PPM, MTTR, MTBF, asset availability and satisfaction; incidents by priority (P1–P4 tickets); contracts with renewal flags (≤ 90 days); SOP compliance; soft-services KPIs; MTTR and MTBF by equipment; energy, water and CO₂; CAPEX (capital projects) and OPEX; work orders; asset management; safety and fire. Filter to hard services, soft services or both. |

Definitions used on the FM board: SLA = tickets fixed within their priority SLA ÷ tickets judged (contractor-reported SLA when there are no tickets); MTTR = mean hours from raising to completing a ticket; MTBF = units × 365 days ÷ failures in 12 months; availability = units not "Not operating" ÷ units; PPM compliance = planned tasks completed ÷ issued.

## Rebuild the workbook

```bash
cd _build
npm install exceljs@4.4.0
node assemble.js
node build_full.js
```

Open the result in Excel; it recalculates on open.

## Rebuild and test the app

```bash
cd app/src
node extract-data.js ../../_build/build_full.js designdata.json
node build-app.js designdata.json
node test-app.js
node serve.js
```

`build-app.js` writes both `app/load-designer.html` (claude.ai Artifact) and `site/index.html` (website). Commit and push `site/index.html` to redeploy the live site: the GitHub Actions workflow `.github/workflows/pages.yml` publishes `site/` to GitHub Pages at https://studio.nexvorahubconnection.com (custom domain on GitHub Pages; DNS: CNAME studio → kayglor.github.io, DNS only, in Cloudflare). CI runs the headless tests and checks that `app/load-designer.html` and `site/index.html` match the source before it deploys, so commit all three together. The deploy job waits 30 s after uploading the Pages artifact, because `deploy-pages` otherwise sometimes reports "No artifacts named github-pages were found".

`extract-data.js` reads the reference data (countries, densities, factors, cable tables) straight from the workbook generator, so the app and the workbook stay consistent. `serve.js` previews the app at http://localhost:5179/.

## Data files (edit, rebuild, push)

| File | Purpose |
|---|---|
| `app/src/coverage.json` | Regional coverage register: markets not offered, payment notes, national deviations and **engineer verification records** (edition, date, name). A country shows "ready to sell" only when Full/Supported and verified. |
| `app/src/access.json` | Paid access. `"mode": "open"` keeps everything free. To charge: create a product with licence keys in Lemon Squeezy, set `checkoutUrl`, `termsUrl`, `privacyUrl`, `supportEmail` and plan prices, then set `"mode": "pro"`. The actions in `proActions` then need an activated licence key. |
| `app/src/ai-dc-data.json` | AI data-centre platform library (dated, sourced defaults). |
| Cable table packs (Stage 7) | Licensed metric tables (e.g. IEC 60364-5-52, AS/NZS 3008.1) imported per project from a JSON template. Not stored in the repository. |

The licence check runs in the browser, so it is a convenience gate rather than strong protection: for strong protection keep the repository private and move exports to a server that checks the subscription.

## Important

Load densities, regional factors, demand factors, code unit loads and cable ratings are indicative engineering defaults. Verify them against the edition of each standard adopted locally before issuing a design. Canadian (CEC) basic loads are placeholders. Cable ratings are BS 7671 Appendix 4 copper values; use local tables for NEC, CEC and AS/NZS projects. The outputs support, and do not replace, design verification and certification by a competent person.
