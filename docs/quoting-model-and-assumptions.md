# Machina Quoting Tool — How It Works & Model Assumptions

*A plain-language reference for the cost model behind every quote. Written for building a slide deck — each section can become one or a few slides. All numbers below are the assumptions currently hard-coded in the tool (source of truth: `backend/calculations.py`).*

---

## 1. What the tool does

It turns a description of a manufacturing job into a **full cost buildup and a quoted price**. You describe the project (how many assemblies, which parts, how long the robot runs, how many forming trials it will take, materials, timeline), and the tool computes labor + robot + material + outside-service costs, then applies margin to get a price.

**The central idea:** every quote is built from two things we already talk about internally:
1. **How long the robot will run** (run-time estimate, in hours) — you provide this.
2. **How many trials it takes** to dial in a part to the customer's requirements — you provide this as a count of procedures.

Everything else (labor hours, overhead, improvement over time) is an **assumption the model applies for you**, described in this document.

---

## 2. The hierarchy

```
Project  ─┬─  Part  ─┬─  Procedure  ─┬─  Operation (forming / scanning / cutting)
          │          │               
          │          └─  (repeated across trials + the production run)
          └─  Project-level overhead (PM, purchasing, splitting)
```

- **Project** = the whole job (one or more identical assemblies).
- **Part** = a unique piece; an assembly can contain several, and each part has a quantity per assembly.
- **Procedure** = one forming attempt (a "trial"), or the final production forming.
- **Operation** = the individual robot/labor steps inside a procedure: **forming, scanning, cutting.**

---

## 3. The most important split: First Part (NRE) vs. Duplicate (Production)

This is the key output of the whole tool.

- **First Part cost (NRE / non-recurring):** the cost to make the *first* good deliverable — includes all the forming **trials** it takes to find the recipe, plus one-time setup (path planning, simulation, skirt), plus purchasing/PM setup.
- **Duplicate cost (recurring / production):** the cost to make each *additional* part once the recipe is locked in. No trials — just the production forming run plus per-part overhead.

**Assumption:** finding the recipe is expensive and one-time; repeating it is cheap. The tool assumes the first part absorbs all trial cost and setup, and every subsequent part only pays the duplicate cost.

The same first-vs-duplicate logic also applies at the **assembly** level: the first assembly carries the NRE, each additional assembly is priced at the duplicate rate.

---

## 4. Two labor models: **Formed Parts** vs. **Custom Auto**

Each project is quoted using one of two sets of labor-hour assumptions, chosen by the user:

| | **Formed Parts** | **Custom Auto** |
|---|---|---|
| Intended for | Standard roboformed sheet-metal parts | Custom automotive-style work |
| Difference | Baseline per-operation labor-hour profile | A different per-operation labor-hour profile (generally more RPE-heavy on early forming, lighter ME on scanning) |

The two sets differ **only in the number of labor hours assumed per operation** (§7). Rates, robot-improvement factors, part-level hours, and the overall structure are identical between them. *(Part-level hours used to differ on unistrut — they no longer do; both models now use the same part-level assumptions in §8.)*

> **Assumption:** these two profiles capture the two dominant kinds of work. Everything is quoted as one or the other.

---

## 5. Hourly rates (labor + robot cells)

These are applied to every hour the model assumes. **Rates are held flat across all three tiers (2026 / 2028 / 2030)** — no inflation assumption.

### Labor roles
| Role | $/hr | Notes |
|---|---|---|
| RPE (Robotic Process Engineer) | $90.64 | The engineer who develops the forming recipe |
| ME (Manufacturing Engineer) | $90.64 | |
| Technician | $52.52 | Hands-on cell operation, prep, shipping |
| Purchaser | $77.69 | Material procurement |
| PM (Project Manager) | $84.17 | Project oversight |

### Robot cells (per hour of robot run time)
| Robot type (models) | $/hr |
|---|---|
| **Small** (KR500, M900) | **$10.79** |
| **Medium** (KR1500, M1000) | **$13.69** |
| **Large** (M2000) | **$18.50** |
| Custom (R&D) | user-entered override |

> **Assumption:** the robot cell has its own hourly cost that scales with size. This rate is charged on the *effective* robot hours (after the improvement factor — see §6) for every forming, scanning, and cutting operation, across all trials and the production run.

---

## 6. Time-based improvement assumptions (why later tiers are cheaper)

The tool quotes for a **year of execution**, offered as **three tiers: 2026, 2028, and 2030**. These are deliberately **spread out** (base year, +2 years, +4 years) and the model does **not interpolate** between them — a quote uses whichever tier you pick. Three separate multipliers make the later tiers cheaper, reflecting expected process maturity.

### a) Robot improvement factor — applied to the run-time you enter
Your run-time estimate is treated as a **2026 baseline**; the later tiers multiply it down.

| Operation | 2026 | 2028 | 2030 |
|---|---|---|---|
| Forming | 1.00 | 0.65 | 0.4225 |
| Scanning | 1.00 | 0.75 | 0.50 |
| Cutting | 1.00 | 0.65 | 0.4225 |

> **Assumption:** forming and cutting robot time drops to **65%** at the 2028 tier and **~42%** (0.65²) at 2030; scanning drops to **75%** then **50%**.

### b) Trial reduction factor — applied to the number of forming procedures
The number of pre-IF and IF procedures you enter is multiplied by this factor and **rounded up**.

| | 2026 | 2028 | 2030 |
|---|---|---|---|
| Trial reduction | 1.00 | 0.75 | 0.50 |

> **Assumption:** we need fewer trials to converge as the process matures — 25% fewer at the 2028 tier, half as many at 2030.

### c) Declining labor hours
The per-operation labor-hour tables (§7) also taper across tiers on their own, independent of the two multipliers above (though they no longer fall all the way to zero — a residual 0.5 Tech hr is retained at the 2030 tier).

---

## 7. Labor-hour assumptions per operation *(the core estimates)*

These are the assumed **person-hours per role, per single procedure/operation**, by tier. This is where most of the "how many hours is someone involved in each step" lives.

Operations: **Pre-IF Forming** and **IF Forming** are trial forming; **Duplicate Forming** is the production run. Scanning and cutting each have a "first" (during the trial phase) and "duplicate" (production) variant.

### 7a. Formed Parts — labor hours (RPE / ME / Tech)

| Operation | 2026 | 2028 | 2030 |
|---|---|---|---|
| Forming — Pre-IF | 2.0 / 1.0 / 1.5 | 1.0 / 0.5 / 1.0 | 0.5 / 0 / 0.5 |
| Forming — IF | 0.75 / 0.5 / 1.5 | 0.25 / 0 / 1.0 | 0 / 0 / 0.5 |
| Forming — Duplicate | 0 / 0.5 / 1.5 | 0 / 0 / 1.0 | 0 / 0 / 0.5 |
| Scanning — First | 0.75 / 1.0 / 1.0 | 0.75 / 0 / 0.5 | 0 / 0 / 0.5 |
| Scanning — Duplicate | 0 / 0 / 1.0 | 0 / 0 / 0.5 | 0 / 0 / 0.5 |
| Cutting — First | 3.0 / 2.5 / 0.5 | 1.5 / 0 / 0.5 | 0 / 0 / 0.5 |
| Cutting — Duplicate | 0.5 / 2.0 / 0.5 | 0 / 0 / 0.5 | 0 / 0 / 0.5 |

### 7b. Custom Auto — labor hours (RPE / ME / Tech)

| Operation | 2026 | 2028 | 2030 |
|---|---|---|---|
| Forming — Pre-IF | 2.5 / 0.5 / 0.75 | 1.25 / 0.5 / 0.5 | 0.75 / 0 / 0.5 |
| Forming — IF | 1.0 / 0.5 / 0.75 | 0.25 / 0 / 0.5 | 0 / 0 / 0.5 |
| Forming — Duplicate | 0 / 0.25 / 0.75 | 0 / 0 / 0.5 | 0 / 0 / 0.5 |
| Scanning — First | 0 / 0.25 / 0.5 | 0 / 0 / 0.5 | 0 / 0 / 0.5 |
| Scanning — Duplicate | 0 / 0.25 / 0.5 | 0 / 0 / 0.25 | 0 / 0 / 0.25 |
| Cutting — First | 2.0 / 2.0 / 0.5 | 1.0 / 0 / 0.5 | 0 / 0 / 0.5 |
| Cutting — Duplicate | 0.5 / 2.0 / 0.5 | 0 / 0 / 0.5 | 0 / 0 / 0.5 |

> **Reading the table:** "2.0 / 1.0 / 1.5" means 2.0 RPE hours + 1.0 ME hours + 1.5 Tech hours for that single operation. These hours are charged **per trial** for Pre-IF/IF, and **per part** for the duplicate/production operations.

> **Structural assumption:** scanning is bundled with forming in every procedure. When a part requires **cutting**, the model assumes an **extra scan** in the production sequence (form → scan → scan → cut), so cutting parts carry a second scan.

---

## 8. Part-level overhead assumptions (per part)

Hours assumed for each part, on top of the operations above. **These are now identical for both labor models** (Formed Parts and Custom Auto).

| Item | Applies to | Role | 2026 | 2028 | 2030 |
|---|---|---|---|---|---|
| Prep for shipping / palletize | every part | Tech | 0.5 | 0.5 | 0.5 |
| Unistrut fixturing | every part *(if enabled)* | Tech | 6.0 | 2.0 | 0.5 |
| Purchaser setup | first part only | Purchaser | 2.0 | 1.0 | 0.5 |
| PM setup | first part only | PM | 2.0 | 1.0 | 0.5 |
| Purchaser overhead | every part | Purchaser | 0.25 | 0.25 | 0.25 |
| PM overhead | every part | PM | 0.25 | 0.25 | 0.25 |

> **Assumption:** unistrut is only charged when the part is flagged as needing it. Unistrut, purchaser setup, and PM setup all **taper across tiers** as the process and supply chain mature; prep-for-shipping and the small per-part purchaser/PM overheads stay flat.

---

## 9. Project-level overhead assumptions (per project, first assembly)

Applied once to the project (charged to the first assembly), by tier:

| Item | Role | 2026 | 2028 | 2030 |
|---|---|---|---|---|
| Purchaser overhead | Purchaser | 2.0 | 1.0 | 1.0 |
| PM overhead | PM | 5.0 | 3.0 | 1.0 |

Plus a user-entered **"splitting" setup** (RPE hours to split the geometry/skirt across cells).

> **Assumption:** project-level coordination shrinks as the org matures (PM 5→1 hr).

---

## 10. Setup, materials, and outside services (user-entered per part)

These are entered per quote rather than assumed, but they feed the model:

- **Setup / skirt / path plan / sim** — RPE hours, first part only (default 4 hrs).
- **First-part additional setup** — extra one-time cost.
- **Sheet material** — `cost per sheet ÷ parts per sheet` = material cost per part; charged on every trial and every production part.
- **Heat treatment** — cost per part.
- **Post-processing** — split into **internal** (done in-house, counts as labor/margin) and **external** (outside service — see margins §11).
- **Shipping** — per part and/or per project.
- **Non-roboformed parts** — a part can be flagged as made another way, with flat first/duplicate costs instead of the roboforming buildup.

---

## 11. Margin assumptions (turning cost into price)

The quoted price splits cost into two buckets and marks each up differently:

| Bucket | What's in it | Default margin |
|---|---|---|
| **Internal** | Labor, robot time, in-house post-processing, setup | **70%** |
| **OSP (outside service providers)** | Materials, heat treatment, shipping, external post-processing | **10%** |

Price is computed as `cost ÷ (1 − margin)` for each bucket, then summed.

> **Assumption:** we take a healthy 70% margin on the value we add ourselves, but only a thin 10% pass-through markup on money that flows straight to outside vendors (material, heat treat, shipping).

---

## 12. End-to-end: how one quote is built

1. Pick the **tier/year** (2026 / 2028 / 2030), **labor model** (Formed Parts / Custom Auto), and **margins**.
2. For each part:
   - Apply **trial reduction** to the procedure counts (round up).
   - Cost each **Pre-IF** and **IF** trial = material + forming ops + scan ops (labor from §7, robot = your hours × improvement factor × cell rate).
   - Add **first-part setup** (RPE, purchaser, PM), final scan/cut, part overhead → **First Part cost**.
   - Cost one **Duplicate** = production forming + scan (+scan+cut if cutting) + material + part overhead → **Duplicate cost**.
3. Roll parts up into a **first assembly** (NRE-bearing) and **duplicate assemblies**.
4. Add **project overhead** (§9) + splitting setup + shipping.
5. Split total cost into **Internal** vs **OSP**, apply the two **margins**, sum → **Quoted Price**.
6. Show the same quote across the three tiers — **2026 / 2028 / 2030** — for comparison.

---

## 13. Assumptions cheat-sheet (for a summary slide)

- Quotes are driven by two user inputs: **robot run-time** and **number of forming trials**. Everything else is modeled.
- Cost is split into **First Part (NRE)** vs **Duplicate (production)** — trials are a one-time cost.
- Two labor profiles: **Formed Parts** vs **Custom Auto** — they now differ **only in per-operation labor hours** (§7); part-level hours are identical.
- **Labor hours per step** are fixed assumptions per role (RPE / ME / Tech) per operation per tier (§7).
- **Rates flat across all tiers**: RPE/ME $90.64, Tech $52.52, PM $84.17, Purchaser $77.69; robots Small $10.79 / Medium $13.69 / Large $18.50.
- Three **spread-out tiers — 2026 / 2028 / 2030** (base, +2yr, +4yr); no interpolation between them.
- Later tiers are cheaper via **3 independent levers**: robot speed-up (forming/cut ×0.65 → ×0.4225, scan ×0.75 → ×0.50), **fewer trials** (×0.75 then ×0.50), and **tapering labor hours** (down to a 0.5 Tech-hr residual at 2030).
- Robot run-time you enter is a **2026 baseline**; the model scales it down for later tiers.
- **Cutting parts** get an extra scan in production; **unistrut** only when flagged (and now tapers 6 → 2 → 0.5 hrs in both models).
- Margins: **70% internal**, **10% on outside services** (material, heat treat, shipping, external post-processing).

---

*Generated from the live model in `backend/calculations.py`. If the code changes, re-verify these numbers before quoting them externally.*
