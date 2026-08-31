import { NextRequest, NextResponse } from "next/server";
import { getConversationThread, getCustomer, insertMessageLog } from "@/lib/db";
import { kirim } from "@/lib/kirimdev";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/inbox/[phone]?customer_id=cus_xxx — fetch chat thread
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ phone: string }> },
) {
  try {
    const { phone } = await params;
    const searchParams = request.nextUrl.searchParams;
    const customerId = searchParams.get("customer_id");

    if (!customerId) {
      return NextResponse.json(
        { error: "customer_id is required" },
        { status: 400 },
      );
    }

    const cleanPhone = phone.replace(/^\+/, '')
    const altPhones = [cleanPhone, `+${cleanPhone}`]
    if (cleanPhone.startsWith('62')) {
      altPhones.push(`0${cleanPhone.slice(2)}`)
    }

    const sb = createAdminClient()
    const [thread, { data: lead }] = await Promise.all([
      getConversationThread(customerId, phone),
      sb
        .from("leads")
        .select("*")
        .eq("customer_id", customerId)
        .in("contact_phone", altPhones)
        .order("last_inbound_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    // Mark last inbound message as read when admin CS opens thread
    const lastInboundMsg = thread.slice().reverse().find(m => m.direction === 'inbound' && m.id && m.id.startsWith('wamid.'))
    if (lastInboundMsg?.id) {
      try {
        const customer = await getCustomer(customerId)
        if (customer?.phone_number_id) {
          const p = kirim.phoneNumbers(customer.phone_number_id)
          await p.messages.markAsRead(lastInboundMsg.id)
        }
      } catch {}
    }

    return NextResponse.json({ data: thread, count: thread.length, lead });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch thread",
      },
      { status: 500 },
    );
  }
}

// POST /api/inbox/[phone] — send direct reply from dashboard
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ phone: string }> },
) {
  try {
    const { phone: toPhone } = await params;
    const body = await request.json();
    const { customer_id: customerId, message } = body;

    if (!customerId || !message || !message.trim()) {
      return NextResponse.json(
        { error: "customer_id and message are required" },
        { status: 400 },
      );
    }

    const customer = await getCustomer(customerId);
    if (!customer?.phone_number_id) {
      return NextResponse.json(
        { error: "Customer not found or no WhatsApp number connected" },
        { status: 404 },
      );
    }

    // Check 24h window via leads table
    const sb = createAdminClient();
    const { data: lead } = await sb
      .from("leads")
      .select("last_inbound_at, status")
      .eq("customer_id", customerId)
      .eq("contact_phone", toPhone)
      .maybeSingle();

    const now = new Date().getTime();
    const lastInbound = lead?.last_inbound_at
      ? new Date(lead.last_inbound_at).getTime()
      : 0;
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    const is24hOpen = now - lastInbound < TWENTY_FOUR_HOURS;

    if (!is24hOpen && lastInbound > 0) {
      return NextResponse.json(
        {
          error:
            "Jendela 24 jam percakapan sudah tertutup. Pelanggan belum membalas pesan dalam 24 jam terakhir. Gunakan template untuk mengirim pesan.",
          code: "24h_window_closed",
        },
        { status: 400 },
      );
    }

    // Send via KirimDev SDK
    const phone = kirim.phoneNumbers(customer.phone_number_id);
    const result = await phone.messages.send({
      messaging_product: "whatsapp",
      to: toPhone,
      type: "text",
      text: { body: message.trim() },
    });

    // Log outbound message as admin manual reply (Solusi 1: Human Takeover)
    await insertMessageLog({
      id: result.id || `msg_${Date.now()}`,
      customer_id: customerId,
      phone_number_id: customer.phone_number_id,
      to_number: toPhone,
      contact_phone: toPhone,
      direction: "outbound",
      type: "admin_reply",
      status: result.status || "pending",
      content: message.trim(),
    });

    // Automatically mark lead as Contacted / admin takeover so bot will not interrupt
    try {
      const { upsertLead } = await import("@/lib/db");
      await upsertLead({
        customer_id: customerId,
        contact_phone: toPhone,
        status: lead?.status && lead.status !== "Inquiry" ? lead.status : "Contacted",
        data: {
          admin_takeover: "true",
          admin_replied_at: new Date().toISOString(),
        },
      });
    } catch (leadErr) {
      console.warn("[inbox] Failed to auto-update lead status on admin reply:", leadErr);
    }

    return NextResponse.json({ data: result, success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to send reply",
      },
      { status: 500 },
    );
  }
}
