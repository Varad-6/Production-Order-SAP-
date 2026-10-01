# CLAUDE.md — Production Order App (Mock Demo)

Context and conventions for building this project with Claude Code. Read this before generating or editing anything.

---

## What this is

A **self-contained mock** of a Production Order management app: Create, Change, Display, Confirm. It looks and behaves like the real thing but talks to a **local SQLite database**, not a live SAP S/4HANA Cloud tenant. Purpose: a fast, deployable demo on Cloud Foundry with zero backend dependencies.

**Stack:** SAP CAP (Node.js) · CDS · SQLite · Fiori Elements (List Report + Object Page) · UI5 · deploy to Cloud Foundry.

**This is a demo, not the product.** No destination, no communication arrangement, no external calls. Everything is served from CAP over local data.

### The one rule that makes this reusable

**Mirror the real SAP OData entity and field names in the mock CDS model.** The mock `ProductionOrder` entity uses `ManufacturingOrder`, `Material`, `ProductionPlant`, `TotalQuantity`, etc. — the same names as `API_PRODUCTION_ORDER_2_SRV`. That way the demo swaps to the live S/4 service later by replacing the data source, not the model or the UI. Do not invent convenient field names. Match SAP's.

---

## Architecture

```
Browser → Fiori Elements (List Report + Object Page)
        → CAP service (Node.js)
        → SQLite (seeded mock data)
```

No approuter needed for the demo (CAP serves the UI directly). No XSUAA — the login is a **cosmetic mock** (see "Login screen & roles" below): a UI5 landing view that lets you pick one of three personas and drives which action buttons show. It is not real security, and the CAP service is not role-gated.

```
production-order-mock/
├── db/
│   ├── schema.cds          # domain model (SAP-aligned names)
│   └── data/               # seed CSVs
├── srv/
│   ├── po-service.cds      # service definition + annotations
│   └── po-service.js       # custom handlers (confirm, release, validation)
├── app/
│   ├── login/              # cosmetic mock login view (3 personas) — entry point
│   └── productionorders/   # Fiori Elements app (List Report + Object Page)
├── package.json
├── mta.yaml                # for CF deploy
└── CLAUDE.md
```

---

## Domain model (`db/schema.cds`)

Namespace `abhiyanta.po`. Field names deliberately match the S/4 API.

**ProductionOrder** (header — this is what Create/Change/Display act on)
| Field | Type | Notes |
|---|---|---|
| ManufacturingOrder | String(12), key | Order number. Generate on create (e.g. `1000000xxx`). |
| ManufacturingOrderType | String(4) | e.g. `PP01` |
| Material | String(40) | **Mandatory on create** |
| ProductionPlant | String(4) | e.g. `1100` |
| TotalQuantity | Decimal(13,3) | |
| ProductionUnit | String(3) | e.g. `PC` |
| MfgOrderPlannedStartDate | Date | |
| MfgOrderPlannedEndDate | Date | Finish date |
| ProductionSupervisor | String(3) | |
| OrderIsReleased | Boolean | |
| ProductionOrderStatus | String(4) | `CRTD` / `REL` / `PCNF` / `CNF` — drives the status pill |
| to_Operations | Composition of many | |
| to_Components | Composition of many | |

**ProductionOrderOperation** (read-only in the app)
| Field | Type |
|---|---|
| ManufacturingOrder | String(12), key (assoc to header) |
| ManufacturingOrderSequence | String(6) |
| ManufacturingOrderOperation | String(4), key — e.g. `0010` |
| OperationText | String(40) |
| WorkCenter | String(8) |
| OperationConfirmedYieldQuantity | Decimal(13,3) |
| OperationStatus | String(4) — `CRTD`/`REL`/`PCNF`/`CNF` |

**ProductionOrderComponent** (read-only in the app — see constraints)
| Field | Type |
|---|---|
| ManufacturingOrder | String(12), key |
| Material | String(40) — component material |
| RequiredQuantity | Decimal(13,3) |
| WithdrawnQuantity | Decimal(13,3) |
| ProductionPlant | String(4) |

**Confirmation** (append-only log of postings)
| Field | Type |
|---|---|
| ConfirmationID | UUID, key |
| OrderID | String(12) |
| Sequence | String(6) |
| OrderOperation | String(4) |
| ConfirmationYieldQuantity | Decimal(13,3) |
| ConfirmationScrapQuantity | Decimal(13,3) |
| FinalConfirmationType | String(1) — `X` = final, ` ` = partial |
| PostingDate | DateTime |

Seed 8–12 orders across the four statuses so the demo has something to filter, plus operations and components on each. Put seed data in `db/data/abhiyanta.po-*.csv`.

---

## Functionality (keep exactly as specified)

These are the app's four functions and the rules that govern them. **The constraints are not optional — they come from the real API's capabilities and keep the mock honest, so it stays swappable to the live service later.**

### 1. Display

- List Report over `ProductionOrder` with search and filters.
- Filters (SelectionFields): `Material`, `ProductionPlant`, `ManufacturingOrderType`, `ProductionOrderStatus`.
- Object Page shows header fields, an **Operations** facet, and a **Components** facet.

### 2. Create (header only)

- Dialog captures: `ManufacturingOrderType`, `Material`, `ProductionPlant`, `TotalQuantity`, `MfgOrderPlannedEndDate`.
- **Material is mandatory** — validate in the create handler and return a clear message if missing.
- On create: generate the order number, set `ProductionOrderStatus = 'CRTD'`, `OrderIsReleased = false`. Optionally auto-generate one or two mock operations (`0010`, `0020`) so the order is confirmable.
- **Header level only.** Do not let the UI add components or operations on create.

### 3. Change (header only)

- Editable fields: `TotalQuantity`, `MfgOrderPlannedStartDate`, `MfgOrderPlannedEndDate`.
- **Everything else read-only**, including operations and components. This is a hard rule, not a UX preference.

### 4. Release (supporting action)

- Bound action `releaseOrder` on a `CRTD` order → set `ProductionOrderStatus = 'REL'`, `OrderIsReleased = true`.
- Action visible only when status is `CRTD`.

### 5. Confirm

- Bound action `confirmOperation` with a dialog: yield quantity (default = open quantity), scrap quantity, final-confirmation toggle.
- Partial confirmation → operation and order move to `PCNF`.
- Final confirmation (`FinalConfirmationType = 'X'`) → `CNF`.
- Write a `Confirmation` row each time. Update `OperationConfirmedYieldQuantity` and status.

### Hard scope boundary — do NOT build

- **No component add.** Components are display-only.
- **No operation edit or create** through the UI.
- **No order delete.**
- **No item or PRT editing.**

If a request would add any of these, stop and flag it rather than implementing — it breaks the alignment with the real API.

---

## Login screen & roles (mocked, cosmetic)

A fake front door for the demo. **NOT real auth** — no password check, no
backend enforcement. It exists so the client _sees_ role-based access: three
different people log in and get three visibly different apps from the same
system. This makes the "role-based access replaces shared GUI logins" pitch
concrete. It's a demo prop; do not claim it's secure.

### The three personas (real-world manufacturing roles)

Modelled on how an actual plant floor works: the office plans, the floor
executes, the supervisor oversees.

| Persona        | Mock user    | Role name       | Can do                              | Real-world reason                                                                                                           |
| -------------- | ------------ | --------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Planner**    | Priya Sharma | `PO_Planner`    | Display · Create · Change · Release | Plans and schedules from the office. Decides what's built and when. Never stands at a machine.                              |
| **Operator**   | Ravi Kumar   | `PO_Operator`   | Display · **Confirm only**          | Works the machine. Reports yield/scrap as work happens. Does _not_ plan or create — that would invent unplanned production. |
| **Supervisor** | Meera Nair   | `PO_Supervisor` | Everything                          | Runs the line, handles exceptions, can step in anywhere.                                                                    |

The **key contrast that sells the demo:** log in as Ravi (Operator) → there is
**no Create button anywhere**, only Confirm. Log in as Priya (Planner) →
Create/Change/Release appear. Log in as Meera → everything. Same system, three
different apps.

> Note: the source documents collapsed these three personas into two technical
> roles (`PO_Viewer` / `PO_Processor`) in the `xs-security.json` spec, but the UI
> Design Guide's "role-first" principle explicitly describes all three
> ("operator sees confirm; planner sees create/change; supervisor sees
> everything"). The demo uses the three-persona version because it tells the true
> shop-floor story. When this becomes real, these map to XSUAA roles of the same
> names.

### Behaviour

- App opens on a **login screen**, not the order list.
- Three named users to pick from (buttons or a dropdown + "Log in"):
  Priya (Planner) · Ravi (Operator) · Meera (Supervisor).
- Selecting a user stores the choice in a client-side model (UI5 `JSONModel` —
  **no browser storage**, per artifact rules) and navigates into the List Report.
- The shell header always shows the logged-in name and role.
- A "Switch user" / "Log out" action returns to the login screen and clears the
  selection. This is how you demo all three roles live — no incognito windows.

### Role effect on the UI (cosmetic only)

Action visibility is driven off the selected role in the client model.
**Hidden, not greyed out** (per the Design Guide):

- **Operator (Ravi):** Create, Change, Release **hidden**. Confirm **visible**.
  Display and filtering work normally.
- **Planner (Priya):** Create, Change, Release **visible**. Confirm hidden (or
  visible — planners don't confirm on the floor, so hide it to keep the story clean).
- **Supervisor (Meera):** all actions visible.

This is presentation logic only. The CAP service is **not** role-gated in this
version — a raw call would still succeed. Fine for a cosmetic demo; the file says
so plainly so nobody later mistakes it for real security.

### Build approach

- Simplest path: a small custom UI5 view as the app's entry point (login), then
  route into the Fiori Elements List Report.
- If a custom view ahead of Fiori Elements fights the generator, fall back to an
  flpSandbox launchpad landing page with the login as the first view.
- Keep the login view trivial: three options, name, role, a button. Horizon
  Morning, matches the app. **Comment it clearly as MOCK.**

### Keep it swappable

- Use role names `PO_Planner` / `PO_Operator` / `PO_Supervisor` in the client
  model. When this becomes real, the cosmetic screen is replaced by actual auth
  (XSUAA mock → real) using the same role names; the button-visibility logic can
  stay as-is.

---

## UI conventions (from the UI Design Guide)

- **Theme:** SAP Horizon (Morning). No custom CSS. Default SAP 72 typography.
- **Status pills** via criticality on `ProductionOrderStatus` and `OperationStatus`:
  - `CRTD` → neutral/grey
  - `REL` → positive/teal
  - `PCNF` → in-progress/light blue
  - `CNF` → complete/navy
    Implement with `@UI.Criticality` + a computed criticality field, or a value-based criticality mapping.
- **Editing:** direct edit, **draft disabled** (`@odata.draft.enabled: false`). Simpler for a demo.
- **Actions the user can't perform are hidden, not greyed out** (bind action visibility to status).
- List: growing/scroll, ~25 rows. Busy indicator on every action.

### Annotations to generate (`srv/po-service.cds`)

- `@UI.SelectionFields`: the four filter fields above.
- `@UI.LineItem`: order, material, plant, quantity, planned end date, status (with criticality).
- `@UI.HeaderInfo`: title = ManufacturingOrder, description = Material.
- `@UI.Facets`: header fields group + Operations table facet + Components table facet.
- `@UI.Identification` `DataFieldForAction` entries for `confirmOperation` and `releaseOrder`.

---

## Handlers (`srv/po-service.js`)

- `before('CREATE', 'ProductionOrders')` — reject if `Material` is empty (400 + readable message). Set status `CRTD`, generate order number, seed mock operations.
- `on('releaseOrder')` — flip status to `REL` only from `CRTD`; else return a clear error.
- `on('confirmOperation')` — validate yield ≤ open quantity; insert a `Confirmation`; update operation yield and status; roll status to `PCNF` (partial) or `CNF` (final).
- Keep handlers small and readable — this is demo code that people will read on screen.

---

## Commands

```bash
# Install
npm install

# Run locally with in-memory SQLite (fastest for dev)
cds watch

# Or persistent SQLite file
cds deploy --to sqlite:db/po.db
cds watch --profile sqlite

# App runs at http://localhost:4004
# Fiori app under /productionorders/webapp/index.html
```

**Deploy to Cloud Foundry:**

```bash
npm add -D mbt
cds add hana,mta          # or keep sqlite bundled for a pure-demo push
mbt build
cf login -a <api-endpoint>
cf deploy mta_archives/*.mtar
```

> **SQLite on CF is ephemeral** — the file resets on restart/rescale. Fine for a demo; re-seed on deploy. If the demo must survive restarts, switch to HANA Cloud (`cds add hana`) — but don't do that unless asked; it adds cost and setup the demo doesn't need.

---

## Conventions & guardrails

- **Match SAP field names** in the model — this is the whole point (swappability). Never rename for convenience.
- **Keep it mock.** No `destination`, no `@sap-cloud-sdk`, no external HTTP, no remote service imports. If a task implies calling a real S/4 system, stop — that's the _next_ phase, not this one.
- **Respect the scope boundary** in the "do NOT build" list above.
- Node.js 20 LTS, `@sap/cds` current major, `@sap/cds-dk` for CLI.
- Prefer Fiori Elements + annotations over freestyle UI5. Only drop to freestyle for the confirm dialog if annotations can't express it cleanly.
- Small, readable handlers and seed data — the code is part of the demo.
- **No XSUAA / real auth.** The only auth is the cosmetic login mock (three personas, client-side, button visibility only). Do not gate the CAP service by role. Do not add browser storage — hold the selected user in a UI5 JSONModel.

---

## When it's done

A CF-deployed app that opens on a mock login screen. Log in as **Ravi (Operator)** → read + Confirm only, no Create button. Log in as **Priya (Planner)** → Create, Change, Release. Log in as **Meera (Supervisor)** → everything. In any role with the rights, you can filter orders, open one, create a new one (material enforced), change quantity and dates, release a created order, and confirm an operation partial-then-final — with status pills changing CRTD → REL → PCNF → CNF — all backed by SQLite, no SAP system in the loop. "Switch user" returns to the login so all three roles can be shown back-to-back.
