## Tour Quotation Builder — 18-Step Wizard

Replace the current single-page Final Costing with a multi-step wizard while keeping all other modules untouched. The route stays `/costing` (sidebar label changes to "New Quotation").

### Architecture

```text
src/routes/_authenticated/costing.tsx      ← wizard shell (progress bar + nav + right summary)
src/lib/wizard/
  types.ts                                 ← QuoteDraft type covering all 18 steps
  store.ts                                 ← useSyncExternalStore-backed draft in localStorage
                                             key: mp_tourism_draft_quote
  calc.ts                                  ← cost roll-up per hotel option (rooms + GST + addons + markup + 5% GST)
  agents-store.ts                          ← mock B2B agents (localStorage)
  programs-store.ts                        ← mock saved programs (localStorage)
src/components/wizard/
  WizardShell.tsx                          ← progress bar, back/next, save-draft, right summary drawer
  StepProgress.tsx
  SummarySidebar.tsx
  steps/
    Step01_QueryType.tsx      Step02_Identification.tsx
    Step03_Duration.tsx       Step04_Program.tsx
    Step05_DatesPax.tsx       Step06_Category.tsx
    Step07_Departure.tsx      Step08_TravelMode.tsx
    Step09_Routing.tsx        Step10_Transport.tsx
    Step11_Activities.tsx     Step12_Entrances.tsx
    Step13_Guide.tsx          Step14_Miscellaneous.tsx
    Step15_Accommodation.tsx  Step16_CostingVariations.tsx
    Step17_FinalCosting.tsx   Step18_Optionals.tsx
```

### Step behaviours (concise)

1. **Query Type** — 3 large cards: B2B / B2C / Brochure.
2. **Identification** — B2B: agent picker + "Add agent"; B2C: guest form; Brochure: tour type + theme + event + period.
3. **Duration** — nights input; days = nights + 1 (readonly).
4. **Program** — radio: pre-select saved program (auto-fill routing) or new + program name.
5. **Dates & Pax** — start date, computed end date; adults / SS / children with per-child age; total auto.
6. **Category** — multi-select chip tags (min 1).
7. **Departure** — city (B2B/B2C) or Ex-point text (Brochure).
8. **Travel Mode** — checkboxes with conditional sub-fields (flight class, train class).
9. **Routing** — auto-generate N+1 day rows; O/N city dropdown, program text/select toggle; entrance chips suggested by city.
10. **Transport** — repeatable rows from Travels module; total = rate × vehicles × days.
11. **Activities** — checkbox list grouped by destination + custom.
12. **Entrances** — auto-suggest from routing cities + manual; indian/foreigner split.
13. **Guide** — repeatable rows from Guide module.
14. **Miscellaneous** — checkbox list with unit-aware qty defaults + custom.
15. **Accommodation** — up to 4 tabbed options (A–D); per O/N city: hotel/room/meal + rate lookup indicator.
16. **Costing Variations** — comparison table across options (rooms, GST, add-ons, markup, 5% GST, grand, per-pax SGL/DBL/TRP) + Inclusions/Exclusions editors.
17. **Final Costing** — clean summary + per-pax comparison; mark one option as recommended.
18. **Optionals** — un-selected activities/entrances + custom; each with "Add to Quote" that folds into totals; final actions: Save Quote / PDF / Excel / Print.

### Shared behaviours

- Progress bar: 18 numbered circles with short labels. Completed = navy + check, current = accent orange, future = gray. Click on completed step jumps back.
- Back / Next buttons at bottom; Next disabled until step's required fields pass a per-step `isValid(draft)` check.
- Save Draft button (top-right) writes to `mp_tourism_draft_quote`; on `/costing` mount, if a draft exists show a banner "Continue draft from {time}?" with Resume / Discard.
- Right sidebar (collapsible, visible Step 5+): query type badge, tour name, dates+duration, pax, routing chain, running cost estimate from `calc.ts`.
- Save at Step 18 pushes a full `SavedQuote` (extended shape) into existing quotes store and clears the draft.

### Saved Quote extension

Extend `SavedQuote` with optional fields: `query_type`, `agent`, `guest`, `brochure`, `categories`, `travel_modes`, `hotel_options` (A–D with per-pax totals), `inclusions`, `exclusions`, `optionals`, `recommended_option`. Existing quotes remain valid (all new fields optional). Excel/PDF exports keep working with the current cost sheet; option-comparison sheet is added when `hotel_options` present.

### Sidebar

Rename `"Final Costing"` → `"New Quotation"` in `src/components/AppSidebar.tsx`; icon and route unchanged.

### Out of scope (unchanged)

Hotels, Travels, Miscellaneous, Entrances, Guide, Activities, Reports, Saved Quotes list, Settings, Dashboard, theme, and localStorage keys used by them.

### Technical notes

- Draft store uses `useSyncExternalStore` with a cached snapshot (same pattern as `quotes-store.ts`) to avoid the earlier infinite-loop regression.
- Rate lookup reuses existing hotel `rate_plans` helpers from `mock-store.ts`.
- GST logic reuses the current rule: 5% if room ≤ ₹7,500, 18% otherwise; final 5% on (net_with_gst + addons + markup).
- No new npm dependencies; PDF/Excel/Print reuse existing `QuoteDocument` + `quotes-export.ts`, extended to render option comparison when present.

Shall I build it?
