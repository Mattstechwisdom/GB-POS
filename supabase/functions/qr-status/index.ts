import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function safe(value: unknown, maxLength = 500) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function icsEscape(value: unknown) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function icsDate(date: unknown, time: unknown) {
  const day = safe(date, 10).replace(/-/g, "");
  const clock = safe(time || "09:00", 5).replace(":", "").padEnd(4, "0");
  return `${day}T${clock}00`;
}

function titleFor(type: string, record: Record<string, unknown>) {
  if (type === "sale") return safe(record.item_description || record.category || "Order", 200);
  if (type === "consult") return safe(record.title || record.category || "Consultation", 200);
  return safe([record.product_description, record.model].filter(Boolean).join(" - ") || record.product_category || "Repair", 200);
}

function statusFor(type: string, record: Record<string, unknown>) {
  if (type === "repair") return safe(record.status_update || record.repair_status || record.status || "In progress", 200);
  return safe(record.status_update || record.status || "In progress", 200);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "GET") return json(405, { ok: false, error: "Method not allowed." });

  try {
    const url = new URL(req.url);
    const token = safe(url.searchParams.get("token"), 220);
    if (!/^[A-Za-z0-9_-]{24,200}$/.test(token)) return json(400, { ok: false, error: "This QR status link is invalid." });

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !serviceRoleKey) return json(503, { ok: false, error: "The QR status service is not configured." });
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const { data: tokenRow, error: tokenError } = await admin
      .from("qr_status_tokens")
      .select("id,shop_id,record_type,legacy_record_id,expires_at")
      .eq("token", token)
      .is("revoked_at", null)
      .maybeSingle();
    if (tokenError || !tokenRow) return json(404, { ok: false, error: "This QR status link is no longer active." });
    if (tokenRow.expires_at && new Date(tokenRow.expires_at).getTime() < Date.now()) return json(410, { ok: false, error: "This QR status link has expired." });

    const type = safe(tokenRow.record_type, 20) || "repair";
    const table = type === "repair" ? "work_orders" : type === "consult" ? "calendar_events" : "sales";
    const { data: record, error: recordError } = await admin
      .from(table)
      .select("*")
      .eq("shop_id", tokenRow.shop_id)
      .eq("legacy_id", tokenRow.legacy_record_id)
      .maybeSingle();
    if (recordError || !record) return json(404, { ok: false, error: "The linked record is no longer available." });

    void admin.from("qr_status_tokens").update({ last_opened_at: new Date().toISOString() }).eq("id", tokenRow.id);
    if (type === "consult" && url.searchParams.get("format") === "ics") {
      const start = icsDate(record.event_date, record.event_time);
      const end = icsDate(record.event_date, record.end_time || record.event_time || "10:00");
      const calendar = [
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//GadgetBoy POS//Consultation Reminder//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
        "BEGIN:VEVENT", `UID:consult-${tokenRow.shop_id}-${tokenRow.legacy_record_id}@gadgetboypos`,
        `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}`,
        `DTSTART:${start}`, `DTEND:${end}`, `SUMMARY:${icsEscape(record.title || "GadgetBoy Consultation")}`,
        `LOCATION:${icsEscape(record.location || "At Shop Location")}`,
        `DESCRIPTION:${icsEscape(record.notes || "Scheduled consultation with GadgetBoy Repair & Retail.")}`,
        "BEGIN:VALARM", "TRIGGER:-PT1H", "ACTION:DISPLAY", "DESCRIPTION:Consultation begins in one hour", "END:VALARM",
        "END:VEVENT", "END:VCALENDAR", "",
      ].join("\r\n");
      return new Response(calendar, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "text/calendar; charset=utf-8",
          "Content-Disposition": `attachment; filename="GadgetBoy-Consultation-${tokenRow.legacy_record_id}.ics"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const reference = type === "sale" ? `INV-${tokenRow.legacy_record_id}` : type === "consult" ? `CONS-${tokenRow.legacy_record_id}` : `WO-${tokenRow.legacy_record_id}`;
    return json(200, {
      ok: true,
      type,
      reference,
      title: titleFor(type, record),
      status: statusFor(type, record),
      date: type === "consult" ? safe(record.event_date, 20) : safe(record.estimated_date, 40),
      time: type === "consult" ? safe(record.event_time, 20) : "",
      endTime: type === "consult" ? safe(record.end_time, 20) : "",
      location: type === "consult" ? safe(record.location || "At Shop Location", 500) : "",
      technician: type === "consult" ? safe(record.technician, 200) : "",
      icsUrl: type === "consult" ? `${url.origin}${url.pathname}?token=${encodeURIComponent(token)}&format=ics` : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "QR status lookup failed.");
    console.error("qr-status failed", message);
    return json(500, { ok: false, error: message.slice(0, 1000) });
  }
});
