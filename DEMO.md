# DEMO.md — Production Orders demo script

Presenter's reference for demoing the Production Order mock app.
Keep this open on a second screen.

**Start URL:** <http://localhost:4004/login/webapp/index.html>

---

## Before you present

```bash
cd /home/rahul/Desktop/projects/prod_order
npm run deploy:sqlite   # reset to the clean 10 seeded orders
npx cds watch
```

Run the reset if you have rehearsed — otherwise your practice orders and
confirmations will be sitting in the list mid-demo.

**Rehearse the Switch User round trip once.** Moving Ravi → Priya → Meera live,
in one browser window, is the moment that sells it — no incognito windows, no
logging out and back in.

---

## The pitch (30 seconds, before clicking anything)

> "This is production order management — create, display, change, release,
> confirm. What I want to show you isn't just the screens. It's that **three
> different people log into the same system and get three different apps**, and
> that the whole thing is built on SAP's own data model, so it swaps onto your
> live S/4 system without a rewrite."

**If asked what's behind it:** SAP CAP on Node.js, Fiori Elements front end,
SQLite underneath. No SAP system connected — it is self-contained so it runs
anywhere.

---

## Act 1 — Ravi the Operator (lead with the restricted role)

**Log in as Ravi.** Three named people, no passwords. Point at the blue strip:
_"This login is a demo prop — I'll come back to that."_

Header reads **Ravi Kumar · Operator**. The list shows 10 orders.

> "Ravi works a machine. Look at his toolbar — **Confirm**. That's it. There's
> no Create button, no Edit, no Release. Not greyed out — **not there at all**.
> He can't invent production that nobody planned."

Open any order → **no Edit button** on the detail page either. Show him
filtering by Plant or Status so they see read access is completely normal.

---

## Act 2 — Priya the Planner

**Switch User** (top right) → **Log in as Priya**.
Header changes to **Priya Sharma · Planner**.

> "Same system, same data, same URL. Different person."

**Create and Release have appeared. Confirm is gone** — planners plan, they
don't report yield off the shop floor.

### Create (show the validation)

**Create** → leave **Material** empty → **Save**:

> _"Material is required to create a production order."_

That check is on the **server**, not the browser. Fill in a material → Save.
You get **1000000011**, status **CRTD**, and it already has operations `0010`
and `0020` — so it is immediately ready to be worked.

### Change (show the boundary)

Open **1000000001** → **Edit**. Only three fields accept input:
**Total Quantity**, **Planned Start**, **Planned Finish**.

> "Material, plant, order type — locked. You don't re-point an order at a
> different material halfway through; you close it and raise a new one. The app
> enforces that, not a training manual."

### Release

On **1000000001** (CRTD) → **Release**. Status flips **CRTD → REL**, and **the
Release button disappears** — it is already released, so the action is gone.

---

## Act 3 — Meera the Supervisor, and the full lifecycle

**Switch User** → **Log in as Meera**. Everything visible: Create, Change,
Release, Confirm.

> "Meera runs the line. She handles exceptions, so she can step in anywhere."

### The status walk — open 1000000003 (REL, FG-VALVE-050, qty 500)

1. **Confirm** — operation `0010`, yield `200`, leave Final unticked
   → order goes **REL → PCNF** (partially confirmed)

2. **Confirm** — operation `0010`, **leave yield blank**, tick **Final Confirmation**
   > "Blank means 'confirm whatever's left' — the system knows the open
   > quantity. The operator doesn't do mental arithmetic at the machine."

   → operation `0010` is now CNF, order stays **PCNF** — because `0020` isn't done

3. **Confirm** — operation `0020`, final
   → order goes **CNF**. Every operation complete, so the order completes.

**Optional validation moment:** enter a yield above what's left →
_"Yield quantity 999 exceeds the open quantity 300 for operation 0010."_

---

## The status pills — your visual anchor

| Status   | Colour | Means                                |
| -------- | ------ | ------------------------------------ |
| **CRTD** | grey   | Created, not yet released to the floor |
| **REL**  | blue   | Released — work can start            |
| **PCNF** | orange | Partially confirmed — in progress    |
| **CNF**  | green  | Fully confirmed — done               |

Pre-seeded so filtering has something to show: 2 CRTD, 3 REL, 3 PCNF, 2 CNF.

---

## The two ideas to land

**1. Buttons are hidden, not greyed — and two rules stack.**

- _Who you are_ (role from login)
- _What state the order is in_ (a CNF order shows neither Release nor Confirm,
  even for Meera)

> "Nobody stares at a greyed-out button wondering what they did wrong. If it's
> not their job, or not the right time, it isn't on screen."

**2. The field names are SAP's, not ours.**

Open <http://localhost:4004/service/po/$metadata> if they're technical:

> "`ManufacturingOrder`, `ProductionPlant`, `MfgOrderPlannedEndDate` — these are
> the exact field names from SAP's Production Order API. Today they're served
> from a local database. Pointing this at your real S/4 system means changing
> the data source, not the model and not the screens."

---

## Questions you'll get — answer these honestly

**"Is the login secure?"**
No, and say so plainly. It is cosmetic — no password, and the service is not
role-gated; a direct API call succeeds in any role. It exists to _show_
role-based access. The role names (`PO_Planner` / `PO_Operator` /
`PO_Supervisor`) are the real XSUAA names, so wiring in proper authentication
replaces the login screen and leaves everything downstream untouched.

**"Is this connected to SAP?"**
No. Zero external calls. That is deliberate — it demos anywhere, including with
no network access to their systems.

**"Can we add components / edit operations / delete an order?"**
Not in this version, by design — the real API doesn't support it that way, and
it is blocked in the service, not just hidden in the UI. Deleting an order
returns _"Entity ProductionOrders is not deletable."_

**"Why the Save/Cancel step on create?"**
That is Fiori's draft flow. CLAUDE.md originally specified draft _disabled_, but
Fiori Elements v4 renders no Create button at all without it, so draft was
switched on. Practical effect is one extra click.

---

## Reference — the seeded data

| Order      | Material      | Qty | Status | Good for                  |
| ---------- | ------------- | --- | ------ | ------------------------- |
| 1000000001 | FG-PUMP-100   | 100 | CRTD   | Release + Change demo     |
| 1000000002 | FG-PUMP-200   | 250 | CRTD   | second CRTD               |
| 1000000003 | FG-VALVE-050  | 500 | REL    | **full Confirm walk**     |
| 1000000004 | FG-VALVE-075  | 300 | REL    |                           |
| 1000000005 | FG-MOTOR-15KW | 40  | REL    | has 3 operations          |
| 1000000006 | FG-PUMP-100   | 150 | PCNF   | already part-confirmed    |
| 1000000007 | FG-GEARBOX-A3 | 80  | PCNF   | op 0010 done, 0020 partial |
| 1000000008 | FG-MOTOR-22KW | 60  | PCNF   |                           |
| 1000000009 | FG-VALVE-050  | 200 | CNF    | completed order           |
| 1000000010 | FG-PUMP-200   | 120 | CNF    |                           |

All plant **1100**. Filtering by Material `FG-PUMP-100` or `FG-VALVE-050`
returns two orders each.

**Confirmation log** (every posting is recorded):
<http://localhost:4004/service/po/Confirmations>
