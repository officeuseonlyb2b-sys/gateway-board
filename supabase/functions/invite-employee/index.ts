import { headers, json } from "../_shared/employee-auth.ts";

// Retire the email/name-based invitation path. Keep a deployed tombstone so older
// clients cannot create accounts through the former bootstrap-email bypass.
Deno.serve((request) =>
  request.method === "OPTIONS"
    ? new Response("ok", { headers })
    : json({ error: "Invitations are retired. Use Employees & Login Access." }, 410),
);
