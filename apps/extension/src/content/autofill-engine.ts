import { FieldDescriptor, FieldError, FieldMapping, UserProfile } from "@internship-copilot/types";
import { querySelectorAllDeep } from "./shadow-dom-walker";
import { setNativeValue, applyGoogleFormsState } from "./event-dispatcher";
import { autoUploadResume, ResumeUploadResult, SavedResumeDoc } from "./resume-uploader";
import { detectFieldValidationWarnings } from "./warning-detector";
import { findBestOptionMatch } from "./dropdown-matcher";
import { locateElement } from "./element-locator";
import { verifyAndCorrectFieldAnswers } from "./field-mapper";
import { runFillQueue, QueuedField, QueuedFieldType } from "./fill-queue";

export { locateElement };

export interface AutofillFieldCorrection {
  fieldId: string;
  rawLabel: string;
  previousValue: string | boolean;
  correctedValue: string | boolean;
  warningMessage: string;
}

export interface AutofillOptions {
  showCursor?: boolean;
  sessionId?: string;
  interFieldDelayMs?: number;
}

export interface AutofillResult {
  filledFieldIds: string[];
  skippedFieldIds: string[];
  errors: FieldError[];
  resumeUpload?: ResumeUploadResult;
  corrections?: AutofillFieldCorrection[];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function inferQueuedFieldType(el: HTMLElement, desc: FieldDescriptor): QueuedFieldType {
  if (el instanceof HTMLSelectElement || desc.type === "select") return "select";
  if (el.getAttribute("role") === "combobox" || el.getAttribute("role") === "listbox") return "custom-dropdown";
  if (desc.type === "radio" || (el instanceof HTMLInputElement && el.type === "radio")) return "radio";
  if (desc.type === "checkbox" || (el instanceof HTMLInputElement && el.type === "checkbox")) return "checkbox";
  if (desc.type === "date" || (el instanceof HTMLInputElement && el.type === "date")) return "date";
  return "text";
}

export async function executeAutofill(
  fields: FieldDescriptor[],
  mappings: FieldMapping[],
  profile: UserProfile | null = null,
  savedResume?: SavedResumeDoc | null,
  allDocuments?: SavedResumeDoc[] | null,
  options?: AutofillOptions
): Promise<AutofillResult> {
  const result: AutofillResult = {
    filledFieldIds: [],
    skippedFieldIds: [],
    errors: [],
    corrections: [],
  };

  // STEP 1: Scan and upload Resume / Marksheets / Transcripts / Docs as the VERY FIRST task before filling any field
  try {
    const resumeRes = autoUploadResume(profile, savedResume, allDocuments);
    result.resumeUpload = resumeRes;
  } catch (err) {
    console.warn("Document auto-upload encountered an error:", err);
  }

  // STEP 1.5: Question-Answer Anti-Hallucination & Relevance Guard
  const answerMap: Record<string, string | boolean | string[]> = {};
  for (const m of mappings) {
    if (m.valueToFill !== null && m.valueToFill !== undefined) {
      answerMap[m.fieldId] = m.valueToFill;
    }
  }
  const auditedAnswers = verifyAndCorrectFieldAnswers(fields, answerMap, profile);
  for (const m of mappings) {
    if (auditedAnswers[m.fieldId] !== undefined) {
      m.valueToFill = auditedAnswers[m.fieldId];
    }
  }

  // STEP 2: Sort mappings so primary country/dial fields fill before dependent state/nationality fields
  const prioritizedMappings = [...mappings].sort((a, b) => {
    const isPrimaryCountryA =
      a.profilePath === "personal.country" ||
      a.profilePath === "personal.countryCode" ||
      a.rawLabel?.toLowerCase() === "country*" ||
      a.rawLabel?.toLowerCase() === "country" ||
      a.rawLabel?.toLowerCase().includes("country code");

    const isPrimaryCountryB =
      b.profilePath === "personal.country" ||
      b.profilePath === "personal.countryCode" ||
      b.rawLabel?.toLowerCase() === "country*" ||
      b.rawLabel?.toLowerCase() === "country" ||
      b.rawLabel?.toLowerCase().includes("country code");

    const isDependentA =
      a.profilePath === "personal.state" ||
      a.profilePath === "personal.nationality" ||
      a.rawLabel?.toLowerCase().includes("state") ||
      a.rawLabel?.toLowerCase().includes("province");

    const isDependentB =
      b.profilePath === "personal.state" ||
      b.profilePath === "personal.nationality" ||
      b.rawLabel?.toLowerCase().includes("state") ||
      b.rawLabel?.toLowerCase().includes("province");

    if (isPrimaryCountryA && isDependentB) return -1;
    if (isDependentA && isPrimaryCountryB) return 1;
    return 0;
  });

  const pendingSelectRetries: Array<{ fieldDescriptor: FieldDescriptor; mapping: FieldMapping }> = [];

  const allDOMElements = querySelectorAllDeep(
    "input, select, textarea, [role='textbox'], [role='combobox'], [role='searchbox'], [role='spinbutton'], [role='radiogroup'], [role='group'], [role='radio'], [role='checkbox'], .SGkqec, .Y62e3c, [contenteditable='true'], [contenteditable='']"
  ).filter((element) => {
    if (element instanceof HTMLInputElement) {
      const type = (element.type || "text").toLowerCase();
      if (["hidden", "submit", "button", "reset", "image"].includes(type)) {
        return false;
      }
    }
    return true;
  });

  const filledValuesMap = new Map<string, string | boolean>();
  const filledElements = new Set<HTMLElement>();

  // Collect eligible fields to fill
  const eligibleItems: Array<{ fieldDescriptor: FieldDescriptor; mapping: FieldMapping; element: HTMLElement }> = [];

  for (const mapping of prioritizedMappings) {
    const fieldDescriptor = fields.find((f) => f.id === mapping.fieldId);
    if (!fieldDescriptor) {
      result.errors.push({
        fieldId: mapping.fieldId,
        errorCode: "ELEMENT_NOT_FOUND",
        message: "Field descriptor not found in active session",
      });
      continue;
    }

    if (mapping.action !== "fill" || mapping.valueToFill === null || mapping.valueToFill === undefined) {
      result.skippedFieldIds.push(mapping.fieldId);
      continue;
    }

    const targetElement = locateElement(fieldDescriptor, allDOMElements);

    if (!targetElement) {
      result.errors.push({
        fieldId: mapping.fieldId,
        errorCode: "ELEMENT_NOT_FOUND",
        message: `Could not locate DOM element for selector ${fieldDescriptor.domSelector}`,
      });
      continue;
    }

    if (filledElements.has(targetElement)) {
      continue;
    }

    eligibleItems.push({ fieldDescriptor, mapping, element: targetElement });
  }

  // Sort eligible fields by DOM position (document order / tabIndex) per §6.2
  eligibleItems.sort((a, b) => {
    if (a.element === b.element) return 0;
    const tabA = a.element.tabIndex > 0 ? a.element.tabIndex : 999999;
    const tabB = b.element.tabIndex > 0 ? b.element.tabIndex : 999999;
    if (tabA !== tabB && tabA !== 999999 && tabB !== 999999) {
      return tabA - tabB;
    }
    const pos = a.element.compareDocumentPosition(b.element);
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  });

  // Build sequential fill queue
  const fillQueue: QueuedField[] = eligibleItems.map((item) => ({
    frameId: item.fieldDescriptor.frameId || 0,
    domSelectorHash: item.fieldDescriptor.domSelectorHash || item.fieldDescriptor.id,
    element: item.element,
    profilePath: item.mapping.profilePath || "",
    value: String(item.mapping.valueToFill),
    fieldType: inferQueuedFieldType(item.element, item.fieldDescriptor),
  }));

  // Execute sequential fill with per-field verification (§6.3, §6.4)
  const queueResults = await runFillQueue(fillQueue, {
    showCursor: options?.showCursor ?? true,
    sessionId: options?.sessionId,
    interFieldDelayMs: options?.interFieldDelayMs ?? 10,
  });

  for (let i = 0; i < queueResults.length; i++) {
    const qRes = queueResults[i];
    const item = eligibleItems[i];
    if (!item) continue;

    if (qRes.status === "filled") {
      filledElements.add(item.element);
      result.filledFieldIds.push(item.mapping.fieldId);
      filledValuesMap.set(item.mapping.fieldId, item.mapping.valueToFill as string | boolean);
    } else if (qRes.status === "review") {
      if (item.element instanceof HTMLSelectElement) {
        // Queue for multi-stage retry if options load asynchronously
        pendingSelectRetries.push({ fieldDescriptor: item.fieldDescriptor, mapping: item.mapping });
      } else {
        result.errors.push({
          fieldId: item.mapping.fieldId,
          errorCode: "VALIDATION_FAILED",
          message: "Field failed verification after attempts; flagged for review",
        });
      }
    } else if (qRes.status === "skipped") {
      result.skippedFieldIds.push(item.mapping.fieldId);
    } else {
      result.errors.push({
        fieldId: item.mapping.fieldId,
        errorCode: "FRAMEWORK_BLOCKED",
        message: "Framework synthetic state rejected programmatic input; manual review required",
      });
    }
  }

  // Immediate retry pass for dropdowns that populated synchronously
  if (pendingSelectRetries.length > 0) {
    const refreshed = querySelectorAllDeep("input, select, textarea");
    const stillPending: Array<{ fieldDescriptor: FieldDescriptor; mapping: FieldMapping }> = [];
    for (const item of pendingSelectRetries) {
      const el = locateElement(item.fieldDescriptor, refreshed);
      if (el && el instanceof HTMLSelectElement) {
        const retry = setNativeValue(el, item.mapping.valueToFill as string | boolean);
        if (retry.success && retry.valueRegistered) {
          result.filledFieldIds.push(item.mapping.fieldId);
          continue;
        }
      }
      stillPending.push(item);
    }
    pendingSelectRetries.length = 0;
    pendingSelectRetries.push(...stillPending);
  }

  // STEP 3: Multi-stage retry for dependent select dropdowns that loaded options asynchronously
  if (pendingSelectRetries.length > 0) {
    await sleep(200); // Wait for AJAX/DOM option updates
    const refreshedElements = querySelectorAllDeep("input, select, textarea");
    const stillPending: Array<{ fieldDescriptor: FieldDescriptor; mapping: FieldMapping }> = [];

    for (const item of pendingSelectRetries) {
      const targetElement = locateElement(item.fieldDescriptor, refreshedElements);
      if (targetElement && targetElement instanceof HTMLSelectElement) {
        const retryResult = setNativeValue(targetElement, item.mapping.valueToFill as string | boolean);
        if (retryResult.success && retryResult.valueRegistered) {
          if (!result.filledFieldIds.includes(item.mapping.fieldId)) {
            result.filledFieldIds.push(item.mapping.fieldId);
          }
          continue;
        }
      }
      stillPending.push(item);
    }

    if (stillPending.length > 0) {
      await sleep(300); // Second wait for slower AJAX calls
      const lateElements = querySelectorAllDeep("input, select, textarea");
      for (const { fieldDescriptor, mapping } of stillPending) {
        const targetElement = locateElement(fieldDescriptor, lateElements);
        if (targetElement && targetElement instanceof HTMLSelectElement) {
          const lateRetry = setNativeValue(targetElement, mapping.valueToFill as string | boolean);
          if (lateRetry.success && lateRetry.valueRegistered) {
            if (!result.filledFieldIds.includes(mapping.fieldId)) {
              result.filledFieldIds.push(mapping.fieldId);
            }
            continue;
          }
        }

        result.errors.push({
          fieldId: mapping.fieldId,
          errorCode: "FRAMEWORK_BLOCKED",
          message: "Dropdown options could not be matched after DOM update; manual selection required",
        });
      }
    }
  }

  // STEP 4: Final verification & reconciliation across ALL select fields to ensure no field was reset by cascade
  const finalElements = querySelectorAllDeep("select");
  for (const mapping of mappings) {
    if (mapping.action !== "fill" || !mapping.valueToFill) continue;
    const fieldDescriptor = fields.find((f) => f.id === mapping.fieldId);
    if (!fieldDescriptor || fieldDescriptor.tag.toLowerCase() !== "select") continue;

    const selectEl = locateElement(fieldDescriptor, finalElements);
    if (selectEl && selectEl instanceof HTMLSelectElement) {
      const curOptText = selectEl.options[selectEl.selectedIndex]?.text || "";
      const curVal = selectEl.value || "";
      const isPlaceholder = !curVal && (curOptText.toLowerCase().includes("select") || curOptText.toLowerCase().includes("choose") || curOptText.toLowerCase().includes("please"));
      if (selectEl.selectedIndex <= 0 || isPlaceholder) {
        // Re-apply select value
        const reconcilRes = setNativeValue(selectEl, mapping.valueToFill as string | boolean);
        if (reconcilRes.success && reconcilRes.valueRegistered) {
          if (!result.filledFieldIds.includes(mapping.fieldId)) {
            result.filledFieldIds.push(mapping.fieldId);
          }
        }
      }
    }
  }

  // STEP 5: Post-Autofill Validation Warning Detection & NVIDIA NIM AI Self-Correction
  try {
    await sleep(150); // Allow frontend form validators to evaluate inputs and render error text
    const postFillElements = querySelectorAllDeep("input, select, textarea");
    const warnings = detectFieldValidationWarnings(fields, filledValuesMap, postFillElements);

    if (warnings.length > 0) {
      result.corrections = [];

      for (const warn of warnings) {
        const warnText = warn.warningMessage.toLowerCase();
        const prevVal = String(warn.attemptedValue || "").trim();
        const targetEl = locateElement(warn.fieldDescriptor, postFillElements);
        const combinedText = `${warn.fieldDescriptor.normalizedLabel} ${warn.fieldDescriptor.rawLabel} ${warn.fieldDescriptor.name || ""} ${warn.fieldDescriptor.nearbyText || ""}`.toLowerCase();
        let correctedVal: string | boolean | null = null;

        // 1. Numbers / Integers constraint (e.g. "Please enter in numbers", "Only integers allowed")
        if (warnText.includes("number") || warnText.includes("digit") || warnText.includes("integer") || warnText.includes("numeric") || warnText.includes("in numbers")) {
          if (prevVal.includes(".")) {
            const num = parseFloat(prevVal);
            correctedVal = isNaN(num) ? "3" : String(Math.floor(num) || 0);
          } else {
            const digits = prevVal.replace(/[^\d]/g, "");
            correctedVal = digits || "0";
          }
        }
        // 2. Select Dropdowns (e.g. Title*, Country Code*, Gender*, Nationality*, Months*, Notice Period)
        else if (targetEl instanceof HTMLSelectElement || warn.fieldDescriptor.tag === "select") {
          const selectEl = targetEl as HTMLSelectElement;
          const optionsList = Array.from(selectEl.options);

          // 2a. Title / Salutation / Prefix
          if (/\btitle\b|salutation|prefix/i.test(combinedText)) {
            const targetTitle = profile?.personal?.gender?.toLowerCase() === "female" ? "Ms." : "Mr.";
            const match = findBestOptionMatch(optionsList, targetTitle);
            if (match) correctedVal = match.matchedValue || match.matchedText;
          }
          // 2b. Country Code / Dial Code / ISD
          else if (/country[\s_-]?code|dial[\s_-]?code|isd[\s_-]?code/i.test(combinedText)) {
            const targetCode = profile?.personal?.countryCode || "+91";
            const match = findBestOptionMatch(optionsList, targetCode);
            if (match) correctedVal = match.matchedValue || match.matchedText;
          }
          // 2c. Gender / Sex
          else if (/\bgender\b|\bsex\b/i.test(combinedText)) {
            const targetGender = profile?.personal?.gender || "Male";
            const match = findBestOptionMatch(optionsList, targetGender);
            if (match) correctedVal = match.matchedValue || match.matchedText;
          }
          // 2d. Nationality
          else if (/nationality|citizenship/i.test(combinedText)) {
            const targetNat = profile?.personal?.nationality || "Indian";
            const match = findBestOptionMatch(optionsList, targetNat);
            if (match) correctedVal = match.matchedValue || match.matchedText;
          }
          // 2e. Country
          else if (/\bcountry\b|nation\b/i.test(combinedText)) {
            const targetCountry = profile?.personal?.country || "India";
            const match = findBestOptionMatch(optionsList, targetCountry);
            if (match) correctedVal = match.matchedValue || match.matchedText;
          }
          // 2f. State / Province
          else if (/\bstate\b|province|region/i.test(combinedText)) {
            const targetState = profile?.personal?.state || "Uttar Pradesh";
            const match = findBestOptionMatch(optionsList, targetState);
            if (match) correctedVal = match.matchedValue || match.matchedText;
          }
          // 2g. Experience Months
          else if (/\bmonths?\b/i.test(combinedText)) {
            const optMatch = optionsList.find((o) => /^0\b|zero|none/i.test(o.text) || /^0\b/i.test(o.value)) || optionsList[1];
            if (optMatch) correctedVal = optMatch.value || optMatch.text;
            else correctedVal = "0 months";
          }
          // 2h. Experience Years
          else if (/\byears?\b/i.test(combinedText) || combinedText.includes("experience")) {
            const optMatch = optionsList.find((o) => /^0\b|zero|none/i.test(o.text) || /^0\b/i.test(o.value)) || optionsList[1];
            if (optMatch) correctedVal = optMatch.value || optMatch.text;
            else correctedVal = "0";
          }
          // 2i. Notice Period / Availability
          else if (/notice|availability|joining|start[\s_-]?date/i.test(combinedText)) {
            if (targetEl instanceof HTMLInputElement && targetEl.type === "date") {
              correctedVal = new Date().toISOString().split("T")[0];
            } else {
              const optMatch = optionsList.find((o) => /immediate|0[\s_-]?days?|15[\s_-]?days?|<[\s_-]?1[\s_-]?month/i.test(o.text)) || optionsList[1];
              if (optMatch) correctedVal = optMatch.value || optMatch.text;
              else correctedVal = "Immediate Joiner";
            }
          }
        }
        // 3. Required text / number / boolean / select fields
        else if (warnText.includes("required") || warnText.includes("blank") || warnText.includes("empty") || warnText.includes("property")) {
          if (targetEl instanceof HTMLInputElement && targetEl.type === "date") {
            correctedVal = /dob|birth/i.test(combinedText) ? "2005-07-06" : new Date().toISOString().split("T")[0];
          } else if (targetEl instanceof HTMLSelectElement) {
            if (/\bmonths?\b/i.test(combinedText)) {
              correctedVal = "0 months";
            } else if (/\byears?\b/i.test(combinedText)) {
              correctedVal = "0";
            } else if (/notice|availability/i.test(combinedText)) {
              correctedVal = "Immediate Joiner";
            } else {
              const best = findBestOptionMatch(Array.from(targetEl.options), "0");
              if (best) correctedVal = best.matchedValue || best.matchedText;
              else correctedVal = "0";
            }
          } else if (/\bmonths?\b/i.test(combinedText) || /\byears?\b/i.test(combinedText) || (combinedText.includes("ctc") && !combinedText.includes("expect"))) {
            correctedVal = "0";
          } else if (combinedText.includes("expect") && combinedText.includes("ctc")) {
            correctedVal = "3";
          } else if (warn.fieldDescriptor.type === "number") {
            correctedVal = "0";
          } else {
            correctedVal = prevVal || "Yes";
          }
        }

        if (correctedVal !== null && (correctedVal !== prevVal || !prevVal)) {
          if (targetEl) {
            const fixDispatch = setNativeValue(targetEl, correctedVal);
            if (fixDispatch.success && fixDispatch.valueRegistered) {
              result.corrections.push({
                fieldId: warn.fieldId,
                rawLabel: warn.rawLabel,
                previousValue: warn.attemptedValue || "(empty)",
                correctedValue: correctedVal,
                warningMessage: warn.warningMessage,
              });
              filledValuesMap.set(warn.fieldId, correctedVal);
              if (!result.filledFieldIds.includes(warn.fieldId)) {
                result.filledFieldIds.push(warn.fieldId);
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn("Error during post-autofill validation self-correction:", err);
  }

  // Final pass: Re-apply Google Forms state cleanup across all filled fields
  try {
    for (const fieldId of result.filledFieldIds) {
      const fd = fields.find((f) => f.id === fieldId);
      if (fd) {
        const el = locateElement(fd, allDOMElements, fields);
        const val = filledValuesMap.get(fieldId);
        if (el && val !== undefined && val !== null) {
          applyGoogleFormsState(el, String(val));
        }
      }
    }
  } catch {}

  return result;
}
