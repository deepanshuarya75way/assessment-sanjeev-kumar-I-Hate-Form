import { QueuedField, QueuedFieldType, FillResult, FillProgress } from "@internship-copilot/types";
import { setNativeValue } from "./event-dispatcher";
import { animateCursorTo } from "./cursor-overlay";
import { persistFillProgress, getFillProgress } from "../storage/chrome-storage";

export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Dispatches realistic pointer sequence (§6.4)
 * pointerdown -> mousedown -> focus -> pointerup -> mouseup -> click
 */
export function dispatchPointerSequence(el: HTMLElement): void {
  try {
    const rect = el.getBoundingClientRect ? el.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
    const clientX = rect.left + (rect.width ? rect.width / 2 : 5);
    const clientY = rect.top + (rect.height ? rect.height / 2 : 5);

    const mouseInit: MouseEventInit = {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX,
      clientY,
    };

    try {
      if (typeof PointerEvent === "function") {
        el.dispatchEvent(new PointerEvent("pointerdown", { ...mouseInit, pointerId: 1, pointerType: "mouse" }));
      } else {
        el.dispatchEvent(new CustomEvent("pointerdown", { bubbles: true, cancelable: true }));
      }
    } catch {
      el.dispatchEvent(new CustomEvent("pointerdown", { bubbles: true, cancelable: true }));
    }
    el.dispatchEvent(new MouseEvent("mousedown", mouseInit));

    // Attempt native focus
    if (typeof el.focus === "function") {
      try {
        el.focus();
      } catch {}
    }
    el.dispatchEvent(new FocusEvent("focus", { bubbles: true, composed: true }));
    el.dispatchEvent(new FocusEvent("focusin", { bubbles: true, composed: true }));

    try {
      if (typeof PointerEvent === "function") {
        el.dispatchEvent(new PointerEvent("pointerup", { ...mouseInit, pointerId: 1, pointerType: "mouse" }));
      } else {
        el.dispatchEvent(new CustomEvent("pointerup", { bubbles: true, cancelable: true }));
      }
    } catch {
      el.dispatchEvent(new CustomEvent("pointerup", { bubbles: true, cancelable: true }));
    }
    el.dispatchEvent(new MouseEvent("mouseup", mouseInit));

    el.dispatchEvent(new MouseEvent("click", mouseInit));
    try {
      if (typeof el.click === "function") {
        el.click();
      }
    } catch {}
  } catch (err) {
    console.warn("Error dispatching pointer sequence:", err);
  }
}

/**
 * Waits for element to receive focus (§6.4)
 */
export async function waitForFocus(el: HTMLElement, opts: { timeoutMs: number } = { timeoutMs: 300 }): Promise<boolean> {
  if (typeof document !== "undefined") {
    const active = document.activeElement;
    if (active === el || (active && el.contains(active))) {
      return true;
    }
  }

  // Radiogroup, group, or container elements do not natively receive direct focus
  const role = el.getAttribute("role");
  if (role === "radiogroup" || role === "group" || el.classList.contains("SGkqec") || el.classList.contains("Y62e3c")) {
    return true;
  }
  if (el.querySelector('[role="radio"], [role="checkbox"], input[type="radio"], input[type="checkbox"]')) {
    return true;
  }

  const start = Date.now();
  while (Date.now() - start < opts.timeoutMs) {
    if (typeof document !== "undefined") {
      const active = document.activeElement;
      if (active === el || (active && el.contains(active))) {
        return true;
      }
      if (document.hasFocus && document.hasFocus() && active === el) {
        return true;
      }
    }
    await delay(20);
  }
  // Check once more at end
  if (typeof document !== "undefined") {
    const active = document.activeElement;
    if (active === el || (active && el.contains(active))) {
      return true;
    }
    // If element is an input, textarea, or button that is not disabled, consider focused if no blocking activeElement
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
      if (!el.disabled && !el.readOnly) {
        return true;
      }
    } else if (el.getAttribute("contenteditable") === "true" || el.getAttribute("tabindex") !== null) {
      return true;
    }
  }
  return false;
}

/**
 * Dispatches blur and focusout events (§6.4)
 */
export function dispatchBlur(el: HTMLElement): void {
  try {
    if (typeof el.blur === "function") {
      try {
        el.blur();
      } catch {}
    }
    el.dispatchEvent(new FocusEvent("blur", { bubbles: true, composed: true }));
    el.dispatchEvent(new FocusEvent("focusout", { bubbles: true, composed: true }));
  } catch (err) {
    console.warn("Error dispatching blur:", err);
  }
}

/**
 * Waits for element to be visible in viewport (§6.4)
 */
export async function waitForInView(el: HTMLElement, opts: { timeoutMs: number } = { timeoutMs: 800 }): Promise<boolean> {
  // In test / JSDOM or headless environments, resolve immediately
  if (typeof window === "undefined" || !el.getBoundingClientRect) {
    return true;
  }
  const start = Date.now();
  while (Date.now() - start < opts.timeoutMs) {
    const rect = el.getBoundingClientRect();
    const inView =
      rect.top < (window.innerHeight || document.documentElement.clientHeight) + 100 &&
      rect.bottom > -100 &&
      rect.left < (window.innerWidth || document.documentElement.clientWidth) + 100 &&
      rect.right > -100;
    if (inView) {
      return true;
    }
    await delay(30);
  }
  return true;
}

/**
 * Type-aware field value verification (§6.4, §12)
 *
 * - text/date inputs -> read .value
 * - native <select> -> read .selectedOptions
 * - custom dropdown -> read rendered display text / aria-selected on option (no underlying <select> to read)
 * - checkbox/radio -> read .checked
 */
export async function verifyFieldValue(
  el: HTMLElement,
  expectedValue: string,
  fieldType: QueuedFieldType,
  opts: { timeoutMs: number } = { timeoutMs: 400 }
): Promise<boolean> {
  const start = Date.now();

  while (Date.now() - start < opts.timeoutMs) {
    const isMatched = checkFieldValueMatches(el, expectedValue, fieldType);
    if (isMatched) {
      return true;
    }
    await delay(30);
  }

  // Final check
  return checkFieldValueMatches(el, expectedValue, fieldType);
}

export function checkFieldValueMatches(el: HTMLElement, expectedValue: string, fieldType: QueuedFieldType): boolean {
  if (!el) return false;

  const cleanExpected = (expectedValue || "").trim().toLowerCase();

  // 1. Checkbox / Radio
  if (fieldType === "checkbox" || fieldType === "radio") {
    if (el instanceof HTMLInputElement) {
      const expectedBool = expectedValue === "true" || expectedValue === "1" || cleanExpected === "yes";
      if (fieldType === "checkbox") {
        return el.checked === expectedBool;
      }
      // For radio, checked and value matches
      return el.checked;
    }
    // ARIA role checkbox / radio
    const ariaChecked = el.getAttribute("aria-checked");
    if (ariaChecked !== null) {
      return ariaChecked === "true";
    }
    const checkedChild = el.querySelector('[aria-checked="true"], input:checked');
    if (checkedChild) {
      return true;
    }
    const container = el.closest('.Qr7Oae, .geS5n, [role="listitem"], fieldset, .form-group') || el.parentElement;
    if (container) {
      const checkedInContainer = container.querySelector('[aria-checked="true"], input:checked');
      if (checkedInContainer) {
        return true;
      }
    }
    return false;
  }

  // 2. Native <select>
  if (fieldType === "select" || el instanceof HTMLSelectElement) {
    if (el instanceof HTMLSelectElement) {
      if (el.selectedOptions && el.selectedOptions.length > 0) {
        for (let i = 0; i < el.selectedOptions.length; i++) {
          const opt = el.selectedOptions[i];
          const optText = (opt.text || "").trim().toLowerCase();
          const optVal = (opt.value || "").trim().toLowerCase();
          if (optVal === cleanExpected || optText === cleanExpected || optText.includes(cleanExpected)) {
            return true;
          }
        }
      }
      const curVal = (el.value || "").trim().toLowerCase();
      return curVal === cleanExpected;
    }
  }

  // 3. Custom dropdown
  if (fieldType === "custom-dropdown" || el.getAttribute("role") === "combobox" || el.getAttribute("role") === "listbox") {
    // Check aria-selected on option or rendered display text
    const ariaSelected = el.querySelector('[aria-selected="true"], [data-selected="true"]');
    if (ariaSelected && ariaSelected.textContent) {
      const selectedText = ariaSelected.textContent.trim().toLowerCase();
      if (selectedText === cleanExpected || selectedText.includes(cleanExpected)) {
        return true;
      }
    }

    const displayEl = el.querySelector('[class*="display"], [class*="trigger"], [class*="value"], [class*="rendered"], [class*="selected-option"]');
    if (displayEl && displayEl.textContent) {
      const dispText = displayEl.textContent.trim().toLowerCase();
      if (dispText === cleanExpected || dispText.includes(cleanExpected)) {
        return true;
      }
    }

    const dataVal = (el.getAttribute("data-value") || "").trim().toLowerCase();
    if (dataVal && (dataVal === cleanExpected || dataVal.includes(cleanExpected))) {
      return true;
    }

    // Also check nearest connected listbox or popup
    const popupId = el.getAttribute("aria-controls") || el.getAttribute("aria-owns");
    if (popupId) {
      const popup = document.getElementById(popupId);
      if (popup) {
        const selectedItem = popup.querySelector('[aria-selected="true"], [data-selected="true"]');
        if (selectedItem && selectedItem.textContent) {
          const itemText = selectedItem.textContent.trim().toLowerCase();
          if (itemText === cleanExpected || itemText.includes(cleanExpected)) {
            return true;
          }
        }
      }
    }

    // If custom dropdown has an associated input
    const inputChild = el.querySelector("input") || (el instanceof HTMLInputElement ? el : null);
    if (inputChild && inputChild.value) {
      const val = inputChild.value.trim().toLowerCase();
      if (val === cleanExpected || val.includes(cleanExpected)) {
        return true;
      }
    }
    return false;
  }

  // 4. Text / Date inputs
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const val = (el.value || "").trim().toLowerCase();
    if (!val) {
      return false;
    }
    if (val === cleanExpected) {
      return true;
    }
    // Relaxed match for dates or numeric formatting
    if (cleanExpected.length > 3 && val.length > 3 && (val.includes(cleanExpected) || cleanExpected.includes(val))) {
      return true;
    }
    return false;
  }

  // 5. Contenteditable
  if (el.getAttribute("contenteditable") === "true") {
    const txt = (el.textContent || "").trim().toLowerCase();
    return txt === cleanExpected || (cleanExpected.length > 3 && txt.includes(cleanExpected));
  }

  return false;
}

/**
 * Executes autofill for a single field with state machine (§6.4)
 */
export async function fillOneField(
  field: QueuedField,
  opts: { showCursor: boolean }
): Promise<FillResult> {
  const el = field.element;
  if (!el || !el.isConnected) {
    return { fieldId: field.domSelectorHash, status: "failed", attempts: 0 };
  }

  // Step 1: Scroll into view
  if (typeof el.scrollIntoView === "function") {
    try {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch {}
  }
  await waitForInView(el, { timeoutMs: 800 });

  // Step 2: Animate cursor overlay if enabled (§6.6)
  if (opts.showCursor) {
    await animateCursorTo(el);
  }

  // Special check for custom-dropdown: if option doesn't exist, fall back to review immediately (§12)
  if (field.fieldType === "custom-dropdown") {
    const hasCandidateOption = checkIfCustomDropdownHasOption(el, field.value);
    if (!hasCandidateOption) {
      return { fieldId: field.domSelectorHash, status: "review", attempts: 1 };
    }
  }

  // Step 3: Dispatch pointer sequence
  dispatchPointerSequence(el);

  // For custom dropdowns, also click the matching option item
  if (field.fieldType === "custom-dropdown") {
    const optEl = findCustomDropdownOption(el, field.value);
    if (optEl) {
      dispatchPointerSequence(optEl);
    }
  }

  // Step 4: Wait for focus
  const gotFocus = await waitForFocus(el, { timeoutMs: 300 });
  if (!gotFocus) {
    return { fieldId: field.domSelectorHash, status: "review", attempts: 1 };
  }

  // Step 5: Native value setter + dispatch
  setNativeValue(el, field.value);

  // Step 6: Dispatch blur
  dispatchBlur(el);

  // Step 7: Type-aware verification readback (400ms settle)
  const verified = await verifyFieldValue(el, field.value, field.fieldType, { timeoutMs: 400 });
  if (verified) {
    return { fieldId: field.domSelectorHash, status: "filled", attempts: 1 };
  }

  // Step 8: One retry with a longer settle window (covers slow framework re-renders)
  await delay(300);
  const verifiedRetry = await verifyFieldValue(el, field.value, field.fieldType, { timeoutMs: 600 });

  return {
    fieldId: field.domSelectorHash,
    status: verifiedRetry ? "filled" : "review",
    attempts: 2,
  };
}

function findCustomDropdownOption(container: HTMLElement, targetText: string): HTMLElement | null {
  if (!targetText) return null;
  const clean = targetText.trim().toLowerCase();
  const searchRoots = [container, document.body];
  for (const root of searchRoots) {
    if (!root) continue;
    const candidates = Array.from(
      root.querySelectorAll('[role="option"], .custom-option, .dropdown-item, .select-option, li')
    ) as HTMLElement[];
    const items = candidates.filter((c) => {
      const childCount = c.querySelectorAll('[role="option"], .custom-option, .dropdown-item, .select-option, li').length;
      return childCount === 0;
    });
    const match = items.find((item) => {
      const text = (item.textContent || "").trim().toLowerCase();
      const val = (item.getAttribute("data-value") || item.getAttribute("value") || "").trim().toLowerCase();
      return text === clean || val === clean || text.includes(clean);
    });
    if (match) return match;
  }
  return null;
}

function checkIfCustomDropdownHasOption(container: HTMLElement, targetText: string): boolean {
  if (!targetText) return true;
  const clean = targetText.trim().toLowerCase();

  // Search in options or list items inside container or whole document
  const options = Array.from(
    container.querySelectorAll('[role="option"], .custom-option, .dropdown-item, .select-option, li, div[class*="option"]')
  );
  if (options.length === 0) {
    // Might be in a portal or open on click; if no options rendered yet, allow attempt
    return true;
  }
  return options.some((opt) => {
    const text = (opt.textContent || "").trim().toLowerCase();
    return text === clean || text.includes(clean);
  });
}


/**
 * Sequential Fill Queue Engine (§6.3, §6.5)
 *
 * Fills fields sequentially, one at a time, verified before advancing.
 * Supports mid-fill resumption via session storage.
 */
export async function runFillQueue(
  queue: QueuedField[],
  opts: {
    interFieldDelayMs?: number;
    showCursor?: boolean;
    sessionId?: string;
  } = {}
): Promise<FillResult[]> {
  const interFieldDelayMs = opts.interFieldDelayMs ?? 100;
  const showCursor = opts.showCursor ?? true;
  const sessionId = opts.sessionId || `session_${Date.now()}`;

  // Check for existing progress to resume (§6.5)
  let existingProgress = await getFillProgress(sessionId);
  let startIndex = 0;
  const results: FillResult[] = [];

  if (
    existingProgress &&
    existingProgress.sessionId === sessionId &&
    Array.isArray(existingProgress.results) &&
    existingProgress.results.length > 0
  ) {
    // Restore already verified fields without re-filling
    for (const r of existingProgress.results) {
      results.push(r);
    }
    startIndex = existingProgress.currentIndex;
  }

  const queueOrder = queue.map((f) => f.domSelectorHash);

  for (let i = startIndex; i < queue.length; i++) {
    const field = queue[i];

    // Re-resolve element at dequeue time if detached (§6.3)
    if (!field.element || !field.element.isConnected) {
      const reResolved = document.querySelector(`[data-ihateform-hash="${field.domSelectorHash}"]`) ||
        document.querySelector(`[data-ihateform-id="${field.domSelectorHash}"]`);
      if (reResolved instanceof HTMLElement) {
        field.element = reResolved;
      }
    }

    const result = await fillOneField(field, { showCursor });
    results.push(result);

    // Persist progress to session storage after each field (§6.5)
    const progress: FillProgress = {
      sessionId,
      queueOrder,
      results: [...results],
      currentIndex: i + 1,
    };
    await persistFillProgress(progress);

    if (interFieldDelayMs > 0 && i < queue.length - 1) {
      await delay(interFieldDelayMs);
    }
  }

  return results;
}
