import { FormSelectOption } from "@internship-copilot/types";

/**
 * Combobox Resolver (v3.0 §17.2)
 * Handles custom combobox widgets (React-select, Headless UI, MUI Autocomplete, Workday)
 * Resolves option lists across document portals (aria-owns / aria-controls)
 * and programmatically triggers mount/unmount when lazy-loaded.
 */

export interface ComboboxResolutionResult {
  isCombobox: boolean;
  options: FormSelectOption[];
  rawOptions: string[];
  multiple: boolean;
  listboxId?: string;
}

/**
 * Detects if an element is a custom combobox widget
 */
export function isCustomCombobox(element: HTMLElement): boolean {
  if (!element) return false;

  const role = element.getAttribute("role");
  if (role === "combobox") return true;

  if (element.getAttribute("aria-haspopup") === "listbox") return true;

  // React-Select, Headless UI, MUI Autocomplete, Workday heuristics
  const className = (element.className || "").toString().toLowerCase();
  if (
    className.includes("react-select") ||
    className.includes("select__control") ||
    className.includes("MuiAutocomplete") ||
    className.includes("combobox")
  ) {
    return true;
  }

  // Check child or parent combobox
  if (element.querySelector('[role="combobox"]')) return true;

  return false;
}

/**
 * Attempts to locate the listbox container referenced by aria-controls or aria-owns
 * anywhere in the document (including body-level portals).
 */
export function findLinkedPortalListbox(comboboxEl: HTMLElement, doc: Document = document): HTMLElement | null {
  const targetInput = (comboboxEl.querySelector('input, [role="combobox"]') || comboboxEl) as HTMLElement;

  const ariaControls = targetInput.getAttribute("aria-controls") || comboboxEl.getAttribute("aria-controls");
  const ariaOwns = targetInput.getAttribute("aria-owns") || comboboxEl.getAttribute("aria-owns");

  const targetIds = [ariaControls, ariaOwns].filter(Boolean) as string[];

  for (const id of targetIds) {
    // Escape CSS selector if needed
    try {
      const linked = doc.getElementById(id);
      if (linked) return linked;
    } catch {}
  }

  // Check local subtree
  const localListbox = comboboxEl.querySelector('[role="listbox"]') as HTMLElement | null;
  if (localListbox) return localListbox;

  return null;
}

/**
 * Extracts option items from a listbox container element
 */
export function extractOptionsFromListbox(listboxEl: HTMLElement): { options: FormSelectOption[]; rawOptions: string[] } {
  const optionEls = listboxEl.querySelectorAll(
    '[role="option"], li[id*="option"], div[id*="option"], .select__option, [data-value]'
  );

  const options: FormSelectOption[] = [];
  const rawOptions: string[] = [];

  optionEls.forEach((el) => {
    const text = (el.textContent || "").trim();
    if (!text) return;

    const val =
      el.getAttribute("data-value") ||
      el.getAttribute("value") ||
      el.getAttribute("aria-label") ||
      text;

    options.push({ value: val, label: text });
    rawOptions.push(text);
  });

  return { options, rawOptions };
}

/**
 * Resolves options for a custom combobox widget.
 * If the options are not mounted in the DOM, programmatically dispatches
 * mousedown/click to open the dropdown, reads the mounted portal listbox,
 * and restores closed state.
 */
export function resolveCustomCombobox(comboboxEl: HTMLElement, doc: Document = document): ComboboxResolutionResult {
  if (!isCustomCombobox(comboboxEl)) {
    return { isCombobox: false, options: [], rawOptions: [], multiple: false };
  }

  const targetInput = (comboboxEl.querySelector('input, [role="combobox"]') || comboboxEl) as HTMLElement;
  const isMultiple =
    comboboxEl.getAttribute("aria-multiselectable") === "true" ||
    targetInput.getAttribute("aria-multiselectable") === "true" ||
    Boolean(comboboxEl.querySelector('.select__multi-value, [class*="chip"], [class*="tag"]'));

  let listbox = findLinkedPortalListbox(comboboxEl, doc);

  // If not found or empty, attempt programmatic open
  if (!listbox || listbox.children.length === 0) {
    const wasExpanded = targetInput.getAttribute("aria-expanded") === "true";

    if (!wasExpanded) {
      try {
        targetInput.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
        targetInput.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        targetInput.focus();
      } catch {}

      // Re-query listbox after event dispatch
      listbox = findLinkedPortalListbox(comboboxEl, doc);
      if (!listbox) {
        // Find any newly visible or mounted listbox in body
        const allListboxes = doc.querySelectorAll('[role="listbox"]');
        if (allListboxes.length > 0) {
          listbox = allListboxes[allListboxes.length - 1] as HTMLElement;
        }
      }

      // Close it back to prevent disruptive UI layout shift
      try {
        targetInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
        targetInput.blur();
      } catch {}
    }
  }

  if (listbox) {
    const { options, rawOptions } = extractOptionsFromListbox(listbox);
    return {
      isCombobox: true,
      options,
      rawOptions,
      multiple: isMultiple,
      listboxId: listbox.id || undefined,
    };
  }

  return {
    isCombobox: true,
    options: [],
    rawOptions: [],
    multiple: isMultiple,
  };
}
