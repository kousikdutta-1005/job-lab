/**
 * Where the search is actually failing.
 *
 * "Send more applications" is the default advice and it is usually wrong. The
 * useful question is which step is leaking: nobody replying is a targeting or
 * resume problem, replies that die at the screen is a positioning problem, and
 * interviews that never convert is a portfolio problem. Those need opposite
 * responses, and the only way to tell them apart is to count.
 *
 * Everything here is counted from the tracker in this browser. Where there is
 * not enough data to say anything, it says that instead of drawing a shape.
 */

import type { Application, Stage } from "./types"

export interface FunnelStep {
  key: string
  label: string
  count: number
  /** Share of the previous step, or null at the top. */
  rate: number | null
  benchmark: number | null
  benchmarkNote: string | null
  reading: string | null
}

export interface Funnel {
  steps: FunnelStep[]
  enough: boolean
  /** The one step most worth fixing, if the numbers support naming one. */
  weakest: FunnelStep | null
  verdict: string
}

const REACHED: Record<string, Stage[]> = {
  screen: ["phone_screen", "interview", "offer", "accepted"],
  interview: ["interview", "offer", "accepted"],
  offer: ["offer", "accepted"],
}

/**
 * A rejection is a response. Silence is the thing being measured here, so an
 * application that was rejected counts as having been heard back from — it is
 * the ones that never answered at all that indicate a problem at the top.
 */
function heardBack(row: Application): boolean {
  if (row.stage === "rejected") return true
  if (REACHED.screen.includes(row.stage)) return true
  return row.activities.some((a) => a.type === "interview" || a.type === "offer")
}

export function funnel(applications: Application[]): Funnel {
  const applied = applications.filter((a) => a.date_applied)
  const replied = applied.filter(heardBack)
  const screened = applied.filter((a) => REACHED.screen.includes(a.stage))
  const interviewed = applied.filter((a) => REACHED.interview.includes(a.stage))
  const offered = applied.filter((a) => REACHED.offer.includes(a.stage))

  const share = (n: number, of: number): number | null => (of > 0 ? n / of : null)

  const steps: FunnelStep[] = [
    {
      key: "applied",
      label: "Applied",
      count: applied.length,
      rate: null,
      benchmark: null,
      benchmarkNote: null,
      reading: null,
    },
    {
      key: "replied",
      label: "Heard anything back",
      count: replied.length,
      rate: share(replied.length, applied.length),
      benchmark: 0.22,
      benchmarkNote:
        "Around 20–25% of applications to a public board get any response at all (Juvo Jobs, reported by Fast Company, 2025). A rejection counts as a response.",
      reading: null,
    },
    {
      key: "screen",
      label: "Reached a screen",
      count: screened.length,
      rate: share(screened.length, replied.length),
      benchmark: null,
      benchmarkNote: null,
      reading: null,
    },
    {
      key: "interview",
      label: "Reached an interview",
      count: interviewed.length,
      rate: share(interviewed.length, screened.length),
      benchmark: null,
      benchmarkNote: null,
      reading: null,
    },
    {
      key: "offer",
      label: "Offer",
      count: offered.length,
      rate: share(offered.length, interviewed.length),
      benchmark: null,
      benchmarkNote: null,
      reading: null,
    },
  ]

  // Ten is roughly where a rate stops being an accident of a small sample.
  const enough = applied.length >= 10

  if (applied.length === 0) {
    return {
      steps,
      enough: false,
      weakest: null,
      verdict: "Nothing applied to yet, so there is nothing to count.",
    }
  }

  if (!enough) {
    return {
      steps,
      enough: false,
      weakest: null,
      verdict: `${applied.length} application${applied.length === 1 ? "" : "s"} is too few to read a pattern into. The shape below is real but the percentages will swing on a single reply — treat them as counts, not rates, until there are about ten.`,
    }
  }

  const replyRate = steps[1].rate ?? 0

  if (replyRate < 0.12) {
    steps[1].reading =
      "This is the step that is leaking, and it is the one people respond to by applying more, which does not help. Under about 12% usually means the applications are going to roles that were never a close fit, or the resume is not making the fit obvious in the six seconds it gets."
    return {
      steps,
      enough,
      weakest: steps[1],
      verdict: `${Math.round(replyRate * 100)}% of your applications got any answer, against a typical 20–25%. The problem is at the top of the funnel: either what you are applying to, or what the resume says in its first third. More applications at this rate produces more silence.`,
    }
  }

  if (screened.length >= 4 && (steps[3].rate ?? 1) < 0.35) {
    steps[3].reading =
      "You are getting in the room and not getting past the first conversation. That is a positioning problem rather than a paper one — usually the story of what you did and why, rather than the work itself."
    return {
      steps,
      enough,
      weakest: steps[3],
      verdict:
        "Your applications are landing — people reply and you reach screens. What is not converting is the screen itself, which is a narrative problem, not a resume one. Prepare the two-minute version of each project before the next one.",
    }
  }

  if (interviewed.length >= 3 && offered.length === 0) {
    steps[4].reading =
      "Reaching interviews at all puts you ahead of most of the funnel. Nothing converting from there is usually the portfolio walkthrough: depth of process, or the outcome numbers being missing."
    return {
      steps,
      enough,
      weakest: steps[4],
      verdict: `${interviewed.length} interviews and no offer yet. The top of your funnel is working, so stop optimising it. The next hour is worth more on the portfolio walkthrough than on another application.`,
    }
  }

  return {
    steps,
    enough,
    weakest: null,
    verdict: `${Math.round(replyRate * 100)}% of applications got an answer, against a typical 20–25%. Nothing here is obviously broken, which means volume and targeting are both doing their job.`,
  }
}
