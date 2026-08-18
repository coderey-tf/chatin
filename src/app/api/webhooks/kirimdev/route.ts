import { NextRequest, NextResponse } from "next/server";
import {
  upsertCustomer,
  getBotConfig,
  getLeadByPhone,
  upsertLead,
  insertMessageLog,
  getCustomer,
} from "@/lib/db";
import { handleChat } from "@/lib/chat-engine";
import { INDUSTRY_TEMPLATES } from "@/lib/industry-templates";
import type { BotField } from "@/lib/db";
import { verifyWebhookSignature } from "@/lib/webhook-verify";
import { createAdminClient } from "@/lib/supabase/admin";
import { kirim } from "@/lib/kirimdev";

interface StandardWebhookEvent {
  id: string;
  type: string;
  created_at: string;
  data: Record<string, unknown>;
}

/**
 * Parse KirimDev webhook body.
 * Real format (from logs):
 *   POST body: {"entry": [{"id": "...", "changes": [{"field": "messages", "value": {
 *     "contacts": [{"wa_id": "62851...", "profile": {"name": "..."}}],
 *     "messages": [{"id": "wamid...", "from": "62851...", "text": {"body": "tess"}, "type": "text", "timestamp": "..."}]
 *   }}]}]
 *   Header: x-kirim-event: message.received
 *   Header: x-kirim-event-id: wamid....
 *   Header: x-kirim-signature: t=TIMESTAMP,v1=HEX
 */
function parseWebhookPayload(
  rawBody: string,
  headerEventType: string | null,
): StandardWebhookEvent {
  let parsed: Record<string, unknown> = {};
  try {
    const json = JSON.parse(rawBody);
    if (Array.isArray(json) && json.length > 0) {
      parsed = json[0] as Record<string, unknown>;
    } else if (typeof json === "object" && json !== null) {
      parsed = json as Record<string, unknown>;
    }
  } catch {}

  // 1. Type: from header x-kirim-event (most reliable) OR body OR entry field
  let type = "unknown";
  if (headerEventType) {
    type = headerEventType;
  } else if (typeof parsed.type === "string") {
    type = parsed.type;
  } else if (typeof parsed.event === "string") {
    type = parsed.event;
  } else if (Array.isArray(parsed.entry) && parsed.entry.length > 0) {
    const entry = parsed.entry[0] as Record<string, unknown>;
    const changes = (entry?.changes as Record<string, unknown>[]) || [];
    const field = changes[0]?.field as string | undefined;
    if (field === "messages") type = "message.received";
    else if (field) type = field;
  }

  // 2. ID: for Meta format, use wamid from entry
  let id = "";
  if (Array.isArray(parsed.entry)) {
    const entry = parsed.entry[0] as Record<string, unknown>;
    const changes = (entry?.changes as Record<string, unknown>[]) || [];
    const value = changes[0]?.value as Record<string, unknown> | undefined;
    const msgs = value?.messages as Record<string, unknown>[] | undefined;
    id = (msgs?.[0]?.id as string) || "";
  }
  if (!id) {
    id =
      (parsed.id as string) ||
      (parsed.event_id as string) ||
      (parsed.message_id as string) ||
      `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  }

  return {
    id,
    type,
    created_at: (parsed.created_at as string) || new Date().toISOString(),
    data: parsed,
  };
}

function extractInboundMessage(
  event: StandardWebhookEvent,
): { from: string; body: string; waName?: string; wamid?: string } | null {
  const d = event.data;

  // ── Meta entry format (actual KirimDev format) ──
  if (Array.isArray(d.entry) && d.entry.length > 0) {
    const entry = d.entry[0] as Record<string, unknown>;
    const changes =
      (entry?.changes as Record<string, unknown>[] | undefined) || [];
    for (const change of changes) {
      if (change.field === "messages" || change.field === "message") {
        const value = change.value as Record<string, unknown> | undefined;
        if (!value) continue;
        const messages = value.messages as
          | Array<Record<string, unknown>>
          | undefined;
        const contacts = value.contacts as
          | Array<Record<string, unknown>>
          | undefined;
        if (messages?.[0]) {
          const m = messages[0];
          const from = (m.from as string) || (m.sender as string) || "";
          const textBody =
            (m.text as { body?: string } | undefined)?.body ||
            (m as { body?: string }).body ||
            (m as { text_body?: string }).text_body ||
            (m as { content?: string }).content;
          const wamid = (m.id as string) || (m.wamid as string) || undefined;
          const waName =
            (contacts?.[0]?.profile as { name?: string } | undefined)?.name ||
            (m as { wa_name?: string }).wa_name ||
            (m as { name?: string }).name;
          if (from && textBody && typeof textBody === "string") {
            return { from, body: textBody, waName, wamid };
          }
        }
      }
    }
  }

  // ── KirimDev message envelope format ──
  const msg =
    (d.message as Record<string, unknown> | undefined) ||
    (d as Record<string, unknown>);
  if (msg) {
    const from =
      (msg.from as string) ||
      (msg.phone as string) ||
      (msg.sender as string) ||
      (msg.contact_phone as string) ||
      "";

    const textBody =
      (msg.text as { body?: string } | undefined)?.body ||
      (msg.body as string | undefined) ||
      (msg.text_body as string | undefined) ||
      (msg.content as string | undefined) ||
      (msg.message as string | undefined);

    const wamid = (msg.id as string) || (msg.wamid as string) || undefined;
    const waName =
      (msg.wa_name as string) ||
      (msg.name as string) ||
      (msg.sender_name as string) ||
      undefined;

    if (from && textBody && typeof textBody === "string") {
      return { from, body: textBody, waName, wamid };
    }
  }

  return null;
}

// POST /api/webhooks/kirimdev - Receive KirimDev webhooks
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const headerEventType = request.headers.get("x-kirim-event") || null;
    const kirimEventId = request.headers.get("x-kirim-event-id") || null;

    const event = parseWebhookPayload(rawBody, headerEventType);
    if (kirimEventId) event.id = kirimEventId;

    const sb = createAdminClient();

    // Verify HMAC — log warning only, don't block (makes debugging easier)
    const secret = process.env.KIRIMDEV_WEBHOOK_SECRET;
    const signature =
      request.headers.get("x-kirim-signature") ||
      request.headers.get("x-kirimdev-signature") ||
      request.headers.get("x-kirimdev-signature-256") ||
      request.headers.get("x-kirim-signature-256") ||
      request.headers.get("x-kirim-signature") ||
      request.headers.get("x-signature") ||
      request.headers.get("x-hub-signature-256");
    if (secret && signature) {
      try {
        const valid = verifyWebhookSignature(rawBody, signature, secret);
        if (!valid) {
          console.warn(
            "[webhook] ⚠️ HMAC signature mismatch — continuing anyway",
          );
        }
      } catch (e) {
        console.warn(
          "[webhook] HMAC verify error (non-fatal):",
          e instanceof Error ? e.message : e,
        );
      }
    }

    try {
      await sb.from("webhook_events").upsert(
        {
          id: event.id,
          type: event.type,
          payload: event.data,
          processed: true,
          created_at: event.created_at,
        },
        { onConflict: "id" },
      );
    } catch {}

    // Process inbound message for ANY message.* event type
    const inbound = extractInboundMessage(event);
    if (inbound) {
      await handleInboundMessagePayload(event, inbound);
    } else if (
      event.type.startsWith("message.") ||
      event.type.startsWith("whatsapp.")
    ) {
      // Event claims to be a message but we couldn't extract — log for debugging
      console.log(
        `[webhook] ⚠️ Message event type "${event.type}" id "${event.id}" but no inbound extracted. Keys: ${JSON.stringify(Object.keys(event.data)).substring(0, 200)}`,
      );
    }

    // Process status updates from Meta (sent, delivered, read, failed)
    if (Array.isArray(event.data.entry) && event.data.entry.length > 0) {
      const entry = event.data.entry[0] as Record<string, unknown>;
      const changes =
        (entry?.changes as Record<string, unknown>[] | undefined) || [];
      for (const change of changes) {
        if (change.field === "messages" || change.field === "message") {
          const value = change.value as Record<string, unknown> | undefined;
          const statuses = value?.statuses as
            | Array<Record<string, unknown>>
            | undefined;
          if (statuses && Array.isArray(statuses)) {
            for (const s of statuses) {
              const statusId = (s.id as string) || (s.wamid as string);
              const newStatus = s.status as string;
              if (statusId && newStatus) {
                await sb
                  .from("message_logs")
                  .update({ status: newStatus })
                  .or(`id.eq.${statusId},wamid.eq.${statusId}`);
                console.log(
                  `[webhook] Updated message status for ${statusId} -> ${newStatus}`,
                );
              }
            }
          }
        }
      }
    }

    // Handle customer / phone events
    switch (event.type) {
      case "customer.onboarded": {
        const c =
          (event.data.customer as Record<string, unknown> | undefined) ||
          event.data;
        if (c && c.id) {
          const phoneNumberObj = event.data.phone_number as
            | Record<string, unknown>
            | undefined;
          await upsertCustomer({
            id: c.id as string,
            name: (c.name as string) || "Customer",
            email: (c.email as string) || null,
            status: (c.status as string) || "active",
            phone_number_id:
              (phoneNumberObj?.phone_number_id as string) || undefined,
            phone_number: (phoneNumberObj?.phone_number as string) || undefined,
            wa_account_status:
              (phoneNumberObj?.status as string) || "connected",
            updated_at: new Date().toISOString(),
            onboarded_at: new Date().toISOString(),
          });
          console.log(`[webhook] Customer onboarded: ${c.name} (${c.id})`);
        }
        break;
      }
      case "customer.created":
      case "customer.updated": {
        const c =
          (event.data.customer as Record<string, unknown> | undefined) ||
          event.data;
        if (c && c.id) {
          await upsertCustomer({
            id: c.id as string,
            name: (c.name as string) || "Customer",
            email: (c.email as string) || null,
            status: (c.status as string) || "active",
            updated_at: new Date().toISOString(),
          });
        }
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[webhook] Processing error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Webhook processing failed",
      },
      { status: 500 },
    );
  }
}

async function handleInboundMessagePayload(
  event: StandardWebhookEvent,
  inbound: { from: string; body: string; waName?: string; wamid?: string },
) {
  const sb = createAdminClient();
  const entry = (
    event.data.entry as Array<Record<string, unknown>> | undefined
  )?.[0];
  const value = (
    entry?.changes as Array<Record<string, unknown>> | undefined
  )?.[0]?.value as Record<string, unknown> | undefined;
  const metaPhoneId =
    (value?.phone_number_id as string | undefined) ||
    ((value?.metadata as Record<string, unknown> | undefined)
      ?.phone_number_id as string | undefined);

  const phoneId =
    ((event.data.phone_number as Record<string, unknown> | undefined)
      ?.phone_number_id as string | undefined) ||
    ((event.data.message as Record<string, unknown> | undefined)
      ?.phone_number_id as string | undefined) ||
    metaPhoneId;

  let customerId: string | undefined;

  if (phoneId) {
    const { data: cust } = await sb
      .from("customers")
      .select("id")
      .eq("phone_number_id", phoneId)
      .maybeSingle();
    if (cust) customerId = cust.id;
  }

  if (!customerId) {
    const { data: cust } = await sb
      .from("customers")
      .select("id, phone_number_id")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (cust) {
      customerId = cust.id;
      if (phoneId && !cust.phone_number_id) {
        await sb
          .from("customers")
          .update({ phone_number_id: phoneId })
          .eq("id", cust.id);
      }
    }
  }

  if (customerId) {
    await processInboundMessage(customerId, inbound, phoneId);
  } else {
    console.log(
      `[webhook] No customerId found for inbound from ${inbound.from} (phoneId: ${phoneId}) — cannot process`,
    );
  }
}

async function processInboundMessage(
  customerId: string,
  inbound: { from: string; body: string; waName?: string; wamid?: string },
  phoneNumberId?: string,
) {
  const botCfg = await getBotConfig(customerId);
  const custRow = await getCustomer(customerId);
  const businessName = custRow?.name || "Bisnis Kami";
  const effectivePhoneId = phoneNumberId || custRow?.phone_number_id;

  // 1. Log inbound message
  await insertMessageLog({
    id:
      inbound.wamid ||
      `in_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    customer_id: customerId,
    phone_number_id: effectivePhoneId || undefined,
    to_number: inbound.from,
    contact_phone: inbound.from,
    direction: "inbound",
    wamid: inbound.wamid || undefined,
    type: "incoming",
    status: "received",
    content: inbound.body,
  });

  console.log(
    `[webhook] Inbound logged: customer=${customerId} contact=${inbound.from} msg="${inbound.body.substring(0, 60)}"`,
  );

  if (!botCfg || !botCfg.enabled) {
    console.log(
      `[webhook] Bot disabled or not configured for customer ${customerId} — no auto-reply`,
    );
    return;
  }

  // ── Check Live WhatsApp Testing Whitelist Mode ──
  const configJson =
    typeof botCfg.config_json === "object" && botCfg.config_json !== null
      ? (botCfg.config_json as Record<string, unknown>)
      : (() => {
          try {
            return JSON.parse(botCfg.config_json as string);
          } catch {
            return {};
          }
        })();

  const isTestMode = configJson?.test_mode_enabled === true;
  const testPhonesRaw = (configJson?.test_phone_numbers as string) || "";

  if (isTestMode) {
    const allowedTestPhones = testPhonesRaw
      .split(/[\s,;]+/)
      .map((p) => p.replace(/[^\d]/g, "").replace(/^0/, "62"))
      .filter(Boolean);

    const senderPhoneClean = inbound.from
      .replace(/[^\d]/g, "")
      .replace(/^0/, "62");

    const isTester = allowedTestPhones.some(
      (tp) => senderPhoneClean.endsWith(tp) || tp.endsWith(senderPhoneClean),
    );

    if (!isTester) {
      console.log(
        `[webhook] 🧪 Live Test Mode ACTIVE — ignoring non-tester inbound from ${inbound.from}. Allowed whitelisted testers: [${allowedTestPhones.join(", ")}]`,
      );
      return;
    }
  }

  // ── Check Bot Mode ──
  const botMode = (configJson?.bot_mode as string) || "template";

  if (botMode === "custom") {
    // Forward to custom webhook endpoint (e.g., Flowku bot)
    await processCustomWebhook(
      customerId,
      inbound,
      effectivePhoneId || undefined,
      configJson,
    );
    return;
  }

  // ── Template Mode (existing flow) ──
  const parseJson = (val: unknown, fallback: unknown) => {
    if (!val) return fallback;
    if (typeof val === "object") return val;
    if (typeof val === "string") {
      try {
        return JSON.parse(val);
      } catch {
        return fallback;
      }
    }
    return fallback;
  };

  const preset =
    INDUSTRY_TEMPLATES[botCfg.industry_preset] ||
    INDUSTRY_TEMPLATES.wedding_decor;

  const rawFields = parseJson(botCfg.fields_json, []) as BotField[];
  const fields = rawFields.length > 0 ? rawFields : preset.fields;

  const rawTemplates = parseJson(botCfg.templates_json, {}) as Record<
    string,
    string
  >;
  const templates = {
    greeting: rawTemplates.greeting || preset.default_greeting,
    followup: rawTemplates.followup || preset.default_followup,
    completion: rawTemplates.completion || preset.default_completion,
  };

  const rawLinks = parseJson(botCfg.pricelist_links_json, {}) as Record<
    string,
    string
  >;
  const pricelistLinks =
    Object.keys(rawLinks).length > 0
      ? rawLinks
      : preset.default_pricelist_links;

  // 2. Check existing lead
  const existingLead = await getLeadByPhone(customerId, inbound.from);

  // 3. Run chat engine
  const result = handleChat(inbound.body, [], existingLead || null, {
    fields,
    templates,
    pricelist_links: pricelistLinks,
    business_name: businessName,
  });

  // 4. Save/update lead
  const fieldValues = result.leadData.field_values || {};
  const hasData = Object.keys(fieldValues).some(
    (k) => k !== "_package" && fieldValues[k],
  );

  if (hasData || result.leadData.is_complete || !existingLead) {
    const dataObj: Record<string, string> = {};
    for (const [k, v] of Object.entries(fieldValues)) {
      if (typeof v === "string" && v) dataObj[k] = v;
    }

    await upsertLead({
      customer_id: customerId,
      contact_phone: inbound.from,
      contact_name:
        dataObj["name"] ||
        dataObj["contact_name"] ||
        inbound.waName ||
        undefined,
      package: dataObj["_package"],
      status: result.leadData.is_complete
        ? result.handoverToAdmin
          ? "Contacted"
          : "Inquiry"
        : "Inquiry",
      data: dataObj,
      source: "whatsapp_bot",
      last_inbound_at: new Date().toISOString(),
    });
  }

  // 5. Auto-reply
  if (result.autoReply && result.reply && effectivePhoneId) {
    await sendWhatsAppReply(
      effectivePhoneId,
      inbound.from,
      result.reply,
      customerId,
    );
  }

  // 6. Mark as read (ONLY if bot auto-replied and has NOT handed over to human admin)
  if (
    inbound.wamid &&
    effectivePhoneId &&
    result.autoReply &&
    !result.handoverToAdmin
  ) {
    try {
      const phone = kirim.phoneNumbers(effectivePhoneId);
      await phone.messages.markAsRead(inbound.wamid);
    } catch {}
  }
}

/**
 * Process inbound message via custom external webhook (e.g., Flowku bot).
 * POST to the configured webhook URL with message payload,
 * receive { reply: "..." } response, and send reply via KirimDev.
 */
async function processCustomWebhook(
  customerId: string,
  inbound: { from: string; body: string; waName?: string; wamid?: string },
  phoneNumberId: string | undefined,
  configJson: Record<string, unknown>,
) {
  const webhookUrl = configJson?.custom_webhook_url as string;
  const webhookSecret = configJson?.custom_webhook_secret as string;
  const timeoutMs = (configJson?.custom_webhook_timeout_ms as number) || 15000;

  if (!webhookUrl) {
    console.log(
      `[webhook] Custom mode but no webhook URL configured for customer ${customerId}`,
    );
    return;
  }

  console.log(
    `[webhook] ⚡ Custom mode — forwarding to ${webhookUrl} for customer ${customerId}`,
  );

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Chatin-Secret": webhookSecret || "",
      },
      body: JSON.stringify({
        phone: inbound.from,
        text: inbound.body,
        type: "text",
        contact_name: inbound.waName || "",
        customer_id: customerId,
        message_id: inbound.wamid || "",
        timestamp: new Date().toISOString(),
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      const reply = data.reply as string;

      const targetPhoneId =
        phoneNumberId || process.env.KIRIMDEV_PHONE_NUMBER_ID;

      if (reply && targetPhoneId) {
        await sendWhatsAppReply(targetPhoneId, inbound.from, reply, customerId);
        console.log(
          `[webhook] ⚡ Custom reply sent to ${inbound.from} (${reply.length} chars)`,
        );
      } else {
        console.log(
          `[webhook] ⚡ Custom webhook returned empty reply or no valid phoneNumberId (reply: ${!!reply}, phoneId: ${targetPhoneId})`,
        );
      }
    } else {
      const errBody = await res.text().catch(() => "");
      console.error(
        `[webhook] ⚡ Custom webhook error: ${res.status} ${errBody.substring(0, 200)}`,
      );
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      console.error(
        `[webhook] ⚡ Custom webhook timeout (${timeoutMs}ms) for customer ${customerId}`,
      );
    } else {
      console.error(
        `[webhook] ⚡ Custom webhook error for customer ${customerId}:`,
        err,
      );
    }
  }

  // Mark as read regardless of custom webhook result
  const readPhoneId = phoneNumberId || process.env.KIRIMDEV_PHONE_NUMBER_ID;
  if (inbound.wamid && readPhoneId) {
    try {
      const phone = kirim.phoneNumbers(readPhoneId);
      await phone.messages.markAsRead(inbound.wamid);
    } catch {}
  }
}

async function sendWhatsAppReply(
  phoneNumberId: string,
  to: string,
  text: string,
  customerId: string,
) {
  try {
    // 1. Send "typing_on" action to Meta WhatsApp API via KirimDev
    try {
      await fetch(`https://api.kirimdev.com/v1/${phoneNumberId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.KIRIMDEV_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "action",
          action: { type: "typing_on" },
        }),
      });
      // Realistic typing duration (1 second)
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch {}

    // 2. Send text message payload
    const res = await fetch(
      `https://api.kirimdev.com/v1/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.KIRIMDEV_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: text },
        }),
      },
    );
    const data = await res.json();
    if (!res.ok) {
      console.error(
        "[webhook] Failed to send reply:",
        JSON.stringify(data).substring(0, 500),
      );
    } else {
      const wamid =
        data.messages?.[0]?.id || data.data?.id || `msg_${Date.now()}`;
      await insertMessageLog({
        id: wamid,
        customer_id: customerId,
        phone_number_id: phoneNumberId,
        to_number: to,
        contact_phone: to,
        direction: "outbound",
        type: "text",
        status: data.data?.status || "sent",
        content: text,
      });
      console.log(`[webhook] Auto-reply sent to ${to} (wamid=${wamid})`);
    }
  } catch (err) {
    console.error("[webhook] Error sending reply:", err);
  }
}

// GET health check
export async function GET() {
  return NextResponse.json({
    status: "webhook alive",
    version: "2.3.1",
    platform: "Supabase",
  });
}
