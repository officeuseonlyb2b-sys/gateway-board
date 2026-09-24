# Quotation UI Preservation Map

This document records the non-destructive quotation UI restructuring completed in Phase 2.
No pricing formula, master-data lookup, stored field, question, option, or quotation output action was removed.

| Existing area        | Revised presentation                     | Behaviour retained                                                                          |
| -------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------- |
| Type                 | Quote Setup / Type                       | B2B, B2C and Brochure choices remain available                                              |
| Who                  | Quote Setup / Who                        | Agent selection, B2C fields and Brochure fields remain available                            |
| Trip Basics          | Trip Brief                               | Pax, range, traveller category, departure, travel mode, dates and duration remain available |
| Program              | Program & Routing / Program              | Existing-program and new-program modes remain available                                     |
| Routing              | Program & Routing / Routing              | Every day-wise routing field remains available                                              |
| Activity             | Services & Stay / Land Part / Activity   | Existing activity lookup and custom activity behaviour retained                             |
| Guide                | Services & Stay / Land Part / Guide      | Existing guide options and language controls retained                                       |
| Entrances            | Services & Stay / Land Part / Entrances  | Existing entrance and traveller-category options retained                                   |
| Misc                 | Services & Stay / Land Part / Misc       | Existing master and custom miscellaneous items retained                                     |
| Transport            | Services & Stay / Land Part / Transport  | Vehicle, day-wise, route-wise and total-rate controls retained                              |
| Hotels               | Services & Stay / Accommodation / Hotels | All hotel options, rate overrides and allocation controls retained                          |
| Meals                | Services & Stay / Accommodation / Meals  | Hotel and restaurant meal selections retained                                               |
| Costing              | Review & Generate / Costing              | Existing costing sheets, selections, scenarios and settings retained                        |
| Final                | Review & Generate / Final                | Existing final comparison and recommendation controls retained                              |
| Optionals            | Review & Generate / Optionals            | Suggested/custom optionals and all final actions retained                                   |
| Save Draft           | Persistent header                        | Existing named-draft behaviour retained                                                     |
| Save Quote           | Persistent header and final actions      | Existing quote-saving paths retained                                                        |
| Discard              | Persistent header                        | Existing discard confirmation retained                                                      |
| PDF, Excel and Print | Final actions                            | Existing output actions retained                                                            |

## UI-only additions

- Persistent quotation context header.
- Grouped left-side navigation while retaining all ten original steps.
- Compact-screen original ten-step progress bar.
- Always-visible desktop live quotation snapshot.
- Non-blocking readiness indicators.
- Counts for every Land Part and Accommodation sub-section.
- Correct ten-step labels and completion bar on the Drafts page.
- Recent Quotes name, seven-day default view, All view, date grouping and linked Query access.

## Explicitly unchanged

- Calculation modules and formulas.
- Master-data stores and lookups.
- Query costing-save logic.
- Program creation logic.
- Draft and quote persistence mechanisms.
- Brochure functionality.
