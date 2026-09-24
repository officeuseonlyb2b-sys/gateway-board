import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BarChart3, IndianRupee, MapPinned, Plus, Route, Search, Trophy } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ProgramFormDialog } from "@/components/ProgramFormDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAccessibleQueries } from "@/lib/crm/access";
import { programMetrics, programMoney } from "@/lib/crm/program-insights";
import { usePrograms } from "@/lib/wizard/agents-store";

const PAGE_SIZE = 25;

export default function ProgramsPage() {
  const programs = usePrograms();
  const queries = useAccessibleQueries();
  const [search, setSearch] = useState("");
  const [duration, setDuration] = useState("all");
  const [status, setStatus] = useState("all");
  const [source, setSource] = useState("all");
  const [sort, setSort] = useState("won-value");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);

  const rows = useMemo(
    () =>
      programs.map((program) => ({
        program,
        metrics: programMetrics(program, queries),
      })),
    [programs, queries],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const result = rows.filter(({ program }) => {
      if (duration !== "all" && program.nights !== Number(duration)) return false;
      if (status !== "all" && program.status !== status) return false;
      if (source !== "all" && program.source !== source) return false;
      if (!term) return true;
      return [program.code, program.name, program.routing_summary, ...program.cities]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
    return [...result].sort((left, right) => {
      if (sort === "queries") return right.metrics.linked.length - left.metrics.linked.length;
      if (sort === "conversion") return right.metrics.conversion - left.metrics.conversion;
      if (sort === "lost-value") return right.metrics.lostValue - left.metrics.lostValue;
      if (sort === "name") return left.program.name.localeCompare(right.program.name);
      return right.metrics.wonValue - left.metrics.wonValue;
    });
  }, [duration, rows, search, sort, source, status]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const totals = useMemo(
    () => ({
      used: rows.filter(({ metrics }) => metrics.linked.length).length,
      won: rows.reduce((sum, { metrics }) => sum + metrics.won.length, 0),
      wonValue: rows.reduce((sum, { metrics }) => sum + metrics.wonValue, 0),
      openValue: rows.reduce((sum, { metrics }) => sum + metrics.openValue, 0),
      lostValue: rows.reduce((sum, { metrics }) => sum + metrics.lostValue, 0),
    }),
    [rows],
  );

  const destinationRows = useMemo(() => {
    const map = new Map<
      string,
      { programs: Set<string>; queries: Set<string>; won: Set<string>; wonValue: number }
    >();
    for (const { program, metrics } of rows) {
      for (const city of program.cities) {
        const item = map.get(city) || {
          programs: new Set(),
          queries: new Set(),
          won: new Set(),
          wonValue: 0,
        };
        item.programs.add(program.id);
        metrics.linked.forEach((query) => item.queries.add(query.id));
        metrics.won.forEach((query) => item.won.add(query.id));
        item.wonValue += metrics.wonValue;
        map.set(city, item);
      }
    }
    return [...map.entries()]
      .map(([city, item]) => ({ city, ...item }))
      .sort((a, b) => b.wonValue - a.wonValue || b.queries.size - a.queries.size)
      .slice(0, 10);
  }, [rows]);

  const resetPage = () => setPage(1);
  return (
    <div className="mx-auto max-w-[1800px] space-y-6 p-6 lg:p-8">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <p className="text-sm font-medium text-teal-700">Product intelligence · MP Unit</p>
          <h1 className="flex items-center gap-2 text-3xl font-bold">
            <Route className="h-7 w-7 text-teal-600" /> Routing & Programs
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            One reusable itinerary master, connected to Queries, Quotations and destination
            performance.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Create Routing / Itinerary
        </Button>
      </div>

      <ProgramFormDialog open={createOpen} onOpenChange={setCreateOpen} programs={programs} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {([
          ["Program master", programs.length, Route],
          ["Used in Queries", totals.used, BarChart3],
          ["Won Queries", totals.won, Trophy],
          ["Business generated", programMoney(totals.wonValue), IndianRupee],
          ["Open opportunity", programMoney(totals.openValue), IndianRupee],
          ["Lost quoted value", programMoney(totals.lostValue), IndianRupee],
        ] satisfies Array<[string, string | number, LucideIcon]>).map(([label, value, Icon]) => (
          <Card key={String(label)}>
            <CardContent className="flex items-start justify-between p-5">
              <div>
                <p className="text-sm font-semibold text-muted-foreground">{label as string}</p>
                <p className="mt-2 text-2xl font-bold">{value as string | number}</p>
              </div>
              <Icon className="h-5 w-5 text-teal-600" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-6">
          <div className="xl:col-span-2">
            <Label className="text-xs">Program, code, routing or city</Label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  resetPage();
                }}
                placeholder="e.g. 4 nights, Indore, EXIDR…"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Duration</Label>
            <Select
              value={duration}
              onValueChange={(value) => {
                setDuration(value);
                resetPage();
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All durations</SelectItem>
                {Array.from(new Set(programs.map((program) => program.nights)))
                  .sort((a, b) => a - b)
                  .map((nights) => (
                    <SelectItem key={nights} value={String(nights)}>
                      {nights}N / {nights + 1}D
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select
              value={status}
              onValueChange={(value) => {
                setStatus(value);
                resetPage();
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Draft">Draft / needs name</SelectItem>
                <SelectItem value="Archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Source</Label>
            <Select
              value={source}
              onValueChange={(value) => {
                setSource(value);
                resetPage();
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                <SelectItem value="Excel Import">Excel Import</SelectItem>
                <SelectItem value="Query History">Query History</SelectItem>
                <SelectItem value="Quotation Builder">Quotation Builder</SelectItem>
                <SelectItem value="Manual">Manual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Sort by</Label>
            <Select value={sort} onValueChange={setSort}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="won-value">Won business</SelectItem>
                <SelectItem value="queries">Query volume</SelectItem>
                <SelectItem value="conversion">Conversion</SelectItem>
                <SelectItem value="lost-value">Lost value</SelectItem>
                <SelectItem value="name">Program name</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Program performance</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table className="min-w-[1100px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Program / routing</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Queries</TableHead>
                    <TableHead>Open</TableHead>
                    <TableHead>Won</TableHead>
                    <TableHead>Lost</TableHead>
                    <TableHead>Won business</TableHead>
                    <TableHead>Lost value</TableHead>
                    <TableHead>Conversion</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.map(({ program, metrics }) => (
                    <TableRow key={program.id} className="cursor-pointer hover:bg-teal-50/70">
                      <TableCell className="font-mono font-semibold text-teal-700">
                        <Link to="/routing-programs/$id" params={{ id: program.id }}>
                          {program.code}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link
                          to="/routing-programs/$id"
                          params={{ id: program.id }}
                          className="block"
                        >
                          <p className="font-semibold">{program.name}</p>
                          <p className="max-w-[420px] truncate text-xs text-muted-foreground">
                            {program.routing_summary || "Full routing saved in quotation"}
                          </p>
                        </Link>
                      </TableCell>
                      <TableCell>
                        {program.nights}N / {program.days}D
                      </TableCell>
                      <TableCell>{metrics.linked.length}</TableCell>
                      <TableCell>{metrics.open.length}</TableCell>
                      <TableCell>{metrics.won.length}</TableCell>
                      <TableCell>{metrics.lost.length}</TableCell>
                      <TableCell className="font-semibold">
                        {programMoney(metrics.wonValue)}
                      </TableCell>
                      <TableCell className="text-red-600">
                        {programMoney(metrics.lostValue)}
                      </TableCell>
                      <TableCell>{metrics.conversion.toFixed(1)}%</TableCell>
                    </TableRow>
                  ))}
                  {!paged.length && (
                    <TableRow>
                      <TableCell colSpan={10} className="py-12 text-center text-muted-foreground">
                        No programs match the selected filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-between border-t p-3 text-sm">
              <span className="text-muted-foreground">
                {filtered.length} programs · Page {safePage} of {totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={safePage <= 1}
                  onClick={() => setPage(safePage - 1)}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage(safePage + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPinned className="h-5 w-5 text-teal-600" /> Destination performance
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Top destinations by business won through linked programs.
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {destinationRows.map((row, index) => (
                <div key={row.city} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">
                        {index + 1}. {row.city}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {row.programs.size} programs · {row.queries.size} Queries · {row.won.size}{" "}
                        won
                      </p>
                    </div>
                    <Badge variant="secondary">{programMoney(row.wonValue)}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
