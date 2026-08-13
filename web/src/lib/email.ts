/**
 * Outreach that reads like a person wrote it.
 *
 * Templates are built from the specific posting rather than filled from a
 * generic shell, because the thing that gets a reply is evidence you read the
 * job. Every draft therefore quotes something only this posting contains.
 */

import { hasTerm } from "./resume"
import type { Job, Settings } from "./types"

export interface Draft {
  key: string
  label: string
  when: string
  subject: string
  body: string
  /** Where this is meant to be sent, which decides how it should read. */
  medium?: "email" | "linkedin"
  /** LinkedIn enforces one; email does not. */
  limit?: number
}

/** The two or three most distinctive things this posting asks for. */
export function hooks(job: Job, idf: Record<string, number>, count = 3): string[] {
  return Array.from(new Set(job.keywords))
    .map((term) => ({ term, weight: idf[term] ?? 1 }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, count)
    .map((entry) => entry.term)
}

/**
 * What this posting asks for that you can actually stand behind.
 *
 * hooks() answers "what is distinctive about this job". That is the right
 * input for "the parts about X made me write", which is a statement about the
 * posting. It is the wrong input for "strongest on X", which is a statement
 * about you — and the drafts used it for both. The result was an email to a
 * hiring manager claiming the user was strongest on the two terms the resume
 * panel had, on the previous tab, listed as their biggest gaps.
 *
 * Evidence is the resume first, then the profile. Nothing else may be claimed.
 */
export function claimable(
  job: Job,
  idf: Record<string, number>,
  resume = "",
  strengths: string[] = [],
  count = 3,
): string[] {
  const body = resume.toLowerCase().replace(/\s+/g, " ")
  const claimed = new Set(strengths.map((s) => s.toLowerCase().trim()))
  return Array.from(new Set(job.keywords))
    .map((term) => {
      const t = term.toLowerCase()
      return {
        term,
        weight: idf[term] ?? 1,
        // Two tiers, not one. The resume is the document you attach to this
        // email, so a term it contains is corroborated the moment they open
        // it. A profile-only claim is still yours to make, but it leaves the
        // reader holding a resume that never mentions the thing you led with.
        inResume: hasTerm(body, t),
        inProfile: claimed.has(t),
      }
    })
    .filter((e) => e.inResume || e.inProfile)
    .sort((a, b) =>
      a.inResume === b.inResume ? b.weight - a.weight : a.inResume ? -1 : 1,
    )
    .slice(0, count)
    .map((entry) => entry.term)
}

/** Sentences that point at a link have nothing to say without one.
 *
 * The portfolio slot used to fall back to the words "my portfolio", which
 * produced "My portfolio is the shortest version of that: my portfolio" and
 * "Everything you would need is here: my portfolio". Both read as finished
 * prose while saying nothing, so they survive a skim and go out in a real
 * email. A slot that expects a URL and does not have one should take the
 * clause with it, leaving a sentence that is still true and still English.
 */
function linkClause(url: string | undefined, lead: string, tail = ""): string {
  return url ? `${lead} ${url}${tail}` : ""
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
  strengths: string[] = [],
): Draft[] {
  const topics = hooks(job, idf)
  const focus = topics.slice(0, 2).join(" and ") || "the problems this team is working on"
  // What drew you to the role can be anything the posting says. What you are
  // strongest at has to be something you can show.
  const proven = claimable(job, idf, me.resume_text || "", strengths, 2)
  const strength = proven.join(" and ")
  const years = me.years || 5
  const who = firstName(me)

  return [
    {
      key: "hiring_manager",
      label: "To the hiring manager",
      when: "Best first move. Send before or just after you apply.",
      subject: me.full_name ? `${job.title} — ${me.full_name}` : job.title,
      body: `Hi ${contactName},

I saw the ${job.title} role at ${job.company} and the parts about ${focus} are what made me write rather than only apply.

I am a product designer with ${years} years on ${
        job.india ? "India-first products" : "product teams"
      }, and most of my work has been the unglamorous half of design: making a system hold together as it grows, and making the interface honest about what it is doing.${linkClause(me.portfolio, " My portfolio is the shortest version of that:")}

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

If you do know them, would you be willing to pass my name along?${linkClause(me.portfolio, " Everything you would need is here:")}

Short version: ${years} years in product design${
        strength ? `, strongest on ${strength}` : ""
      }.

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

${years} years in product design.${
        strength ? ` The overlap with your posting is closest on ${strength}.` : ""
      }${linkClause(me.portfolio, " Portfolio and case studies:")}

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

/**
 * LinkedIn is not email with a different envelope.
 *
 * A connection note is capped at 300 characters, is read on a phone, and
 * arrives with no subject line and no context beyond your headline. Pasting an
 * email into it produces the thing everyone ignores. These are written to the
 * medium: one specific reason, one small ask, no preamble.
 */
export function linkedinDrafts(
  job: Job | null,
  me: Settings,
  idf: Record<string, number>,
  contactName = "there",
  contactTitle = "",
  strengths: string[] = [],
): Draft[] {
  const who = firstName(me)
  const topics = job ? hooks(job, idf, 2) : []
  // "mostly X" is a claim about your career, so it needs the same evidence the
  // email drafts need. Falling back to a JD term would put a stranger's words
  // in your mouth in a note you cannot edit after sending.
  const proven = job ? claimable(job, idf, me.resume_text || "", strengths, 1) : []
  const focus = proven[0] ?? topics[0] ?? "the work your team is doing"
  const honest = proven.length > 0
  const years = me.years || 5
  const company = job?.company ?? "your team"
  const role = job?.title ?? "design roles"
  const first = (contactName || "there").split(/\s+/)[0]
  const leads = /head|director|vp|chief|lead|principal/i.test(contactTitle)

  /* 300 characters is a hard limit, not a guideline: LinkedIn silently refuses
     to send a longer note. So the note is built in descending order of what
     matters and the first version that fits is the one you get. */
  const connect = [
    `Hi ${first} — I'm applying for the ${role} role at ${company}. ${years} years in product design${honest ? `, mostly ${focus}` : ""}. Not asking you to do anything with it; I'd just rather the application had a face attached.${linkClause(me.portfolio, " Work is at", ".")}`,
    `Hi ${first} — I'm applying for the ${role} role at ${company}. ${years} years in product design${honest ? `, mostly ${focus}` : ""}.${linkClause(me.portfolio, " Work is at", ".")}`,
    `Hi ${first} — applying for the ${role} role at ${company}. ${years} years in product design. ${
      me.portfolio || ""
    }`.trim(),
    `Hi ${first} — applying for the ${role} role at ${company}. ${years} years in product design.`,
  ].find((text) => text.length <= 300)

  return [
    {
      key: "li_connect",
      label: "Connection note",
      when: "300 characters, hard limit. This is the whole first impression.",
      medium: "linkedin",
      limit: 300,
      subject: "",
      body:
        connect ??
        `Hi ${first} — applying for a design role at ${company}. ${years} years in product design.`,
    },
    {
      key: "li_referral",
      label: "Referral ask",
      when: "Once they have accepted. Make it small and easy to refuse.",
      medium: "linkedin",
      subject: "",
      body: `Thanks for connecting, ${first}.

Direct version: there's a ${role} opening at ${company}${
        job?.url ? ` (${job.url})` : ""
      } and I'm applying either way. If you know the team and think it's a fit, a referral would help a lot. If you don't, or would rather not, that's a completely fine answer and I won't ask again.

${years} years in product design, strongest on ${focus}.${linkClause(me.portfolio, " Everything's here:", ".")}

Either way, thanks for the two minutes.`,
    },
    {
      key: "li_informational",
      label: "Ask for fifteen minutes",
      when: leads
        ? "To someone senior. Ask about the work, not the job — it is a far easier yes."
        : "When there is no open role, or you want to be known before there is.",
      medium: "linkedin",
      subject: "",
      body: `Hi ${first},

I've been following ${company}${
        topics.length ? ` and the way the team is approaching ${focus}` : ""
      }. I'm a product designer, ${years} years in, and I'd like to understand how design actually works there before I decide whether to apply.

Would you be open to fifteen minutes? I'll come with three specific questions and I'll keep to the fifteen.

If it's not a good time, no reply needed at all.

${who}`,
    },
    {
      key: "li_after_rejection",
      label: "After a no",
      when: "The most under-used message in a job search. Costs nothing, pays later.",
      medium: "linkedin",
      subject: "",
      body: `Hi ${first},

I didn't get the ${role} role, which is fair enough. Thank you for the time the team spent on it.

If anything opens later that you think fits better, I'd genuinely like to hear about it. And if there was one thing that would have made the difference, I'd take that feedback seriously — no obligation to give it.

${who}`,
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
