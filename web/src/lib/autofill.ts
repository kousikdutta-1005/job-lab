/**
 * One-click form filling on any ATS, from a static site with no extension.
 *
 * The constraint that shapes this: a page on this origin cannot touch a form on
 * `boards.greenhouse.io`. Browsers forbid it, correctly. Extensions get around
 * that with permissions this tool does not want and cannot ship without a store
 * listing.
 *
 * A bookmarklet inverts the problem. It runs *in the ATS page's own origin*,
 * because you launched it there. It cannot read this site's localStorage — so
 * the answer is to bake the data in at generation time. Your details are
 * literals inside the script you save to your bookmarks bar, which means the
 * bookmarklet is personal to you and never talks to a server, including ours.
 *
 * What this deliberately does NOT do is submit. Auto-submission is where these
 * tools stop being useful: recruiters recognise mass-applied dross instantly,
 * and the research is consistent that targeted applications are the only thing
 * that works at senior level. This fills the tedious fields and then stops, so
 * you read the form and write the answers that matter.
 */

import type { Settings } from "./types"

export interface FillProfile {
  first_name: string
  last_name: string
  full_name: string
  email: string
  phone: string
  linkedin: string
  portfolio: string
  location: string
}

export function profileFrom(settings: Settings): FillProfile {
  const parts = (settings.full_name || "").trim().split(/\s+/)
  return {
    first_name: parts[0] ?? "",
    last_name: parts.length > 1 ? parts.slice(1).join(" ") : "",
    full_name: settings.full_name ?? "",
    email: settings.email ?? "",
    phone: settings.phone ?? "",
    linkedin: settings.linkedin ?? "",
    portfolio: settings.portfolio ?? "",
    location: settings.location ?? "",
  }
}

/**
 * The filler, as source text.
 *
 * Written as a string rather than a real function so it can be embedded in a
 * `javascript:` URI with the profile injected. Kept dependency-free and ES5-ish
 * so it runs identically in whatever page it lands on.
 */
const FILLER = `(function(){
  var P = __PROFILE__;

  // React and Vue both wrap the value setter, so assigning .value directly
  // updates the DOM but leaves component state stale — the field looks filled
  // and submits empty. Going through the prototype's native setter and then
  // dispatching input is what makes framework-controlled forms actually accept
  // the value.
  function setValue(el, value){
    if(!el || value == null || value === "") return false;
    if(el.value && el.value.trim() !== "") return false;
    var proto = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    var desc = Object.getOwnPropertyDescriptor(proto, "value");
    if(desc && desc.set){ desc.set.call(el, value); } else { el.value = value; }
    el.dispatchEvent(new Event("input", {bubbles:true}));
    el.dispatchEvent(new Event("change", {bubbles:true}));
    el.dispatchEvent(new Event("blur", {bubbles:true}));
    return true;
  }

  function labelText(el){
    var bits = [el.name||"", el.id||"", el.placeholder||"", el.getAttribute("aria-label")||"", el.getAttribute("autocomplete")||""];
    if(el.id){
      // CSS.escape is missing in older Safari and in some embedded webviews,
      // and an unguarded call threw before a single field was filled.
      var safe = (window.CSS && window.CSS.escape)
        ? window.CSS.escape(el.id)
        : el.id.replace(/[^a-zA-Z0-9_-]/g, "\\\\$&");
      try {
        var lab = document.querySelector('label[for="' + safe + '"]');
        if(lab) bits.push(lab.textContent||"");
      } catch(e){}
    }
    var wrap = el.closest("label,div,fieldset");
    if(wrap){
      var own = wrap.querySelector("label,legend");
      if(own) bits.push(own.textContent||"");
    }
    return bits.join(" ").toLowerCase();
  }

  // Ordered: the most specific patterns first, because "name" matches
  // "first name", "last name" and "company name" alike.
  var RULES = [
    [/(?:^|[^a-z])(?:first[\\s_-]*name|given[\\s_-]*name|fname)/, P.first_name],
    [/last[\\s_-]*name|family[\\s_-]*name|surname|\\blname\\b/, P.last_name],
    [/full[\\s_-]*name|your name|candidate name|^name$|\\bname\\b(?!.*(company|school|university|referr|file))/, P.full_name],
    [/e-?mail/, P.email],
    [/phone|mobile|contact number|telephone/, P.phone],
    [/linked ?in/, P.linkedin],
    [/portfolio|dribbble|behance|personal[\\s_-]*(?:site|website)|(?:^|[^a-z])website(?![a-z])/, P.portfolio],
    [/location|city|where are you based|current residence/, P.location]
  ];

  var filled = 0, seen = {};
  var fields = document.querySelectorAll("input,textarea");

  for(var i=0;i<fields.length;i++){
    var el = fields[i];
    var type = (el.type||"").toLowerCase();
    if(type==="hidden"||type==="file"||type==="checkbox"||type==="radio"||type==="submit"||type==="button") continue;
    if(el.disabled||el.readOnly) continue;
    if(el.hidden) continue;
    if(window.getComputedStyle){
      var cs = window.getComputedStyle(el);
      if(cs && (cs.display==="none"||cs.visibility==="hidden")) continue;
    }

    var hay = labelText(el);
    // Lever renders a url[] input per network. Without this guard the
    // portfolio URL was written into GitHub, Stack Overflow and "Other" too,
    // which is worse than leaving them blank.
    if(/preferred|maiden|nickname|referr|emergency/.test(hay)) continue;
    if(/github|gitlab|stack ?overflow|twitter|dribbble|instagram|\\bother\\b|blog/.test(hay)) continue;
    for(var r=0;r<RULES.length;r++){
      if(seen[r] && RULES[r][1] === P.full_name) continue;
      if(RULES[r][0].test(hay)){
        if(setValue(el, RULES[r][1])){ filled++; seen[r]=1; }
        break;
      }
    }
  }

  var note = document.createElement("div");
  note.textContent = filled
    ? "job-lab filled " + filled + " field" + (filled===1?"":"s") + ". Check them, attach your resume, and write the open questions yourself."
    : "job-lab found nothing to fill here. The form may load its fields late \\u2014 try again once it has finished rendering.";
  note.setAttribute("style","position:fixed;z-index:2147483647;left:50%;transform:translateX(-50%);bottom:24px;background:#111418;color:#eceef1;font:13px/1.5 -apple-system,system-ui,sans-serif;padding:11px 16px;border-radius:9px;box-shadow:0 8px 30px rgba(0,0,0,.45);max-width:min(560px,90vw);border:1px solid #262c34");
  document.body.appendChild(note);
  setTimeout(function(){ note.remove(); }, 6000);
})();`

export function bookmarkletFor(settings: Settings): string {
  const profile = JSON.stringify(profileFrom(settings))
  const source = FILLER.replace("__PROFILE__", profile)
  // Collapse the whitespace a bookmark does not need, then encode so that
  // quotes and spaces survive being pasted into a bookmark URL field.
  const compact = source.replace(/\n\s*/g, " ")
  return `javascript:${encodeURIComponent(compact)}`
}

export function readiness(settings: Settings): { ready: boolean; missing: string[] } {
  const missing: string[] = []
  if (!settings.full_name) missing.push("full name")
  if (!settings.email) missing.push("email")
  if (!settings.phone) missing.push("phone")
  if (!settings.portfolio) missing.push("portfolio URL")
  return { ready: missing.length === 0, missing }
}
