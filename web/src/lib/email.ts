/**
 * Outreach that reads like a person wrote it.
 *
 * Templates are built from the specific posting rather than filled from a
 * generic shell, because the thing that gets a reply is evidence you read the
 * job. Every draft therefore quotes something only this posting contains.
 */

import type { Job, Settings } from "./types"

export interface Draft {
  key: string
  label: string
  when: string
  subject: string
  body: string
}

/** The two or three most distinctive things this posting asks for. */
export function hooks(job: Job, idf: Record<string, number>, count = 3): string[] {
  return Array.from(new Set(job.keywords))
    .map((term) => ({ term, weight: idf[term] ?? 1 }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, count)
    .map((entry) => entry.term)
}

function signature(me: Settings): string {
  const lines = [me.full_name || "—"]
  if (me.portfolio) lines.push(me.portfolio)
  if (me.linkedin) lines.push(me.linkedin)
  if (me.phone) lines.push(me.phone)
  return lines.join("\n")
}

function firstName(me: Settings): string {
  return (me.full_name || "").split(/\s+/)[0] || "I"
}

export function drafts(
  job: Job,
  me: Settings,
  idf: Record<string, number>,
  contactName = "there",
): Draft[] {
  const topics = hooks(job, idf)
  const focus = topics.slice(0, 2).join(" and ") || "the problems this team is working on"
  const years = me.years || 5
  const portfolio = me.portfolio || "my portfolio"
  const who = firstName(me)

  return [
    {
      key: "hiring_manager",
      label: "To the hiring manager",
      when: "Best first move. Send before or just after you apply.",
      subject: `${job.title} — ${me.full_name || "portfolio"}`,
      body: `Hi ${contactName},

I saw the ${job.title} role at ${job.company} and the parts about ${focus} are what made me write rather than only apply.

I am a product designer with ${years} years on ${
        job.india ? "India-first products" : "product teams"
      }, and most of my work has been the unglamorous half of design: making a system hold together as it grows, and making the interface honest about what it is doing. My portfolio is the shortest version of that: ${portfolio}

If it is useful I can walk through how I would approach ${topics[0] ?? "the first problem on your list"} here — happy to do that in fifteen minutes or in writing, whichever suits.

Either way, thank you for reading.

${signature(me)}`,
    },
    {
      key: "referral",
      label: "Asking for a referral",
      when: "To someone already inside. Make the ask small and easy to refuse.",
      subject: `Quick one about the ${job.title} role at ${job.company}`,
      body: `Hi ${contactName},

You are at ${job.company}, and there is a ${job.title} opening I am seriously considering: ${job.url}

No pressure at all — if you do not know the team or would rather not, that is a completely fine answer and I will not ask twice.

If you do know them, would you be willing to pass my name along? Everything you would need is here: ${portfolio}

Short version: ${years} years in product design, strongest on ${focus}.

Thanks either way,
${who}`,
    },
    {
      key: "recruiter",
      label: "To the recruiter",
      when: "When the posting names one, or you found them on LinkedIn.",
      subject: `${job.title} (${job.location_raw || "open role"}) — application`,
      body: `Hi ${contactName},

I have applied for the ${job.title} role${
        job.location_raw ? ` in ${job.location_raw}` : ""
      } and wanted to put a face to the application.

${years} years in product design. The overlap with your posting is closest on ${focus}. Portfolio and case studies: ${portfolio}

If the role has already moved on, I would still be glad to be kept in mind for design work at ${job.company}.

${signature(me)}`,
    },
    {
      key: "followup",
      label: "Following up",
      when: "Seven to ten days after applying. Once only.",
      subject: `Following up — ${job.title}`,
      body: `Hi ${contactName},

I applied for the ${job.title} role about a week ago and wanted to follow up once, briefly.

I am still very interested, particularly in ${topics[0] ?? "the direction of the team"}. If there is anything that would help — a portfolio walkthrough, references, or a short written take on a problem you are facing — I am happy to send it.

If the answer is no, that is genuinely fine and I would appreciate knowing so I can stop checking.

${signature(me)}`,
    },
  ]
}

export function renderPattern(pattern: string, first: string, last: string, domain: string): string {
  const f = first.trim().toLowerCase()
  const l = last.trim().toLowerCase()
  if (!f || !domain) return ""
  const local = pattern
    .replace("{first}", f)
    .replace("{last}", l)
    .replace("{f}", f.slice(0, 1))
    .replace("{l}", l.slice(0, 1))
  return `${local}@${domain}`
}

export function mailto(to: string, subject: string, body: string): string {
  const target = to && to.includes("@") ? encodeURIComponent(to) : ""
  return `mailto:${target}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
