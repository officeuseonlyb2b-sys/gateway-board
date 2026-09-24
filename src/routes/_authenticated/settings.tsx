import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-mock";
import { db } from "@/lib/mock-store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useState, useRef } from "react";
import { useBranding, setBranding, getBranding } from "@/lib/branding";
import { Upload, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — MP Tourism Hub" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const user = useAuth();
  const brand = useBranding();
  const [form, setForm] = useState(() => getBranding());
  const fileRef = useRef<HTMLInputElement>(null);

  function onLogoFile(f: File) {
    if (f.size > 2 * 1024 * 1024) return toast.error("Logo must be under 2 MB.");
    if (!/^image\/(png|jpe?g|svg\+xml)$/.test(f.type)) return toast.error("PNG, JPG, or SVG only.");
    const reader = new FileReader();
    reader.onload = () => setForm((p) => ({ ...p, logo: String(reader.result) }));
    reader.readAsDataURL(f);
  }

  function saveBranding() {
    setBranding(form);
    toast.success("Branding saved.");
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Profile, branding, and data management.</p>
      </div>

      <Card className="p-6 space-y-3">
        <h2 className="font-semibold">Profile</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><div className="text-muted-foreground text-xs">Name</div><div>{user?.name}</div></div>
          <div><div className="text-muted-foreground text-xs">Email</div><div>{user?.email}</div></div>
          <div><div className="text-muted-foreground text-xs">Role</div><div className="capitalize">{user?.role}</div></div>
        </div>
      </Card>

      {/* -------- Branding -------- */}
      <Card className="p-6 space-y-4">
        <div>
          <h2 className="font-semibold">Branding</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Appears on quote PDFs, print output, and Excel exports.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[160px_1fr] gap-5">
          {/* Logo */}
          <div className="space-y-2">
            <Label className="text-xs">Company Logo</Label>
            <div className="w-40 h-40 border-2 border-dashed rounded-lg flex items-center justify-center bg-muted/30 overflow-hidden">
              {form.logo ? (
                <img src={form.logo} alt="Logo" className="max-w-full max-h-full object-contain" />
              ) : (
                <div className="text-xs text-muted-foreground text-center px-2">
                  No logo · PNG/JPG/SVG · Max 2 MB
                </div>
              )}
            </div>
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" className="flex-1" onClick={() => fileRef.current?.click()}>
                <Upload className="h-3.5 w-3.5 mr-1.5" /> Upload
              </Button>
              {form.logo && (
                <Button size="sm" variant="ghost" onClick={() => setForm((p) => ({ ...p, logo: null }))}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml" className="hidden"
              onChange={(e) => e.target.files?.[0] && onLogoFile(e.target.files[0])} />
          </div>

          {/* Fields */}
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Company Name</Label>
              <Input value={form.companyName} onChange={(e) => setForm((p) => ({ ...p, companyName: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Tagline</Label>
              <Input value={form.tagline} onChange={(e) => setForm((p) => ({ ...p, tagline: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Phone</Label>
                <Input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Email</Label>
                <Input value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
              </div>
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="mt-2">
          <div className="text-xs font-medium text-muted-foreground mb-1.5">Preview</div>
          <div className="border rounded-lg p-4 bg-white flex items-center gap-3">
            {form.logo ? (
              <img src={form.logo} alt="logo" className="h-12 w-auto object-contain" />
            ) : (
              <div className="h-12 w-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">MP</div>
            )}
            <div>
              <div className="font-semibold text-primary">{form.companyName || "Company Name"}</div>
              <div className="text-[11px] text-muted-foreground">{form.tagline}</div>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={saveBranding}>Save Branding</Button>
        </div>
        <div className="text-[11px] text-muted-foreground">
          Current saved: <span className="font-medium">{brand.companyName}</span> · {brand.logo ? "logo set" : "no logo"}
        </div>
      </Card>

      <Card className="p-6 space-y-3">
        <h2 className="font-semibold">User Management</h2>
        <p className="text-sm text-muted-foreground">
          Invite-only signup: admins will be able to invite Staff/Editor users from this page once Cloud is enabled.
        </p>
      </Card>

      <Card className="p-6 space-y-3">
        <h2 className="font-semibold">Demo Data</h2>
        <p className="text-sm text-muted-foreground">
          The app is currently running on local mock data stored in your browser.
        </p>
        <Button
          variant="outline"
          onClick={() => {
            if (confirm("Reset all hotels, rooms and rate plans to the seeded demo data?")) {
              db.reset(); toast.success("Demo data reset.");
            }
          }}
        >
          Reset demo data
        </Button>
      </Card>
    </div>
  );
}
