# Internship Application Copilot — Technical Specification Addendum (v3.0)

**Status:** Delta on top of v2.0 (does not restructure the core engine — per v2.0's own closing rule, this is a documented Decision → Reason → Trade-off addendum)  
**Scope of this addendum:** (1) dropdown/multi-option field detection was broken, (2) upload/scan/fill ordering was inefficient and technically wrong for how ATS platforms behave, (3) no mechanism existed for answering questions whose data isn't in the user's stored profile.

---

## 0. Summary of What Changed From v2.0

| # | Area | v2.0 | v3.0 | Why |
|---|------|------|------|-----|
| 13 | Dropdown / option detection | `dom-scanner.ts` treated each `<option>` (or each item in a custom listbox) as its own field | Dropdowns, comboboxes, radio groups, and checkbox groups are detected as one field with an `options[]` array; the classifier picks from that array via constrained enum, never free text | This was producing N spurious "questions" per dropdown instead of one field with N choices — the root cause report from production |
| 14 | Pipeline ordering | Generic "scan all fields → rule → AI → fill" with no ordering rule | Upload-first ordering: file-upload fields are detected, matched to stored Documents, and filled before the rest of the form is scanned | Several real ATS platforms (Greenhouse, Workday) run their own resume parser after upload and auto-populate or re-render fields — scanning/filling those fields first wastes AI calls on fields about to be overwritten or duplicated |
| 15 | Unknown-answer handling | No mechanism — a question with no matching profile field simply fell through to `action: "review"` with nothing else offered | New Resume Inference Layer: a one-time structured extraction from the resume populates a `ProfileInference` record (experience, seniority tier, skills, an explicitly-labeled rough compensation estimate); `generateAnswer` may draw on it, and every draft is cross-checked against it before being shown for review | The system serves students who fill dozens of near-identical forms; without this, every field not in the structured profile was a dead end |
| 16 | Compensation-related answers | Not addressed | Unconditional `action: "review"` override for any compensation/expected-salary question, regardless of confidence score | This is the single highest-stakes field type for a student applicant; a wrong or overconfident AI guess reaching a form un-reviewed is a real financial/negotiation risk, not just a UX bug |

Everything else in v2.0 is retained unchanged.

---

## 17. Dropdown, Combobox, and Multi-Option Field Detection (Fixes Issue #1)

### 17.1 Root cause
`dom-scanner.ts` previously walked the DOM for anything that looks like an answerable control and, for `<select>` elements and custom listbox widgets, was enumerating each `<option>` / `role="option"` node as an independent `FieldDescriptor`. That's why the pipeline treats a single "What's your graduation year?" dropdown with 10 options as 10 separate questions.

### 17.2 Corrected field model
A dropdown-like control is one field, never many. `FieldDescriptor` gains a discriminated type and an options array:

```typescript
type FieldDescriptor =
  | { type: "text" | "textarea"; label: string; name?: string; nearbyText?: string }
  | { type: "select"; label: string; options: string[]; multiple: boolean }
  | { type: "combobox"; label: string; options: string[]; multiple: boolean }
  | { type: "radio-group"; label: string; options: string[] }
  | { type: "checkbox-group"; label: string; options: string[] }
  | { type: "file"; label: string; accept?: string };
```

**Detection rules per control type:**
- **Native `<select>`**: group all child `<option>` text under one field; `multiple` = the `multiple` attribute.
- **Radio groups**: group by shared `name` attribute (native) or shared `role="radiogroup"` ancestor.
- **Checkbox groups**: group by shared `<fieldset>`/`aria-labelledby` ancestor pointing at one question, distinguished from a single standalone checkbox (e.g., "I agree to the terms") which stays a single boolean field.
- **Custom comboboxes** (React-select, headless-ui, MUI Autocomplete, Workday's own widgets): detect via `role="combobox"` / `role="listbox"` and `aria-owns` / `aria-controls` linkage. These frequently render their option list in a portal appended to `document.body`, not nested under the visible widget — the scanner must resolve the `aria-owns`/`aria-controls` id against the whole document, not just the widget's subtree, and may need to programmatically open the widget (dispatch a click/mousedown) to force the option list to mount before it can be read, then close it again. This lives in `combobox-resolver.ts` (new) as a sibling to `shadow-dom-walker.ts`.

### 17.3 Classifier contract change
`classifyField()` (§7) already forbids passing a full profile — it now also enforces that for any `select | combobox | radio-group | checkbox-group` field, the model's structured-output schema constrains the answer to an enum over that field's own `options[]`, not open text:

```typescript
function classifyField(
  field: FieldDescriptor,
  candidateProfilePaths: string[]
): Promise<{
  profilePath: string;
  // for enum-typed fields, this MUST be one of field.options (checkbox-group: string[])
  matchedOption: string | string[] | null;
  confidence: number;
}>
```

If none of the field's own options are a plausible match for the resolved profile value, that falls through to `action: "review"` exactly as any other ambiguous field would — it must never invent an option that isn't in the list, and must never silently pick the first option as a fallback.

**Decision → Reason → Trade-off:** Cap `options[]` length passed to the model at ~50 and, above that (e.g., a "Country" dropdown with 190 entries), resolve via a rule-based fuzzy match against the option list first, only falling back to an AI call if the rule match is ambiguous. → Sending 190 option strings to an LLM on every occurrence of a country field is wasteful and unnecessary. → Trade-off: one more rule-tier module (`option-list-matcher.ts`) to write and maintain, but it removes AI cost from the single most common large-option-list field type.

### 17.4 New fixtures (adds to §13)
```
tests/fixtures/forms/
  native-select-single.html
  native-select-multiple.html
  radio-group.html
  checkbox-group-vs-standalone.html   # asserts a lone checkbox isn't grouped
  combobox-portal-rendered.html       # react-select-style, options mounted in document.body
  combobox-large-option-list.html     # e.g. country picker, asserts rule-match path is used
```

Phase 2 exit criterion (§16) is extended: *"...and correctly groups every dropdown/radio/checkbox construct in the fixture set as a single field with a populated options[], never as N separate fields."*

---

## 18. Upload-First Pipeline Ordering (Fixes Issue #2)

### 18.1 Corrected sequence
1. Scan DOM for file-upload fields ONLY (`input[type=file]` + known drag-drop upload widgets)
2. Classify each upload field's expected document type (`resume | cover_letter | transcript | portfolio`) via label/nearbyText rule match against the `Document.type` enum
3. For each matched field, fetch the user's active Document of that type from the backend (signed download URL) and simulate the upload (see §18.3)
4. Wait for the page's own upload-complete signal (see §18.4) before proceeding
5. THEN run the full DOM scan (§9) across the now-settled form
6. Rule Matcher → Confidence Score → AI fallback → fill, as in v2.0

**Decision → Reason → Trade-off:** Uploads happen strictly before the general field scan, not in parallel and not after. → Greenhouse, Workday, and similar platforms commonly re-render or auto-populate name/email/phone/education fields from their own resume parser once the upload finishes — if the extension scans first, it either (a) maps and fills fields that get silently overwritten a moment later, or (b) races the ATS's own JS and produces inconsistent DOM state. → Trade-off: a fixed sync point adds latency to the overall autofill run, which must be shown to the user as a visible "Uploading resume…" state in the side panel rather than a silent pause.

### 18.2 Field detection for uploads
Beyond plain `input[type=file]`, many ATS forms use a styled drop-zone with a visually hidden file input. Detection heuristic: any element with `role="button"` or click handler whose nearest associated `input[type=file]` (via `for`, `aria-controls`, or DOM proximity) is found. Classification of which document goes where is a rule match against nearby label text ("Resume/CV" → `resume`, "Cover Letter" → `cover_letter`, "Transcript" → `transcript`) with confidence-tier fallback to AI classification if the label is ambiguous.

### 18.3 Simulating the file upload
A browser file input's `.files` property cannot be assigned directly (`input.files = [myFile]` throws / is ignored). In `event-dispatcher.ts`:

```typescript
async function fillFileInput(input: HTMLInputElement, file: File) {
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files; // works via DataTransfer
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}
```

The `File` object itself is constructed in the content script from a Blob fetched from the backend's signed URL.

### 18.4 Detecting upload completion
Layered wait strategy:
1. Prefer a site-specific `frameStrategy`/wait selector via the existing adapter-override mechanism (§9.5) where one is known (e.g., Greenhouse shows a filename chip on success).
2. Generic fallback: poll for either (a) a new element appearing that contains the uploaded filename text, or (b) the file input's associated form mutating (via `MutationObserver`), for up to a bounded timeout (8s).
3. If neither fires within the timeout, proceed anyway but flag the session with `uploadConfirmation: "unconfirmed"` so the review screen tells the user to double check the upload landed, rather than silently assuming success.

### 18.5 New/changed API contract
```http
POST /api/documents/:id/signed-download
Response: { url: string, expiresIn: 60 }
```
Backend-issued, short-lived, single document. Extension never stores this long-term.

### 18.6 New fixtures
```
tests/fixtures/forms/
  file-upload-native.html
  file-upload-dropzone-hidden-input.html
  file-upload-with-parser-repopulation.html  # simulates ATS overwriting name/email post-upload
```

Phase 2/3 exit criteria (§16) gain: *"...and file-upload fields are always filled before the general field scan runs, verified against file-upload-with-parser-repopulation.html."*

---

## 19. Resume Inference Layer (Fixes Issue #3)

### 19.1 Purpose and scope
For a question with no matching stored profile field, the system uses a second layer of context: things reasonably inferable from the resume itself (rough years of experience, skill emphasis, project seniority signal) plus an explicitly labeled rough expected compensation estimate.

This is a drafting aid, not career advice. Every place this data surfaces in the UI carries a visible *"AI estimate from your resume — review and edit"* label, and it is an opt-in preference.

### 19.2 New table
```
ProfileInference
  id, userId, resumeDocumentId,
  extractedAt,
  totalExperienceMonths        int,          -- summed from Experience/Project date ranges + resume text
  seniorityTier                enum(student, fresher, junior, mid),
  topSkills                    string[],     -- normalized skill tags, for matching against JD keywords
  inferredCompensation         json,         -- { min, max, currency, confidence, reasoning }
  reviewedByUser               boolean default false,
  userEditedCompensation       json nullable,-- if the user overrides the estimate, store their value here
  source                       = 'ai_resume_extraction',
  createdAt
```

**Decision → Reason → Trade-off:** Store this as its own table keyed to a specific `resumeDocumentId`, not as columns on `Profile`. → A user may have multiple resume versions; inference should be re-derivable per resume, not a single global blob that goes stale when they upload a new one. → Trade-off: `generateAnswer` needs one extra join to find "the inference row for the currently selected resume".

### 19.3 Extraction pipeline
Triggered once per resume upload (and re-run if the user replaces that resume), using the workhorse model tier with structured output:

```typescript
function extractResumeInference(
  resumeText: string,
  existingProfile: ProfileSummary
): Promise<{
  totalExperienceMonths: number;
  seniorityTier: "student" | "fresher" | "junior" | "mid";
  topSkills: string[];
  inferredCompensation: { min: number; max: number; currency: string; confidence: number; reasoning: string };
}>
```

### 19.4 The compensation estimate — hard constraints
- **Unconditional review, no exceptions**: Any field the classifier maps to a compensation/expected-salary/CTC category is forced to `action: "review"` regardless of confidence score — this overrides the normal threshold table for this category specifically. A number this consequential must never auto-fill.
- **Always shown with its reasoning**: The UI surfaces `inferredCompensation.reasoning` alongside the figure.
- **Framed as a rough estimate**: Copy in UI states *"rough estimate based on your resume, not a recommendation"*; opt-in.
- **User edits are sticky per-resume**: Once `userEditedCompensation` is set, future draft answers for that resume use the user's own figure.

### 19.5 generateAnswer extension
```http
POST /api/ai/generate-answer
Request: {
  questionText: string,
  questionCategory: string,
  relevantProfileFields: string[],
  useInferredProfile?: boolean
}
Response: {
  draftAnswer: string,
  confidence: number,
  consistencyFlag?: string
}
```

### 19.6 Consistency cross-check
Before a draft answer reaches the review screen, run a check against `ProfileInference`: if the draft answer states a number or claim that contradicts the inference layer (e.g., answer claims "2 years of professional experience" while `totalExperienceMonths` computed to 4), attach `consistencyFlag` and force `action: "review"` on that field even if answer-generation confidence was otherwise high.

### 19.7 New fixtures
```
tests/fixtures/resumes/
  fresher-cs-resume.txt
  experienced-with-gaps-resume.txt
tests/fixtures/forms/
  expected-salary-question.html              # asserts unconditional review, regardless of confidence
  open-ended-question-no-profile-match.html  # asserts inference layer is consulted, flagged for review
```

Phase 7 exit check: *"compensation-category questions are never auto-filled in the fixture suite even when inferredCompensation.confidence is set to 0.99 in the test fixture — this is a business-rule assertion, not a confidence-threshold one."*

---

## 20. Known Limitations — Additions to §15
- Custom combobox widgets that render their option list only after a synthetic open event, and that block synthetic events entirely, will show as "unsupported — please select manually".
- The compensation estimate is only as good as the resume's own detail; sparse resumes will produce a low-confidence range.
- Upload-completion detection is heuristic outside of an explicit adapter override; on unfamiliar ATS platforms the system may proceed with an "unconfirmed" flag.
