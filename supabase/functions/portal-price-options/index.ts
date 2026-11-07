import { clients, json, headers } from "../_shared/employee-auth.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const { admin } = clients();
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return json({ error: "Authentication required" }, 401);
  const agent = await admin.from("portal_b2b_agents").select("auth_user_id").eq("auth_user_id", user.id).eq("active", true).maybeSingle();
  if (agent.error || !agent.data) return json({ error: "Approved B2B agent access required" }, 403);
  const body = await request.json() as { action?: string; packageId?: string };
  if (body.action === "verify-agent") return json({ approved: true });
  if (body.action && body.action !== "price-options") return json({ error: "Unknown action" }, 422);
  if (!body.packageId?.trim()) return json({ error: "Package ID is required" }, 422);
  const packageRow = await admin.from("portal_packages").select("brochure_version_id,publication_state").eq("id", body.packageId).maybeSingle();
  if (packageRow.error || !packageRow.data || packageRow.data.publication_state !== "published") return json({ error: "Published package not found" }, 404);
  const rows = await admin.from("portal_package_prices").select("accommodation_option_id,hotel_category,transport_variation_id,transport_description,occupancy,validity_from,validity_till").eq("package_id", body.packageId).eq("brochure_version_id", packageRow.data.brochure_version_id);
  if (rows.error) return json({ error: "Pricing options unavailable" }, 500);
  return json({ options: rows.data });
});
