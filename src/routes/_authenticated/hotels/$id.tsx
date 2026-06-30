import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ArrowLeft, Pencil, Trash2, Plus, Wifi, Waves, MapPin, Phone, Mail, Copy,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { db, useDB, type RatePlan, MEAL_PLANS } from "@/lib/mock-store";
import { useAuth } from "@/lib/auth-mock";
import { CategoryBadge } from "@/components/CategoryBadge";
import { HotelFormDialog } from "@/components/HotelFormDialog";
import { SeasonFormDialog, ratePlanGroups } from "@/components/SeasonFormDialog";

export const Route = createFileRoute("/_authenticated/hotels/$id")({
  head: () => ({ meta: [{ title: "Hotel — MP Tourism Hub" }] }),
  component: HotelDetailPage,
});

function HotelDetailPage() {
  const { id } = Route.useParams();
  const data = useDB();
  const user = useAuth();
  const navigate = useNavigate();

  const hotel = data.hotels.find((h) => h.id === id);
  const city = hotel ? data.cities.find((c) => c.id === hotel.city_id)?.name : "";
  const rooms = useMemo(() => data.room_categories.filter((r) => r.hotel_id === id), [data, id]);

  const [editOpen, setEditOpen] = useState(false);
  const [newRoom, setNewRoom] = useState("");

  if (!hotel) {
    return (
      <div className="p-8">
        <div className="text-muted-foreground">Hotel not found.</div>
        <Link to="/hotels" className="text-primary text-sm hover:underline mt-2 inline-block">← Back to hotels</Link>
      </div>
    );
  }

  function deleteHotel() {
    db.deleteHotel(hotel!.id);
    toast.success("Hotel deleted.");
    navigate({ to: "/hotels" });
  }

  function addRoom() {
    if (!newRoom.trim()) return;
    db.addRoom(hotel!.id, newRoom);
    setNewRoom("");
    toast.success("Room category added.");
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      <Link to="/hotels" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
        <ArrowLeft className="h-4 w-4" /> Back to Hotels
      </Link>

      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight">{hotel.name}</h1>
              <CategoryBadge category={hotel.hotel_category} />
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" /> {city} · {hotel.address}</span>
              {hotel.has_wifi && <span className="inline-flex items-center gap-1"><Wifi className="h-4 w-4 text-teal" /> Wi-Fi</span>}
              {hotel.has_pool && <span className="inline-flex items-center gap-1"><Waves className="h-4 w-4 text-sky-600" /> Pool</span>}
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm pt-1">
              <span className="inline-flex items-center gap-1.5"><Phone className="h-4 w-4 text-muted-foreground" /> {hotel.contact_phone || "—"}</span>
              <span className="inline-flex items-center gap-1.5"><Mail className="h-4 w-4 text-muted-foreground" /> {hotel.email || "—"}</span>
              <span className="text-muted-foreground">Contact: <span className="text-foreground">{hotel.contact_name || "—"}</span></span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4 mr-2" /> Edit
            </Button>
            {user?.role === "admin" && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="text-destructive hover:text-destructive">
                    <Trash2 className="h-4 w-4 mr-2" /> Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this hotel?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently remove {hotel.name}, all its room categories and rate plans.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={deleteHotel} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      </Card>

      <Tabs defaultValue="rooms">
        <TabsList>
          <TabsTrigger value="rooms">Room Categories ({rooms.length})</TabsTrigger>
          <TabsTrigger value="overview">Overview</TabsTrigger>
        </TabsList>

        <TabsContent value="rooms" className="space-y-4 mt-4">
          <Card className="p-4">
            <div className="flex gap-2">
              <Input
                value={newRoom} onChange={(e) => setNewRoom(e.target.value)}
                placeholder="New room category, e.g. Deluxe Room"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addRoom(); } }}
              />
              <Button onClick={addRoom}><Plus className="h-4 w-4 mr-2" /> Add Room Category</Button>
            </div>
          </Card>

          {rooms.length === 0 ? (
            <Card className="p-12 text-center text-sm text-muted-foreground">
              No room categories yet. Add one above to start managing rates.
            </Card>
          ) : (
            <Accordion type="multiple" defaultValue={rooms.map((r) => r.id)} className="space-y-3">
              {rooms.map((room) => (
                <RoomBlock key={room.id} roomId={room.id} roomName={room.name} canDelete={user?.role === "admin"} />
              ))}
            </Accordion>
          )}
        </TabsContent>

        <TabsContent value="overview" className="mt-4">
          <Card className="p-6 text-sm text-muted-foreground">
            {rooms.length} room categories · {data.rate_plans.filter((p) => rooms.some((r) => r.id === p.room_category_id)).length} rate plans across all seasons.
          </Card>
        </TabsContent>
      </Tabs>

      <HotelFormDialog hotel={hotel} open={editOpen} onOpenChange={setEditOpen} />
    </div>
  );
}

function RoomBlock({ roomId, roomName, canDelete }: { roomId: string; roomName: string; canDelete: boolean }) {
  const data = useDB();
  const plans = useMemo(() => data.rate_plans.filter((p) => p.room_category_id === roomId), [data, roomId]);
  const groups = useMemo(() => ratePlanGroups(plans), [plans]);

  const [seasonOpen, setSeasonOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<RatePlan[] | undefined>();
  const [seedData, setSeedData] = useState<{ validity_start: string; validity_end: string; season_label: string } | undefined>();

  function openAdd() { setEditingGroup(undefined); setSeedData(undefined); setSeasonOpen(true); }
  function openEdit(group: RatePlan[]) { setEditingGroup(group); setSeedData(undefined); setSeasonOpen(true); }
  function duplicate(group: RatePlan[]) {
    setEditingGroup(undefined);
    setSeedData({
      validity_start: group[0].validity_start,
      validity_end: group[0].validity_end,
      season_label: group[0].season_label + " (copy)",
    });
    setSeasonOpen(true);
    toast.info("Duplicating season — adjust dates before saving.");
  }
  function removeGroup(group: RatePlan[]) {
    db.deleteRatePlanGroup(roomId, group[0].validity_start, group[0].validity_end);
    toast.success("Season removed.");
  }

  return (
    <AccordionItem value={roomId} className="border border-border rounded-lg bg-card overflow-hidden">
      <AccordionTrigger className="px-5 py-4 hover:no-underline">
        <div className="flex items-center justify-between w-full pr-4">
          <div className="text-left">
            <div className="font-semibold">{roomName}</div>
            <div className="text-xs text-muted-foreground">{groups.length} season{groups.length === 1 ? "" : "s"} · {plans.length} rate plans</div>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-5 pb-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-medium text-muted-foreground">Seasons &amp; Validity Blocks</div>
          <div className="flex gap-2">
            {canDelete && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete Room
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete "{roomName}"?</AlertDialogTitle>
                    <AlertDialogDescription>All its rate plans will be removed.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => { db.deleteRoom(roomId); toast.success("Room deleted."); }}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            <Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1" /> Add Season</Button>
          </div>
        </div>

        {groups.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No seasons yet. Add a validity block to set CP / MAP / AP rates.
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map((g) => {
              const seasonClr = /peak/i.test(g[0].season_label)
                ? "border-l-amber-400 bg-amber-50/40"
                : /off/i.test(g[0].season_label)
                ? "border-l-sky-400 bg-sky-50/40"
                : "border-l-teal bg-teal/5";
              return (
                <div key={g[0].id} className={`rounded-md border border-border border-l-4 ${seasonClr}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-border">
                    <div>
                      <div className="font-semibold text-sm">{g[0].season_label || "Season"}</div>
                      <div className="text-xs text-muted-foreground">
                        {fmtDate(g[0].validity_start)} → {fmtDate(g[0].validity_end)}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => duplicate(g)}><Copy className="h-3.5 w-3.5 mr-1" /> Duplicate</Button>
                      <Button variant="ghost" size="sm" onClick={() => openEdit(g)}><Pencil className="h-3.5 w-3.5 mr-1" /> Edit</Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete this season?</AlertDialogTitle>
                            <AlertDialogDescription>All CP/MAP/AP rates for this validity block will be removed.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => removeGroup(g)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-xs text-muted-foreground">
                        <tr className="text-left">
                          <th className="font-medium py-2 px-4">Plan</th>
                          <th className="font-medium py-2 px-3 text-right">Double</th>
                          <th className="font-medium py-2 px-3 text-right">Single</th>
                          <th className="font-medium py-2 px-3 text-right">Extra Bed</th>
                          <th className="font-medium py-2 px-3 text-right">CWB</th>
                          <th className="font-medium py-2 px-3 text-right">Lunch</th>
                          <th className="font-medium py-2 px-3 text-right">Dinner</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {MEAL_PLANS.map((mp) => {
                          const p = g.find((x) => x.meal_plan === mp);
                          if (!p) return null;
                          return (
                            <tr key={p.id} className="hover:bg-muted/30">
                              <td className="py-2 px-4 font-semibold">{mp}</td>
                              <td className="py-2 px-3 text-right tabular-nums">₹{p.double_rate.toLocaleString()}</td>
                              <td className="py-2 px-3 text-right tabular-nums">₹{p.single_rate.toLocaleString()}</td>
                              <td className="py-2 px-3 text-right tabular-nums">₹{p.extra_bed_rate.toLocaleString()}</td>
                              <td className="py-2 px-3 text-right text-xs text-muted-foreground">{p.cwb_rule_text ?? (p.cwb_rate ? `₹${p.cwb_rate}` : "—")}</td>
                              <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">{p.lunch_rate ? `₹${p.lunch_rate}` : "—"}</td>
                              <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">{p.dinner_rate ? `₹${p.dinner_rate}` : "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {g[0].remarks && (
                    <div className="px-4 py-2 text-xs text-muted-foreground border-t border-border bg-muted/30">
                      <span className="font-semibold">Remarks:</span> {g[0].remarks}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <SeasonFormDialog
          roomId={roomId}
          open={seasonOpen}
          onOpenChange={setSeasonOpen}
          existingGroup={editingGroup}
          seed={seedData}
        />
      </AccordionContent>
    </AccordionItem>
  );
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
