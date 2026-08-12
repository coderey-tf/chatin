/**
 * chat-engine.ts — Generic chat engine driven by BotConfig
 *
 * 4-step funnel:
 *   1. Greeting → ask for fields defined in bot_config.fields
 *   2. Extract field values from conversation (lead-parser.ts)
 *   3. If complete → send pricelist link + handover to admin
 *   4. If incomplete → ask for missing fields only
 *
 * Works for ANY industry — the BotField[] config defines what to collect.
 */

import { accumulateLeadData, isGreeting, type LeadData } from './lead-parser'
import type { BotField, BotConfig, Lead as DbLead } from './db'

import { INDUSTRY_TEMPLATES } from './industry-templates'

export { INDUSTRY_TEMPLATES }
export type { IndustryPreset as IndustryTemplate } from './industry-templates'

// ─── Helpers ───

export function buildFieldForms(fields: BotField[]): string {
  return fields
    .map(f => `${f.emoji} **${f.label}** ${f.required ? '' : '(opsional)'}:`)
    .join('\n')
}

export function buildMissingFields(fields: BotField[], missingKeys: string[]): string {
  return fields
    .filter(f => missingKeys.includes(f.key))
    .map(f => `- ${f.emoji} **${f.label}**`)
    .join('\n')
}

export function buildPricelistResponse(
  fieldValues: Record<string, string>,
  fields: BotField[],
  pricelistLinks: Record<string, string>,
  businessName: string,
): string {
  const name = fieldValues['name'] || fieldValues['contact_name'] || 'Kak'
  const pkg = fieldValues['_package']
  const link = pkg && pricelistLinks[pkg] ? pricelistLinks[pkg] : Object.values(pricelistLinks)[0]

  const fieldSummary = fields
    .filter(f => fieldValues[f.key])
    .map(f => `${f.emoji} **${f.label}**: ${fieldValues[f.key]}`)
    .join('\n')

  let msg = `Terima kasih banyak, Kak ${name}! ✨\n\nData sudah kami catat:\n${fieldSummary}\n\n`
  if (link) msg += `📄 Berikut link pricelist resmi:\n${link}\n\n`
  msg += `Percakapan ini akan segera dilanjutkan langsung oleh Admin kami untuk konsultasi & penyesuaian lebih lanjut! 😊`
  return msg
}

// ─── Main handler ───

export interface ChatEngineResult {
  reply: string
  leadSaved: boolean
  leadData: LeadData
  autoReply: boolean
  handoverToAdmin: boolean
}

/**
 * Main handler — generic, driven by BotConfig.
 */
export function handleChat(
  userMessage: string,
  history: Array<{ role: string; content: string }> = [],
  existingLead: DbLead | undefined | null,
  botConfig: {
    fields: BotField[]
    templates: Record<string, string>
    pricelist_links: Record<string, string>
    business_name: string
  },
): ChatEngineResult {
  const { fields, templates, pricelist_links, business_name } = botConfig
  const nameKey = fields.find(f => f.key === 'name' || f.key === 'contact_name')?.key || 'name'

  const existingData: Record<string, string> = existingLead
    ? (() => {
        if (typeof existingLead.data_json === 'object' && existingLead.data_json !== null) {
          return existingLead.data_json as Record<string, string>
        }
        if (typeof existingLead.data_json === 'string') {
          try { return JSON.parse(existingLead.data_json) as Record<string, string> } catch {}
        }
        return {}
      })()
    : {}

  // ── 1. Empty message ──
  if (!userMessage || !userMessage.trim()) {
    return {
      reply: `Halo! Ada yang bisa ${business_name} bantu? 😊`,
      leadSaved: false,
      leadData: { field_values: existingData, is_complete: false, missing_fields: fields.filter(f => f.required && !existingData[f.key]).map(f => f.key) },
      autoReply: true,
      handoverToAdmin: false,
    }
  }

  // ── 2. Existing lead → silent handover ──
  if (existingLead && existingLead.status !== 'Inquiry') {
    return {
      reply: '',
      leadSaved: false,
      leadData: { field_values: existingData, is_complete: true, missing_fields: [] },
      autoReply: false,
      handoverToAdmin: true,
    }
  }

  // ── 3. Greeting only → send full form ──
  if (isGreeting(userMessage, fields) && history.length <= 1 && Object.keys(existingData).length === 0) {
    const fieldForms = buildFieldForms(fields)
    const greeting = (templates.greeting || '')
      .replace(/\{\{business_name\}\}/g, business_name)
      .replace(/\{\{field_forms\}\}/g, fieldForms)
    return {
      reply: greeting,
      leadSaved: false,
      leadData: { field_values: {}, is_complete: false, missing_fields: fields.map(f => f.key) },
      autoReply: true,
      handoverToAdmin: false,
    }
  }

  // ── 4. Extract and accumulate data ──
  const leadInfo = accumulateLeadData(history, userMessage, fields, existingData)

  // ── 5. Complete → pricelist + handover ──
  if (leadInfo.is_complete) {
    const reply = buildPricelistResponse(leadInfo.field_values, fields, pricelist_links, business_name)
    return {
      reply,
      leadSaved: true,
      leadData: leadInfo,
      autoReply: true,
      handoverToAdmin: true,
    }
  }

  // ── 6. Incomplete → ask for missing fields ──
  const fieldForms = buildFieldForms(fields)
  const missingText = buildMissingFields(fields, leadInfo.missing_fields)
  const followup = (templates.followup || templates.greeting || '')
    .replace(/\{\{business_name\}\}/g, business_name)
    .replace(/\{\{missing_fields\}\}/g, missingText)
    .replace(/\{\{field_forms\}\}/g, fieldForms)

  return {
    reply: followup || `Terima kasih infonya Kak! 😊\nBoleh dilengkapi lagi ya:\n${missingText}`,
    leadSaved: false,
    leadData: leadInfo,
    autoReply: true,
    handoverToAdmin: false,
  }
}
