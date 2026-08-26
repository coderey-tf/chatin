/**
 * chat-engine.ts — Generic chat engine driven by BotConfig
 *
 * 4-step funnel:
 *   1. Greeting → ask for fields defined in bot_config.fields
 *   2. Extract field values from conversation (lead-parser.ts)
 *   3. If complete → send completion message with dynamic condition-based pricelist + handover to admin
 *   4. If incomplete → ask for missing fields only
 *
 * Works dynamically for ANY industry — zero hardcoded conditions or preset terms.
 */

import { accumulateLeadData, isGreeting, type LeadData } from './lead-parser'
import type { BotField, BotConfig, Lead as DbLead } from './db'

import { INDUSTRY_TEMPLATES } from './industry-templates'

export { INDUSTRY_TEMPLATES }
export type { IndustryPreset as IndustryTemplate } from './industry-templates'

// ─── Helpers ───

export function getFieldHint(field: BotField): string | undefined {
  if (field.placeholder && field.placeholder.trim()) {
    return field.placeholder.trim()
  }
  if (field.type === 'keyword' && field.keywords) {
    const keys = Object.keys(field.keywords)
    if (keys.length > 0) return keys.join(' / ')
  }
  if (field.type === 'select' && field.options) {
    if (field.options.length > 0) return field.options.join(' / ')
  }
  return undefined
}

export function buildFieldForms(fields: BotField[]): string {
  return fields
    .map(f => {
      const hint = getFieldHint(f)
      const hintText = hint ? ` _(${hint})_` : ''
      return `${f.emoji} *${f.label}* ${f.required ? '(wajib)' : '(opsional)'}${hintText}:`
    })
    .join('\n')
}

export function buildMissingFields(fields: BotField[], missingKeys: string[]): string {
  return fields
    .filter(f => missingKeys.includes(f.key))
    .map(f => {
      const hint = getFieldHint(f)
      const hintText = hint ? ` _(${hint})_` : ''
      return `${f.emoji} *${f.label}* ${f.required ? '(wajib)' : '(opsional)'}${hintText}:`
    })
    .join('\n')
}

/**
 * 100% Dynamic Conflict & Synonym-Aware Scoring Matcher for pricelist links.
 * Extracts synonyms and conflict groups dynamically from the active BotField[] configuration.
 * Works for ANY industry (Wedding, Rental, Clinic, Online Shop, Barbershop, Custom).
 */
export function findMatchingPricelistLink(
  fieldValues: Record<string, string>,
  pricelistLinks: Record<string, string>,
  fields: BotField[] = [],
): { title: string; url: string } | null {
  const entries = Object.entries(pricelistLinks).filter(([, url]) => Boolean(url))
  if (entries.length === 0) return null

  // If there is only 1 link configured, ALWAYS send it directly (no keyword condition needed)
  if (entries.length === 1) {
    const [singleKey, singleUrl] = entries[0]
    return { title: singleKey.replace(/\[.*?\]/, '').trim(), url: singleUrl }
  }

  // Combine all extracted lead values into lowercase text tokens
  const leadValuesArray = Object.values(fieldValues).filter(v => typeof v === 'string')
  const allValuesText = leadValuesArray.join(' ').toLowerCase()

  // ── Build Dynamic Synonyms & Conflict Maps directly from BotField[] ──
  const dynamicSynonyms: Record<string, string[]> = {}
  const dynamicConflictPairs: Array<{ valueA: string; keywordsA: string[]; valueB: string; keywordsB: string[] }> = []

  for (const field of fields) {
    if (field.type === 'keyword' && field.keywords) {
      const optionEntries = Object.entries(field.keywords)
      
      // Register synonyms for each value option
      for (const [valName, kwList] of optionEntries) {
        const valLower = valName.toLowerCase()
        const allKeywords = [valLower, ...kwList.map(k => k.toLowerCase())]
        
        for (const kw of allKeywords) {
          dynamicSynonyms[kw] = allKeywords
        }
      }

      // Register conflict pairs between options of the SAME field
      for (let i = 0; i < optionEntries.length; i++) {
        for (let j = i + 1; j < optionEntries.length; j++) {
          const [valA, kwA] = optionEntries[i]
          const [valB, kwB] = optionEntries[j]
          dynamicConflictPairs.push({
            valueA: valA,
            keywordsA: [valA.toLowerCase(), ...kwA.map(k => k.toLowerCase())],
            valueB: valB,
            keywordsB: [valB.toLowerCase(), ...kwB.map(k => k.toLowerCase())],
          })
        }
      }
    }
  }

  let bestMatch: { title: string; url: string; score: number } | null = null

  for (const [key, url] of entries) {
    if (!url) continue

    const cleanTitle = key.replace(/\[.*?\]/, '').trim()

    // Extract keywords: from explicit brackets "Title [kw1, kw2]" or title words
    const kwMatch = key.match(/\[(.*?)\]/)
    const keywords = kwMatch
      ? kwMatch[1].split(',').map(k => k.trim().toLowerCase()).filter(Boolean)
      : key.toLowerCase().split(/[\s+&/,_-]+/).filter(k => k.length > 2 && k !== 'pricelist' && k !== 'katalog')

    if (keywords.length === 0) continue

    let score = 0

    for (const kw of keywords) {
      const synList = dynamicSynonyms[kw] || [kw]
      const isMatched = synList.some(syn => allValuesText.includes(syn))

      if (isMatched) {
        score += 10
      } else {
        // Check if lead data selected a conflicting option from the same field
        for (const pair of dynamicConflictPairs) {
          const isKwInA = pair.keywordsA.some(k => k === kw || k.includes(kw) || kw.includes(k))
          const isKwInB = pair.keywordsB.some(k => k === kw || k.includes(kw) || kw.includes(k))

          if (isKwInA) {
            // Check if lead selected option B
            const leadSelectedB = pair.keywordsB.some(kB => allValuesText.includes(kB))
            if (leadSelectedB) {
              score -= 15 // Penalty for conflicting with lead selection
            }
          } else if (isKwInB) {
            // Check if lead selected option A
            const leadSelectedA = pair.keywordsA.some(kA => allValuesText.includes(kA))
            if (leadSelectedA) {
              score -= 15 // Penalty for conflicting with lead selection
            }
          }
        }
      }
    }

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { title: cleanTitle, url, score }
    }
  }

  if (bestMatch && bestMatch.score > -20) {
    return { title: bestMatch.title, url: bestMatch.url }
  }

  // Fallback to first link if all rules failed/conflicted
  const [firstKey, firstUrl] = entries[0]
  return { title: firstKey.replace(/\[.*?\]/, '').trim(), url: firstUrl }
}

export function buildPricelistResponse(
  fieldValues: Record<string, string>,
  fields: BotField[],
  pricelistLinks: Record<string, string>,
  businessName: string,
  completionTemplate?: string,
): string {
  const name = fieldValues['name'] || fieldValues['contact_name'] || 'Kak'

  // Dynamic Synonym & Conflict Scoring Matcher
  const matched = findMatchingPricelistLink(fieldValues, pricelistLinks, fields)

  const fieldSummary = fields
    .filter(f => fieldValues[f.key])
    .map(f => `${f.emoji} *${f.label}*: ${fieldValues[f.key]}`)
    .join('\n')

  const templateToUse = (completionTemplate && completionTemplate.trim())
    ? completionTemplate
    : INDUSTRY_TEMPLATES.wedding_decor.default_completion

  let messageBody = templateToUse
    .replace(/\{\{\s*business_name\s*\}\}/g, businessName)
    .replace(/\{\{\s*name\s*\}\}/g, name)
    .replace(/\{\{\s*field_summary\s*\}\}/g, fieldSummary)

  if (matched && matched.url && !messageBody.includes(matched.url)) {
    messageBody += `\n\n📄 *Link Katalog (${matched.title}):*\n${matched.url}`
  }

  return messageBody
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
      .replace(/\{\{\s*business_name\s*\}\}/g, business_name)
      .replace(/\{\{\s*field_forms\s*\}\}/g, fieldForms)
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

  // ── 5. Complete → send completion message with dynamic pricelist + handover to admin ──
  if (leadInfo.is_complete) {
    const reply = buildPricelistResponse(
      leadInfo.field_values,
      fields,
      pricelist_links,
      business_name,
      templates.completion
    )
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
    .replace(/\{\{\s*business_name\s*\}\}/g, business_name)
    .replace(/\{\{\s*missing_fields\s*\}\}/g, missingText)
    .replace(/\{\{\s*field_forms\s*\}\}/g, fieldForms)

  return {
    reply: followup || `Terima kasih infonya Kak! 😊\nBoleh dilengkapi lagi ya:\n${missingText}`,
    leadSaved: false,
    leadData: leadInfo,
    autoReply: true,
    handoverToAdmin: false,
  }
}
