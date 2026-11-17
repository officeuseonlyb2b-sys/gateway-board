import { supabase } from "@/integrations/supabase/client";
import { getItineraryBanner, toPortalPackagePayload, type ItineraryRecord } from "@/lib/itineraries-store";
import type { BrochureVersion } from "@/lib/brochures-store";
import type { SavedQuote } from "@/lib/quotes-store";

export type PortalPublicationReceipt = { packageId: string; slug: string; version: number; url: string; status: "published" };
export type PortalSnapshotStatus = { id: string; status: "Pending" | "Approved" | "Rejected"; version: number; submittedAt?: string; approvedAt?: string; snapshot?: Record<string, unknown> };
export type PortalApprovalQueueItem = { id: string; brochure_version_id: string; programme_id: string; route_fingerprint: string; version: number; snapshot_hash: string; submitted_at: string };
const asBase64 = async (blob: Blob) => {
  const buffer = await blob.arrayBuffer(); let binary = ""; new Uint8Array(buffer).forEach((byte) => { binary += String.fromCharCode(byte); }); return btoa(binary);
};
/** Invokes the protected Edge Function using the current CRM JWT; no privileged key is present in the browser. */
async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw new Error(error.message || `${name} failed.`);
  if (data?.error) throw new Error(String(data.error));
  return data as T;
}
export async function submitPortalBrochureSnapshot(brochure: BrochureVersion): Promise<PortalSnapshotStatus> {
  const data = await invoke<{ snapshotId: string; status: PortalSnapshotStatus["status"]; version?: number; submittedAt?: string }>("submit-portal-brochure-snapshot", { brochureVersionId: brochure.id });
  if (!data.snapshotId || !data.status) throw new Error("Snapshot submission was not confirmed by the server.");
  return { id: data.snapshotId, status: data.status, version: data.version ?? brochure.version, submittedAt: data.submittedAt };
}
export async function getPortalBrochureSnapshot(snapshotId: string): Promise<PortalSnapshotStatus> {
  const data = await invoke<{ snapshot: PortalSnapshotStatus }>("get-portal-brochure-snapshot", { snapshotId });
  if (!data.snapshot?.id || !data.snapshot.status) throw new Error("Snapshot status was not confirmed by the server.");
  return data.snapshot;
}
export async function approvePortalBrochureSnapshot(snapshotId: string, verificationMethod: string, attestationReference: string, reviewerRemarks?: string, decision: "Approved" | "Rejected" = "Approved", rejectionReason?: string): Promise<PortalSnapshotStatus> {
  const data = await invoke<{ snapshotId: string; status: PortalSnapshotStatus["status"]; version: number; approvedAt?: string }>("approve-portal-brochure-snapshot", { snapshotId, decision, verificationMethod, attestationReference, reviewerRemarks, rejectionReason });
  if (!data.snapshotId || data.status !== decision) throw new Error("Snapshot review was not confirmed by the server.");
  return { id: data.snapshotId, status: data.status, version: data.version, approvedAt: data.approvedAt };
}
export async function persistAuthoritativeBrochureVersion(brochure: BrochureVersion, sourceQuote: SavedQuote): Promise<void> {
  const data = await invoke<{ brochureVersionId: string; snapshotHash: string }>("persist-brochure-version", { brochure, sourceQuote });
  if (data.brochureVersionId !== brochure.id || !data.snapshotHash) throw new Error("Authoritative Brochure persistence was not confirmed by the server.");
}
export async function listPortalBrochureApprovalQueue(): Promise<PortalApprovalQueueItem[]> {
  const data = await invoke<{ snapshots: PortalApprovalQueueItem[] }>("list-portal-brochure-approval-queue", {}); return data.snapshots || [];
}
export async function publishItineraryToPortal(record: ItineraryRecord, brochure: BrochureVersion, approvedSnapshotId: string): Promise<PortalPublicationReceipt> {
  if (!record.banner) throw new Error("A package banner is required before publication.");
  const file = await getItineraryBanner(record.banner.assetKey);
  if (!file) throw new Error("The local banner cannot be found. Re-upload it before publication.");
  const { data, error } = await supabase.functions.invoke("publish-portal-package", { body: { itinerary: toPortalPackagePayload(record), approved_snapshot_id: approvedSnapshotId, banner: { base64: await asBase64(file), contentType: record.banner.type, name: record.banner.name } } });
  if (error) throw new Error(error.message || "Portal publication failed.");
  if (!data?.packageId || data.status !== "published") throw new Error("Portal did not confirm the publication readback.");
  return data as PortalPublicationReceipt;
}
