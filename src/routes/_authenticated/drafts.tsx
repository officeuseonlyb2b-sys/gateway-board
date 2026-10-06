import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { FileText, Play, Trash2, Search, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useDrafts, deleteDraft, renameDraft, type DraftRecord } from "@/lib/drafts-store";
import { fmtDateShort } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/drafts")({
  head: () => ({ meta: [{ title: "Drafts — MP Tourism Hub" }] }),
  component: DraftsPage,
});

const STEP_LABELS = [
  "Type",
  "Who",
  "Trip Basics",
  "Program",
  "Routing",
  "Land Part",
  "Accommodation Part",
  "Costing",
  "Optional Supplements",
  "Final Review",
];

function DraftsPage() {
  const drafts = useDrafts();
  const [q, setQ] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const navigate = useNavigate();

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return drafts;
    return drafts.filter((d) =>
      (d.draft_name + " " + (d.wizard_state.query_type || "") + " " + d.wizard_state.program_name + " " + (d.wizard_state.linked_query_id || ""))
        .toLowerCase()
        .includes(needle),
    );
  }, [drafts, q]);

  function resume(d: DraftRecord) {
    navigate({ to: "/costing", search: { id: d.id } as never });
  }
  function beginRename(d: DraftRecord) {
    setEditingId(d.id);
    setEditName(d.draft_name);
  }
  function saveRename() {
    if (editingId && editName.trim()) {
      renameDraft(editingId, editName.trim());
      toast.success("Renamed.");
    }
    setEditingId(null);
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1500px] mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Drafts</h1>
            <p className="text-sm text-muted-foreground">
              In-progress quotations you can resume anytime.
            </p>
          </div>
        </div>
        <Link to="/costing" search={{ id: undefined }}>
          <Button size="sm">Start new</Button>
        </Link>
      </div>

      <Card className="p-4 mb-4">
        <div className="relative">
          <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search drafts by name, program, or type…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-8"
          />
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            <FileText className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
            No drafts yet. A linked quotation is saved here automatically as you work.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase text-muted-foreground border-b bg-muted/30">
              <tr>
                <th className="text-left py-2.5 px-4">Draft Name</th>
                <th className="text-left py-2.5 px-2">Type</th>
                <th className="text-left py-2.5 px-2">Program</th>
                <th className="text-left py-2.5 px-2">Query</th>
                <th className="text-left py-2.5 px-2">Last Step</th>
                <th className="text-left py-2.5 px-2">Modified</th>
                <th className="text-right py-2.5 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => {
                const stepLabel =
                  STEP_LABELS[Math.max(0, Math.min(STEP_LABELS.length - 1, d.last_step - 1))];
                const completion = Math.max(
                  0,
                  Math.min(100, Math.round(((d.last_step - 1) / (STEP_LABELS.length - 1)) * 100)),
                );
                return (
                  <tr key={d.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="py-2.5 px-4 font-medium">
                      {editingId === d.id ? (
                        <div className="flex items-center gap-1">
                          <Input
                            autoFocus
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveRename();
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            className="h-7 text-sm"
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={saveRename}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => setEditingId(null)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span>{d.draft_name}</span>
                          <button
                            className="opacity-0 group-hover:opacity-100"
                            onClick={() => beginRename(d)}
                          >
                            <Pencil className="h-3 w-3 text-muted-foreground" />
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-2">
                      {d.wizard_state.query_type && (
                        <Badge variant="secondary">{d.wizard_state.query_type}</Badge>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-muted-foreground">
                      {d.wizard_state.program_name || "—"}
                    </td>
                    <td className="py-2.5 px-2 text-xs">
                      {d.wizard_state.linked_query_id ? (
                        <Link
                          to="/queries/$id"
                          params={{ id: d.wizard_state.linked_query_id }}
                          className="font-semibold text-primary hover:underline"
                        >
                          {d.wizard_state.linked_query_id}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">Not linked</span>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="tabular-nums">
                          {d.last_step}/{STEP_LABELS.length}
                        </span>
                        <span className="text-muted-foreground">{stepLabel}</span>
                      </div>
                      <div className="mt-1.5 h-1 w-28 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${completion}%` }}
                        />
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-muted-foreground text-xs">
                      {fmtDateShort(d.updated_at)}
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => resume(d)}>
                          <Play className="h-3.5 w-3.5 mr-1" /> Resume
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Rename"
                          onClick={() => beginRename(d)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Delete"
                          onClick={() => {
                            if (confirm(`Delete draft "${d.draft_name}"?`)) {
                              deleteDraft(d.id);
                              toast.success("Draft deleted.");
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
