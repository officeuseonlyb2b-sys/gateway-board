import { createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Mail, Lock, Loader2, Hotel } from "lucide-react";
import { toast } from "sonner";
import { auth, useAuth } from "@/lib/auth-mock";
import { dashboardPathForEmail } from "@/lib/crm/access";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/login")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — MP Tourism Operations Hub" },
      { name: "description", content: "Sign in to the MP Tourism internal operations dashboard." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const user = useAuth();
  const router = useRouterState();

  useEffect(() => {
    if (user) navigate({ to: dashboardPathForEmail(user.email) });
  }, [user, navigate, router.location.pathname]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    if (mode === "signup") {
      const out = await auth.signUp(email, password, fullName);
      setLoading(false);
      if (!out.ok) {
        toast.error(out.error);
        return;
      }
      if (out.needsConfirmation) {
        toast.success("Account created. Check your email to confirm, then sign in.");
        setMode("signin");
        return;
      }
      toast.success("Account created.");
      navigate({ to: dashboardPathForEmail(auth.current()?.email) });
      return;
    }
    const res = await auth.signIn(email, password);
    setLoading(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`Welcome back, ${res.user.name.split(" ")[0]}!`);
    navigate({ to: dashboardPathForEmail(auth.current()?.email) });
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden lg:flex flex-col justify-between p-12 text-white overflow-hidden bg-primary">
        <div
          className="absolute inset-0 opacity-90"
          style={{
            backgroundImage:
              "linear-gradient(135deg, oklch(0.32 0.06 200) 0%, oklch(0.42 0.08 210) 60%, oklch(0.55 0.1 195) 100%)",
          }}
        />
        <div
          className="absolute inset-0 opacity-25"
          style={{
            backgroundImage:
              "radial-gradient(ellipse at top right, oklch(0.85 0.15 80) 0%, transparent 55%), radial-gradient(ellipse at bottom left, oklch(0.55 0.1 195) 0%, transparent 50%)",
          }}
        />
        <div className="relative z-10 flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-gold flex items-center justify-center shadow-lg">
            <span className="text-gold-foreground font-bold">MP</span>
          </div>
          <div>
            <div className="font-semibold text-lg leading-tight">MP Tourism</div>
            <div className="text-xs text-white/70 leading-tight">Operations Hub</div>
          </div>
        </div>

        <div className="relative z-10 space-y-6 max-w-md">
          <h1 className="text-4xl font-bold leading-tight">
            Manage hotels, rates &amp; seasons — all in one place.
          </h1>
          <p className="text-white/80 leading-relaxed">
            A modern internal platform for tourism operations. Built to scale across travels,
            operations, and beyond.
          </p>
          <div className="flex items-center gap-3 text-sm text-white/70">
            <Hotel className="h-4 w-4" />
            <span>Hotels module · v1.0</span>
          </div>
        </div>

        <div className="relative z-10 text-xs text-white/50">
          © {new Date().getFullYear()} MP Tourism. Internal use only.
        </div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-6 sm:p-12 bg-background">
        <div className="w-full max-w-md space-y-8">
          <div className="lg:hidden flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm">MP</span>
            </div>
            <div className="font-semibold">MP Tourism Hub</div>
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-bold tracking-tight">
              {mode === "signup" ? "Create your account" : "Sign in to your account"}
            </h2>
            <p className="text-sm text-muted-foreground">
              Enter your credentials to access the operations dashboard.
            </p>
          </div>

          <form onSubmit={submit} className="space-y-5">
            {mode === "signup" && (
              <div className="space-y-2">
                <Label htmlFor="fullName">Full name</Label>
                <Input
                  id="fullName"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Aarav Sharma"
                  className="h-11"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@mptourism.in"
                  className="pl-9 h-11"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <button
                  type="button"
                  onClick={() => toast.info("Password reset will be enabled with Lovable Cloud.")}
                  className="text-xs text-primary hover:underline"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-9 h-11"
                />
              </div>
            </div>

            <Button type="submit" disabled={loading} className="w-full h-11 text-sm font-semibold">
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {mode === "signup" ? "Create account" : "Sign in"}
            </Button>
          </form>

          <div className="rounded-lg border border-dashed border-border bg-muted/40 p-4 text-xs text-muted-foreground">
            {mode === "signin" ? (
              <>
                New admin?{" "}
                <button
                  type="button"
                  className="text-primary hover:underline font-medium"
                  onClick={() => setMode("signup")}
                >
                  Create an account
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  className="text-primary hover:underline font-medium"
                  onClick={() => setMode("signin")}
                >
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
