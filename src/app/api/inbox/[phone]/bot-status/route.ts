import { NextRequest, NextResponse } from "next/server";
import { getLeadByPhone, upsertLead } from "@/lib/db";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/inbox/[phone]/bot-status — Toggle bot active/disabled for a specific contact
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ phone: string }> },
) {
  try {
    const { phone } = await params;
    const body = await request.json();
    const { customer_id: customerId, bot_disabled: botDisabled } = body;

    if (!customerId || typeof botDisabled !== "boolean") {
      return NextResponse.json(
        { error: "customer_id and bot_disabled (boolean) are required" },
        { status: 400 },
      );
    }

    const existingLead = await getLeadByPhone(customerId, phone);
    const sb = createAdminClient();

    // If bot is disabled: set status to Contacted (or preserve non-Inquiry) and bot_disabled: true
    // If bot is enabled: reset bot_disabled to false and set status to Inquiry so bot can process
    const newStatus = botDisabled
      ? existingLead?.status && existingLead.status !== "Inquiry"
        ? existingLead.status
        : "Contacted"
      : "Inquiry";

    await upsertLead({
      customer_id: customerId,
      contact_phone: phone,
      contact_name: existingLead?.contact_name || undefined,
      package: existingLead?.package || undefined,
      status: newStatus,
      data: {
        bot_disabled: botDisabled ? "true" : "false",
        bot_status_updated_at: new Date().toISOString(),
      },
    });

    const updatedLead = await getLeadByPhone(customerId, phone);

    return NextResponse.json({
      success: true,
      bot_disabled: botDisabled,
      lead: updatedLead,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to update bot status",
      },
      { status: 500 },
    );
  }
}
