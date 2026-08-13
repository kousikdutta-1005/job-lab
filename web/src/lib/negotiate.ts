/**
 * The offer stage, which is where the money actually moves.
 *
 * Every tracker stops at "offer" as if it were an outcome. It is the start of
 * the only conversation in a job search with a five- or six-figure spread, and
 * the one people are least prepared for — because it happens once every few
 * years, under time pressure, against someone who does it weekly.
 *
 * This is not advice invented on the spot. It encodes the parts of negotiation
 * that are mechanical: what you should not say, what a number means relative to
 * the published band, and what the specific counter is. It refuses to suggest a
 * counter when it has no band to anchor against.
 */

import type { BenchmarkBand } from "./types"

export interface OfferInput {
  base: number
  level: string
  city: string
  currentCtc?: number
  competing?: number
}

export interface Move {
  title: string
  body: string
  tone: "do" | "avoid" | "note"
}

export interface OfferRead {
  percentile: number | null
  position: string
  counter: number | null
  counterRationale: string
  moves: Move[]
  band: BenchmarkBand | null
}

/** Roughly where a number falls inside a published low–median–high band. */
function percentileIn(band: BenchmarkBand, value: number): number {
  if (value <= band.low_inr) return 0
  if (value >= band.high_inr) return 100
  if (value <= band.median_inr) {
    const span = band.median_inr - band.low_inr || 1
    return Math.round(((value - band.low_inr) / span) * 50)
  }
  const span = band.high_inr - band.median_inr || 1
  return Math.round(50 + ((value - band.median_inr) / span) * 50)
}

/** The universal moves, which hold regardless of the numbers. */
function baseMoves(input: OfferInput): Move[] {
  return [
    {
      tone: "avoid",
      title: "Do not name your current salary",
      body: "In an anchoring contest the first number loses, and your current salary is a number about your last job, not this one. If asked directly, answer the question they actually mean: “I'm focused on the market rate for this scope — what range have you budgeted?”",
    },
    {
      tone: "avoid",
      title: "Do not accept on the call",
      body: "Enthusiasm and a decision are different things, and you can give one without the other. “This is genuinely exciting — can you send it in writing so I can read it properly? I'll come back tomorrow.” Nobody has ever lost an offer to that sentence.",
    },
    {
      tone: "do",
      title: "Negotiate the whole package, not just base",
      body: `Base is the hardest number for a recruiter to move because it sets bands for everyone else. Joining bonus, notice-period buyout, equity refresh, level, title, and start date are all cheaper for them and can be worth more to you.${
        input.currentCtc ? " A joining bonus can also bridge a notice-period gap without touching base." : ""
      }`,
    },
    {
      tone: "do",
      title: "Make them say a number first, then go quiet",
      body: "After they give a figure, thank them and stop talking. Silence is uncomfortable for the person who has a budget and a deadline, and it is free for you.",
    },
    {
      tone: "note",
      title: "Get the level right before the money",
      body: "A level is worth more than a raise, because it compounds into every future band and every future title. If the offer is at the bottom of a level, the argument to have is about scope and level, not about ten percent.",
    },
  ]
}

export function readOffer(
  input: OfferInput,
  bands: BenchmarkBand[],
): OfferRead {
  const band =
    bands.find((b) => b.city === input.city && b.seniority === input.level) ??
    bands.find((b) => b.country === "IN" && b.seniority === input.level) ??
    null

  const moves = baseMoves(input)

  if (!band || !input.base) {
    return {
      percentile: null,
      position: band
        ? "Enter the offered base to see where it sits in the published band."
        : `No published band for a ${input.level} designer in ${input.city}, so there is nothing honest to anchor against. The moves below still hold.`,
      counter: null,
      counterRationale: "",
      moves,
      band,
    }
  }

  const pct = percentileIn(band, input.base)

  let position: string
  let counter: number | null
  let counterRationale: string

  /* Outside the band is not the edge of the band. percentileIn clamps to 0 and
     100, which made an offer below the published minimum read as "near the
     floor" - merely low rather than the level problem it usually is - and an
     offer above the maximum read as "near the top of the published band" when
     it is not in the band at all. Both ends now say where the number actually
     sits, and by how much. */
  if (input.base < band.low_inr) {
    const under = Math.round(((band.low_inr - input.base) / band.low_inr) * 100)
    counter = Math.round(band.median_inr)
    position = `The offer is below the published band entirely — ${formatShort(
      input.base,
    )} against a floor of ${formatShort(band.low_inr)}, about ${under}% under it.`
    counterRationale = `Counter at the median, ${formatShort(
      counter,
    )}. Below the floor is rarely a budget conversation: either they have you at a lower level than the title suggests, or the band does not apply to this team. Ask which, before you argue about the number.`
  } else if (input.base > band.high_inr) {
    const over = Math.round(((input.base - band.high_inr) / band.high_inr) * 100)
    counter = null
    position = `The offer is above the top of the published band — ${formatShort(
      input.base,
    )} against a ceiling of ${formatShort(band.high_inr)}, about ${over}% over it.`
    counterRationale =
      "There is no market evidence left to argue with, and asking for more base invites someone to re-examine the number. Take it, and spend the goodwill on level, scope and a review date instead."
  } else if (pct <= 25) {
    counter = Math.round(band.median_inr)
    position = `The offer sits at roughly the ${pct}th percentile of the published band for ${input.level} designers in ${input.city} — near the floor.`
    counterRationale = `Counter at the median, ${formatShort(
      counter,
    )}. An offer this low is usually a level problem rather than a budget one, so ask what would take it to the middle of the band, and be ready for the answer to be a different level.`
  } else if (pct < 50) {
    counter = Math.round(band.median_inr + (band.high_inr - band.median_inr) * 0.25)
    position = `The offer is inside the band but below the median, at roughly the ${pct}th percentile.`
    counterRationale = `Counter slightly above the median, at ${formatShort(
      counter,
    )}. That leaves room to settle at the median, which is where you actually want to land.`
  } else if (pct < 75) {
    counter = Math.round(band.median_inr + (band.high_inr - band.median_inr) * 0.45)
    position = `The offer is above the median, at roughly the ${pct}th percentile. This is a fair offer.`
    counterRationale = `A counter at ${formatShort(
      counter,
    )} is defensible and low-risk, but the bigger prize here is the non-base components — joining bonus, equity, or level — rather than another few percent on base.`
  } else {
    counter = null
    position = `The offer is at roughly the ${pct}th percentile, near the top of the published band. This is a strong offer.`
    counterRationale =
      "Pushing base further is likely to hit a real ceiling. Ask for a joining bonus or an earlier review instead, accept graciously, and spend the goodwill on scope."
  }

  if (input.competing && input.competing > input.base) {
    moves.unshift({
      tone: "do",
      title: "You have leverage — use it once, precisely",
      body: `A competing offer of ${formatShort(
        input.competing,
      )} is the only leverage that reliably moves base. Name it once, without ultimatum: “I have another offer at ${formatShort(
        input.competing,
      )}. I would rather be here — is there room to close that gap?” Do not repeat it, and do not invent it.`,
    })
  }

  if (input.currentCtc && input.base < input.currentCtc * 1.2) {
    moves.unshift({
      tone: "note",
      title: "This is less than a 20% jump",
      body: `Against your current ${formatShort(
        input.currentCtc,
      )}, this offer is a ${Math.round(
        ((input.base - input.currentCtc) / input.currentCtc) * 100,
      )}% move. In the Indian market a change of company at the same level typically clears 20–30%; below that, the non-money reasons for moving have to be doing a lot of work.`,
    })
  }

  return { percentile: pct, position, counter, counterRationale, moves, band }
}

function formatShort(value: number): string {
  if (value >= 10_000_000) return `₹${(value / 10_000_000).toFixed(2)} Cr`
  if (value >= 100_000) return `₹${(value / 100_000).toFixed(1)} L`
  return `₹${Math.round(value).toLocaleString("en-IN")}`
}

export function counterScript(
  input: OfferInput,
  read: OfferRead,
  company: string,
  role: string,
): string {
  const ask = read.counter ? formatShort(read.counter) : "the middle of the band"
  return `Hi —

Thank you for the offer for ${role || "the role"}${company ? ` at ${company}` : ""}. I want to be clear that I want to do this job: the scope is the work I want to be doing, and I liked the people I met.

On the numbers, I was hoping we could get closer to ${ask}. That is where the published market sits for this level in ${input.city}, and it reflects the scope we discussed${
    input.competing ? ", and it is closer to another conversation I have open" : ""
  }.

If base is fixed, I am flexible about how we get there — a joining bonus, an earlier review, or the level itself would all work.

Happy to talk it through on a call if that is easier.`
}
