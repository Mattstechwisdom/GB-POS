import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function html(status: number, body: string) {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>GadgetBoy Status</title><style>body{margin:0;background:#18181b;color:#f4f4f5;font-family:Arial,sans-serif}.page{max-width:640px;margin:0 auto;padding:32px 20px}.card{border:1px solid #3f3f46;background:#27272a;padding:24px}.brand{color:#39ff14;font-size:13px;font-weight:800;letter-spacing:.08em}.title{margin:12px 0 6px;font-size:28px}.label{margin-top:22px;color:#a1a1aa;font-size:12px;font-weight:700;text-transform:uppercase}.value{margin-top:5px;font-size:17px}.note{margin-top:24px;color:#d4d4d8;font-size:14px;line-height:1.5}.error{border-color:#ef4444}.footer{margin-top:16px;color:#a1a1aa;font-size:12px}</style></head><body><main class="page"><section class="card">${body}</section><p class="footer">GadgetBoy Repair &amp; Retail</p></main></body></html>`, { status, headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function errorPage(status: number, message: string) {
  return html(status, `<div class="brand">GADGETBOY</div><h1 class="title">Status unavailable</h1><p class="note">${escapeHtml(message)}</p>`);
}

function recordTitle(type: string, record: Record<string, unknown>) {
  if (type === "sale") return String(record.item_description || record.category || "Order");
  if (type === "consult") return String(record.title || record.category || "Consultation");
  return [record.product_description, record.model].filter(Boolean).join(" - ") || String(record.product_category || "Repair");
}

function recordStatus(type: string, record: Record<string, unknown>) {
  if (type === "repair") return String(record.status_update || record.repair_status || "In progress");
  return String(record.status_update || record.status || "In progress");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "GET") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  const url = new URL(req.url);
  const token = String(url.searchParams.get("token") || "").trim();
  if (!/^[A-Za-z0-9_-]{24,200}$/.test(token)) return errorPage(400, "This QR status link is invalid.");

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceRoleKey) return errorPage(503, "The QR status service is not configured yet.");

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: tokenRow, error: tokenError } = await admin
    .from("qr_status_tokens")
    .select("id,shop_id,record_type,legacy_record_id,expires_at")
    .eq("token", token)
    .is("revoked_at", null)
    .maybeSingle();
  if (tokenError || !tokenRow) return errorPage(404, "This QR status link is no longer active.");
  if (tokenRow.expires_at && new Date(tokenRow.expires_at).getTime() < Date.now()) return errorPage(410, "This QR status link has expired.");

  const type = String(tokenRow.record_type || "repair");
  const table = type === "repair" ? "work_orders" : type === "consult" ? "calendar_events" : "sales";
  const fields = type === "repair"
    ? "product_description,product_category,model,status_update,repair_status,estimated_date"
    : type === "consult"
      ? "title,category,status,event_date,event_time"
      : "item_description,category,status_update,status,estimated_date";
  const { data: row, error: recordError } = await admin
    .from(table)
    .select(fields)
    .eq("shop_id", tokenRow.shop_id)
    .eq("legacy_id", tokenRow.legacy_record_id)
    .maybeSingle();
  if (recordError || !row) return errorPage(404, "The linked record is no longer available.");
  const record = row as Record<string, unknown>;

  void admin.from("qr_status_tokens").update({ last_opened_at: new Date().toISOString() }).eq("id", tokenRow.id);
  const date = type === "consult" ? String(record.event_date || "") : String(record.estimated_date || "");
  const time = type === "consult" ? String(record.event_time || "") : "";
  const reference = type === "sale" ? `INV-${tokenRow.legacy_record_id}` : type === "consult" ? `CONS-${tokenRow.legacy_record_id}` : `WO-${tokenRow.legacy_record_id}`;
  return html(200, `<div class="brand">GADGETBOY</div><h1 class="title">${escapeHtml(recordTitle(type, record))}</h1><div class="label">Reference</div><div class="value">${escapeHtml(reference)}</div><div class="label">Current status</div><div class="value">${escapeHtml(recordStatus(type, record))}</div>${date ? `<div class="label">${type === "consult" ? "Scheduled" : "Estimated date"}</div><div class="value">${escapeHtml(date)}${time ? ` at ${escapeHtml(time)}` : ""}</div>` : ""}<p class="note">For questions about this update, please contact GadgetBoy Repair &amp; Retail.</p>`);
});
