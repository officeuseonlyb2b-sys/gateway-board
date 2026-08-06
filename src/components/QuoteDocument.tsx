import { Fragment } from "react";
import { inr, fmtDateShort } from "@/lib/format";
import { useBranding } from "@/lib/branding";
import type { SavedQuote } from "@/lib/quotes-store";
import { buildAddonGroups } from "@/lib/addon-breakdown";

// Beautiful A4 print/PDF-ready quote document.
// Wrapper adds `.quote-print-target` so print CSS can isolate it.

const TEAL = "#0f4c5c";
const GOLD = "#d4a017";

interface Props { quote: SavedQuote; }

export function QuoteDocument({ quote: q }: Props) {
  const b = useBranding();
  const includeSgl = q.include_sgl;
  const includeDbl = q.include_dbl;
  const includeTrp = q.include_trp;

  return (
    <div className="quote-print-target bg-white text-[#222] mx-auto"
      style={{ width: "210mm", minHeight: "297mm", padding: "12mm 14mm", fontFamily: "Inter, system-ui, sans-serif", fontSize: 11 }}>
      {/* HEADER */}
      <div className="flex items-start justify-between gap-6 pb-3" style={{ borderBottom: `2px solid ${TEAL}` }}>
        <div className="flex items-center gap-3">
          {b.logo ? (
            <img src={b.logo} alt="logo" style={{ height: 56, width: "auto", objectFit: "contain" }} />
          ) : (
            <div style={{ height: 56, width: 56, borderRadius: 28, background: TEAL, color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 20 }}>MP</div>
          )}
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: TEAL }}>{b.companyName}</div>
            <div style={{ fontSize: 10, color: "#666" }}>{b.tagline}</div>
          </div>
        </div>
        <div className="text-right">
          <div style={{ fontSize: 20, fontWeight: 800, color: TEAL, letterSpacing: 0.5 }}>TOUR COST ESTIMATE</div>
          <div style={{ fontSize: 10, color: "#333", marginTop: 4 }}>
            <div><b>Quote No:</b> {q.quote_number}</div>
            <div><b>Date:</b> {fmtDateShort(q.saved_at)}</div>
            <div><b>Valid Until:</b> {fmtDateShort(new Date(+new Date(q.saved_at) + 7 * 86400000).toISOString())}</div>
            <div><b>Prepared By:</b> {q.saved_by}</div>
          </div>
        </div>
      </div>

      {/* TOUR OVERVIEW */}
      <div style={{ background: "#e6f0f2", border: `1px solid ${TEAL}22`, borderRadius: 6, padding: "10px 14px", marginTop: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, fontSize: 11 }}>
          <div><b style={{ color: TEAL }}>Tour Route:</b> {q.cities.join(" → ")}</div>
          <div><b style={{ color: TEAL }}>Duration:</b> {q.total_nights} Nights / {q.total_nights + 1} Days</div>
          <div><b style={{ color: TEAL }}>Travel Dates:</b> {fmtDateShort(q.travel_start)} – {fmtDateShort(q.travel_end)}</div>
        </div>
      </div>

      {/* ITINERARY TABLE */}
      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: TEAL, marginBottom: 4 }}>ITINERARY</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
          <thead>
            <tr style={{ background: TEAL, color: "#fff" }}>
              <Th>Day</Th><Th>Date</Th><Th>Destination</Th><Th>Hotel</Th>
              <Th>Category</Th><Th>Meal</Th>
              <Th align="right">SGL</Th><Th align="right">DBL</Th><Th align="right">TRP</Th>
            </tr>
          </thead>
          <tbody>
            {q.itinerary.map((d, i) => (
              <>
                <tr key={d.day_number} style={{ background: i % 2 ? "#f7f9fa" : "#fff" }}>
                  <Td>{d.day_number}</Td>
                  <Td>{fmtDateShort(d.date)}</Td>
                  <Td>{d.city}</Td>
                  <Td>
                    <div style={{ fontWeight: 600 }}>{d.hotel_name}</div>
                    <div style={{ fontSize: 8, color: "#888" }}>
                      {d.season_label} ({fmtDateShort(d.validity_start)} – {fmtDateShort(d.validity_end)})
                    </div>
                  </Td>
                  <Td>{d.hotel_category}</Td>
                  <Td>{d.meal_plan}</Td>
                  <Td align="right"><b>{inr(d.rates.sgl_total)}</b></Td>
                  <Td align="right"><b>{inr(d.rates.dbl_total)}</b></Td>
                  <Td align="right"><b>{inr(d.rates.trp_total)}</b></Td>
                </tr>
                <tr style={{ background: i % 2 ? "#f7f9fa" : "#fff", color: "#888", fontSize: 8 }}>
                  <Td colSpan={6}></Td>
                  <Td align="right">Net: {inr(d.rates.sgl_net)} + GST {Math.round(d.rates.sgl_gst_rate * 100)}%: {inr(d.rates.sgl_gst_amt)}</Td>
                  <Td align="right">Net: {inr(d.rates.dbl_net)} + GST {Math.round(d.rates.dbl_gst_rate * 100)}%: {inr(d.rates.dbl_gst_amt)}</Td>
                  <Td align="right">Net: {inr(d.rates.trp_net)} + GST {Math.round(d.rates.trp_gst_rate * 100)}%: {inr(d.rates.trp_gst_amt)}</Td>
                </tr>
              </>
            ))}
            {/* Summary rows */}
            <SummaryRow bg="#d4edda" label="Net rate with GST"
              v={[q.totals.room_net_sgl + q.totals.gst_rooms_sgl,
                  q.totals.room_net_dbl + q.totals.gst_rooms_dbl,
                  q.totals.room_net_trp + q.totals.gst_rooms_trp]} />
            <SummaryRow bg="#cfe8ec" label="Add-Ons"
              v={[q.totals.addons_total, q.totals.addons_total, q.totals.addons_total]} />
            <SummaryRow bg="#fff3cd" label={`Mark Up ${q.markup_percent}%`}
              v={[q.totals.markup_sgl, q.totals.markup_dbl, q.totals.markup_trp]} />
            <SummaryRow bg="#f8d7da" label="GST 5% (on Net + Add-Ons + Markup)"
              v={[q.totals.gst_markup_sgl, q.totals.gst_markup_dbl, q.totals.gst_markup_trp]} />
            <SummaryRow bg="#f5b7b1" bold label="TOTAL"
              v={[q.totals.grand_sgl, q.totals.grand_dbl, q.totals.grand_trp]} />
          </tbody>
        </table>
      </div>

      {/* COST PER PERSON / GROUP PACKAGE */}
      {q.is_group && q.group_rows && q.group_rows.length > 0 ? (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: TEAL, marginBottom: 4 }}>
            GROUP PACKAGE COST — {q.group_total_pax} PAX
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
            <thead><tr style={{ background: TEAL, color: "#fff" }}>
              <Th>Arrangement</Th><Th>Room Configuration</Th>
              <Th align="right">Per Person</Th><Th align="right">Total Package</Th>
            </tr></thead>
            <tbody>
              {q.group_rows.map((r, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#f7f9fa" }}>
                  <Td>{r.arrangement}</Td>
                  <Td>{r.rooms_label}{r.pax_covered !== q.group_total_pax ? ` (${r.pax_covered} pax)` : ""}</Td>
                  <Td align="right"><b style={{ color: TEAL, fontSize: 11 }}>{inr(r.per_person)}</b></Td>
                  <Td align="right"><b style={{ color: TEAL, fontSize: 11 }}>{inr(r.total_package)}</b></Td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: 8.5, color: "#666", marginTop: 4, fontStyle: "italic" }}>
            💡 Group package inclusive of all room GST, add-ons, markup and 5% service GST.
          </div>
        </div>
      ) : (
      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: TEAL, marginBottom: 4 }}>COST PER PERSON (BASED ON GROUP SIZE)</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
          <thead><tr style={{ background: TEAL, color: "#fff" }}>
            <Th>Group Size</Th><Th>Room Arrangement</Th>
            <Th align="right">Per Person Cost</Th><Th align="right">Total Package</Th>
          </tr></thead>
          <tbody>
            {includeSgl && (
              <tr style={{ background: "#fff" }}>
                <Td>1 Person</Td><Td>Single Room (Solo)</Td>
                <Td align="right"><b style={{ color: TEAL, fontSize: 11 }}>{inr(q.totals.grand_sgl)}</b></Td>
                <Td align="right"><span style={{ color: "#666" }}>{inr(q.totals.grand_sgl)}</span></Td>
              </tr>
            )}
            {includeDbl && (
              <tr style={{ background: "#f7f9fa" }}>
                <Td>2 Persons</Td><Td>Double Room (Sharing)</Td>
                <Td align="right"><b style={{ color: TEAL, fontSize: 11 }}>{inr(q.totals.grand_dbl / 2)}</b></Td>
                <Td align="right"><span style={{ color: "#666" }}>{inr(q.totals.grand_dbl)}</span></Td>
              </tr>
            )}
            {includeTrp && (
              <tr style={{ background: "#fff" }}>
                <Td>3 Persons</Td><Td>Double Room + Extra Bed</Td>
                <Td align="right"><b style={{ color: TEAL, fontSize: 11 }}>{inr(q.totals.grand_trp / 3)}</b></Td>
                <Td align="right"><span style={{ color: "#666" }}>{inr(q.totals.grand_trp)}</span></Td>
              </tr>
            )}
          </tbody>
        </table>
        <div style={{ fontSize: 8.5, color: "#666", marginTop: 4, fontStyle: "italic" }}>
          💡 Rates shown are per person. 2-person rate assumes double room sharing. 3-person rate assumes double room + 1 extra bed.
        </div>
      </div>
      )}

      {/* SCENARIO COSTING — per person, line by line */}
      {q.scenarios && q.scenarios.length > 0 && q.scenarios.map((s, si) => (
        <div key={si} style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: TEAL, marginBottom: 4 }}>
            {s.label.toUpperCase()} — {s.hotel_category} + {s.vehicle} ({s.pax} PAX)
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9.5 }}>
            <thead><tr style={{ background: TEAL, color: "#fff" }}>
              <Th>Traveller</Th><Th>Room</Th>
              <Th align="right">Hotel</Th>
              <Th align="right">Transport</Th>
              <Th align="right">Guide</Th>
              <Th align="right">Activities</Th>
              <Th align="right">Entrances</Th>
              <Th align="right">Misc</Th>
              <Th align="right">Meals</Th>
              <Th align="right">Markup</Th>
              <Th align="right">GST 5%</Th>
              <Th align="right">Total</Th>
            </tr></thead>
            <tbody>
              {s.persons.map((p, i) => (
                <tr key={i} style={{ background: i % 2 ? "#f7f9fa" : "#fff" }}>
                  <Td>{p.label}</Td>
                  <Td>{p.room_label}</Td>
                  <Td align="right">{inr(p.hotel)}</Td>
                  <Td align="right">{inr(p.transport)}</Td>
                  <Td align="right">{inr(p.guide)}</Td>
                  <Td align="right">{inr(p.activities)}</Td>
                  <Td align="right">{inr(p.entrances)}</Td>
                  <Td align="right">{inr(p.misc)}</Td>
                  <Td align="right">{inr(p.meals)}</Td>
                  <Td align="right">{inr(p.markup)}</Td>
                  <Td align="right">{inr(p.gst5)}</Td>
                  <Td align="right"><b style={{ color: TEAL }}>{inr(p.total)}</b></Td>
                </tr>
              ))}
              <tr style={{ background: GOLD, color: "#000", fontWeight: 800 }}>
                <Td colSpan={11}>PACKAGE TOTAL — {s.pax} pax (avg {inr(s.per_person_avg)} per person)</Td>
                <Td align="right">{inr(s.grand_total)}</Td>
              </tr>
            </tbody>
          </table>
        </div>
      ))}


      {/* ROOM ALLOCATION DETAIL (only if custom allocation was enabled) */}
      {q.allocations && q.allocations.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: TEAL, marginBottom: 4 }}>ROOM ALLOCATION DETAIL</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
            <thead><tr style={{ background: TEAL, color: "#fff" }}>
              <Th>Person</Th><Th>Room Type</Th>
              <Th align="right">Room Cost</Th>
              <Th align="right">GST</Th>
              <Th align="right">Add-Ons Share</Th>
              <Th align="right">Markup + GST</Th>
              <Th align="right">Total</Th>
            </tr></thead>
            <tbody>
              {q.allocations.map((a, i) => (
                <tr key={i} style={{ background: i % 2 ? "#f7f9fa" : "#fff" }}>
                  <Td>{a.label}</Td>
                  <Td>{a.room_type_label}</Td>
                  <Td align="right">{inr(a.room_net)}</Td>
                  <Td align="right">{inr(a.room_gst)}</Td>
                  <Td align="right">{inr(a.shared_addons)}</Td>
                  <Td align="right">{inr(a.markup_plus_gst)}</Td>
                  <Td align="right"><b style={{ color: TEAL }}>{inr(a.grand_total)}</b></Td>
                </tr>
              ))}
              <tr style={{ background: GOLD, color: "#000", fontWeight: 800 }}>
                <Td colSpan={6}>PACKAGE TOTAL</Td>
                <Td align="right">{inr(q.allocations.reduce((s, a) => s + a.grand_total, 0))}</Td>
              </tr>
            </tbody>
          </table>
          <div style={{ fontSize: 8.5, color: "#666", marginTop: 4, fontStyle: "italic" }}>
            Add-ons split equally across all travellers. Room cost per actual allocation.
          </div>
        </div>
      )}


      {/* ADD-ONS SECTION — itemized grouped by category */}
      {q.addons.addons_total > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: TEAL, marginBottom: 4 }}>ADD-ONS & EXTRAS</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
            <thead><tr style={{ background: "#f0f0f0" }}>
              <Th>Category</Th><Th>Details</Th><Th align="right">Amount</Th>
            </tr></thead>
            <tbody>
              {buildAddonGroups(q.addons).map((g) => (
                <Fragment key={g.key}>
                  <tr style={{ background: "#f5f5f5" }}>
                    <Td colSpan={2}><b>{g.label}</b></Td>
                    <Td align="right" ><span style={{ color: "#666" }}>{inr(g.total)}</span></Td>
                  </tr>
                  {g.rows.map((r, i) => (
                    <tr key={`r-${g.key}-${i}`}>
                      <Td></Td>
                      <Td>{r.detail}</Td>
                      <Td align="right">{inr(r.amount)}</Td>
                    </tr>
                  ))}
                </Fragment>
              ))}
              <tr style={{ background: "#e6f0f2", fontWeight: 700 }}>
                <Td colSpan={2}>Add-Ons Total</Td>
                <Td align="right">{inr(q.addons.addons_total)}</Td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* INCLUSIONS / EXCLUSIONS */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
        <div style={{ background: "#f7f9fa", padding: 10, borderRadius: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: TEAL, marginBottom: 6 }}>INCLUSIONS</div>
          <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", fontSize: 10, lineHeight: 1.7 }}>
            <li>✓ Accommodation: {q.inclusions.accommodation_nights} Night(s)</li>
            {q.inclusions.breakfast_count > 0 && <li>✓ Breakfast: {q.inclusions.breakfast_count} morning(s)</li>}
            {q.inclusions.lunch_count > 0 && <li>✓ Lunch: {q.inclusions.lunch_count}</li>}
            {q.inclusions.dinner_count > 0 && <li>✓ Dinner: {q.inclusions.dinner_count}</li>}
            {q.inclusions.travels_included && <li>✓ Travels as per itinerary</li>}
            {q.inclusions.guide_included && <li>✓ Local Guide as specified</li>}
            <li>✓ All applicable taxes as shown</li>
          </ul>
        </div>
        <div style={{ background: "#f7f9fa", padding: 10, borderRadius: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: TEAL, marginBottom: 6 }}>EXCLUSIONS</div>
          <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", fontSize: 10, lineHeight: 1.7 }}>
            <li>✗ Airfare / Train tickets</li>
            <li>✗ Personal expenses (laundry, phone, tips)</li>
            <li>✗ Items not listed under Inclusions</li>
            <li>✗ Any change in GST if applicable</li>
          </ul>
        </div>
      </div>

      {/* COST SUMMARY */}
      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: TEAL, marginBottom: 4 }}>COST SUMMARY</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
          <thead><tr style={{ background: TEAL, color: "#fff" }}>
            <Th></Th><Th align="right">SGL</Th><Th align="right">DBL</Th><Th align="right">TRP</Th>
          </tr></thead>
          <tbody>
            <CSRow label="Room Cost (Net)" v={[q.totals.room_net_sgl, q.totals.room_net_dbl, q.totals.room_net_trp]} />
            <CSRow label="GST on Rooms" v={[q.totals.gst_rooms_sgl, q.totals.gst_rooms_dbl, q.totals.gst_rooms_trp]} />
            <CSRow label="Add-Ons Total" v={[q.totals.addons_total, q.totals.addons_total, q.totals.addons_total]} />
            <CSRow label={`Mark Up ${q.markup_percent}%`} v={[q.totals.markup_sgl, q.totals.markup_dbl, q.totals.markup_trp]} />
            <CSRow label="GST 5% (on total)" v={[q.totals.gst_markup_sgl, q.totals.gst_markup_dbl, q.totals.gst_markup_trp]} />
            <tr style={{ background: GOLD, color: "#000", fontWeight: 800 }}>
              <Td>GRAND TOTAL</Td>
              <Td align="right">{inr(q.totals.grand_sgl)}</Td>
              <Td align="right">{inr(q.totals.grand_dbl)}</Td>
              <Td align="right">{inr(q.totals.grand_trp)}</Td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* FOOTER */}
      <div style={{ marginTop: 18, background: "#f0f0f0", padding: 10, borderRadius: 4, fontSize: 8.5, color: "#555" }}>
        This is a computer-generated estimate. Rates are subject to availability and may change without prior notice.
        Quote valid for 7 days from date of issue.
        <div style={{ marginTop: 4, display: "flex", justifyContent: "space-between" }}>
          <span>{b.companyName}{b.phone ? ` · ${b.phone}` : ""}{b.email ? ` · ${b.email}` : ""}</span>
          <span>Page 1 of 1</span>
        </div>
      </div>
    </div>
  );
}

// Small helpers
function Th({ children, align }: { children?: React.ReactNode; align?: "right" | "left" }) {
  return <th style={{ padding: "6px 8px", textAlign: align ?? "left", fontWeight: 700, fontSize: 10, border: "1px solid #ddd" }}>{children}</th>;
}
function Td({ children, align, colSpan }: { children?: React.ReactNode; align?: "right" | "left"; colSpan?: number }) {
  return <td colSpan={colSpan} style={{ padding: "5px 8px", textAlign: align ?? "left", border: "1px solid #eee", verticalAlign: "top" }}>{children}</td>;
}
function SummaryRow({ label, v, bg, bold }: { label: string; v: [number, number, number]; bg: string; bold?: boolean }) {
  return (
    <tr style={{ background: bg, fontWeight: bold ? 800 : 600 }}>
      <Td colSpan={6}>{label}</Td>
      <Td align="right">{inr(v[0])}</Td>
      <Td align="right">{inr(v[1])}</Td>
      <Td align="right">{inr(v[2])}</Td>
    </tr>
  );
}
function CSRow({ label, v }: { label: string; v: [number, number, number] }) {
  return (
    <tr>
      <Td>{label}</Td>
      <Td align="right">{inr(v[0])}</Td>
      <Td align="right">{inr(v[1])}</Td>
      <Td align="right">{inr(v[2])}</Td>
    </tr>
  );
}
