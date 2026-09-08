import { findBestOptionMatch } from "./dropdown-matcher";

export interface DispatchResult {
  success: boolean;
  valueRegistered: boolean;
  errorCode?: "FRAMEWORK_BLOCKED" | "CSP_BLOCKED" | "TYPE_MISMATCH";
}

export function injectGoogleFormsHelperStyles() {
  try {
    const styleId = "__ihateform_gform_styles__";
    if (typeof document !== "undefined" && !document.getElementById(styleId)) {
      const styleEl = document.createElement("style");
      styleEl.id = styleId;
      styleEl.textContent = `
        .CDNmEc .ndJi5d,
        .CDNmEc .wGQFbe,
        .CDNmEc div[class*="ndJi5d"],
        .CDNmEc [data-placeholder],
        .CDNmEc span.M7eMe + div,
        .Xb9hP input.whsOnd:not([value=""]) + .ndJi5d,
        .Xb9hP textarea.KHxj8b:not([value=""]) + .ndJi5d,
        .Xb9hP input.whsOnd:not(:placeholder-shown) + .ndJi5d,
        .Xb9hP textarea.KHxj8b:not(:placeholder-shown) + .ndJi5d,
        .rFrNMe.CDNmEc .ndJi5d {
          display: none !important;
          opacity: 0 !important;
          visibility: hidden !important;
          pointer-events: none !important;
        }
        .CDNmEc .RBEWZc,
        .CDNmEc div[jsname="ty0drd"],
        .CDNmEc [role="alert"],
        .CDNmEc .LXRPh {
          display: none !important;
        }
        .CDNmEc.T2vT6b,
        .CDNmEc .T2vT6b,
        .CDNmEc.Qr7Oae,
        .CDNmEc .Qr7Oae {
          border-color: transparent !important;
        }
        .CDNmEc .whsOnd,
        .CDNmEc .KHxj8b {
          border-bottom-color: #7248b9 !important;
        }
      `;
      try {
        const targetParent = document.head || document.documentElement;
        if (targetParent) {
          targetParent.appendChild(styleEl);
        }
      } catch {}
    }
  } catch {}
}

export function applyGoogleFormsState(element: HTMLElement, expectedValue: string) {
  if (!expectedValue) return;

  try {
    injectGoogleFormsHelperStyles();

    // 1. Mark all ancestor Google Form containers with CDNmEc (content present) and k3XOCb
    let curr: HTMLElement | null = element;
    while (curr && curr !== document.body) {
      try {
        curr.classList.add("CDNmEc", "k3XOCb");
        curr.classList.remove("T2vT6b", "has-error", "is-invalid", "N0PJr");
      } catch {}
      if (
        curr.classList.contains("Qr7Oae") ||
        curr.classList.contains("freebirdFormviewerViewNumberedItemContainer") ||
        curr.classList.contains("freebirdFormviewerViewFormCard")
      ) {
        break;
      }
      curr = curr.parentElement;
    }

    // 2. Hide Google Forms placeholder text element ("Your answer" / .ndJi5d / .wGQFbe)
    const questionCard =
      element.closest(
        '.Qr7Oae, [role="listitem"], .freebirdFormviewerViewNumberedItemContainer, .freebirdFormviewerViewFormCard, .geS5n'
      ) || element.parentElement;

    if (questionCard) {
      questionCard.classList.remove("T2vT6b", "has-error", "is-invalid", "N0PJr");
      questionCard.classList.add("CDNmEc", "k3XOCb");
      const errNodes = questionCard.querySelectorAll(".T2vT6b, .has-error, .is-invalid, .N0PJr");
      errNodes.forEach((n) => {
        n.classList.remove("T2vT6b", "has-error", "is-invalid", "N0PJr");
        n.classList.add("CDNmEc", "k3XOCb");
      });

      // Target Google Forms placeholder elements
      const placeholderEls = questionCard.querySelectorAll(
        '.ndJi5d, .wGQFbe, div[class*="ndJi5d"], div[class*="placeholder"], span[class*="placeholder"], [data-placeholder]'
      );
      placeholderEls.forEach((p) => {
        try {
          (p as HTMLElement).style.display = "none";
          (p as HTMLElement).style.visibility = "hidden";
          (p as HTMLElement).style.opacity = "0";
          (p as HTMLElement).style.pointerEvents = "none";
          p.setAttribute("aria-hidden", "true");
        } catch {}
      });

      // Target any node containing "Your answer" directly
      const allDivs = questionCard.querySelectorAll("div, span, p");
      allDivs.forEach((d) => {
        try {
          if (d !== element && d.childElementCount === 0 && d.textContent?.trim().toLowerCase() === "your answer") {
            (d as HTMLElement).style.display = "none";
            (d as HTMLElement).style.visibility = "hidden";
            (d as HTMLElement).style.opacity = "0";
            (d as HTMLElement).style.pointerEvents = "none";
            d.setAttribute("aria-hidden", "true");
          }
        } catch {}
      });

      // Remove Google Form error messages ("This is a required question")
      const errorAlerts = questionCard.querySelectorAll(
        '.RBEWZc, .LXRPh, [role="alert"], div[jsname="ty0drd"]'
      );
      errorAlerts.forEach((ea) => {
        try {
          const txt = (ea.textContent || "").toLowerCase();
          if (txt.includes("required") || txt.includes("must") || txt.includes("valid") || ea.getAttribute("role") === "alert" || ea.classList.contains("RBEWZc")) {
            (ea as HTMLElement).style.display = "none";
          }
        } catch {}
      });
    }

    try {
      element.classList.remove("T2vT6b", "is-invalid", "invalid", "error");
      element.setAttribute("aria-invalid", "false");
      element.setAttribute("badinput", "false");
      element.setAttribute("data-initial-value", expectedValue);
      element.setAttribute("data-value", expectedValue);
    } catch {}
  } catch {}
}

/**
 * Sets input/textarea/select values by bypassing React/Vue synthetic wrapper overrides
 * and dispatching full bubbling and composed event chains (§8.6).
 */
export function setNativeValue(
  element: HTMLElement,
  value: string | boolean
): DispatchResult {
  try {
    let expectedValue = "";

    let selectMatched = true;

    if (element instanceof HTMLInputElement) {
      if (element.type === "checkbox" || element.type === "radio") {
        const booleanVal =
          typeof value === "boolean" ? value : value === "true" || value === "1";
        const descriptor = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "checked"
        );
        if (descriptor && descriptor.set) {
          descriptor.set.call(element, booleanVal);
        } else {
          element.checked = booleanVal;
        }
      } else {
        expectedValue = String(value);

        // Date input normalization (HTML5 type="date" strictly requires YYYY-MM-DD format)
        if (element.type === "date" && expectedValue) {
          const raw = expectedValue.trim().toLowerCase();
          const todayStr = new Date().toISOString().split("T")[0]; // "YYYY-MM-DD"
          if (
            raw === "immediate" ||
            raw === "immediate joiner" ||
            raw === "today" ||
            raw === "now" ||
            raw === "asap" ||
            raw === "available" ||
            raw.includes("immediate")
          ) {
            expectedValue = todayStr;
          } else {
            const parts = expectedValue.split(/[/.-]/);
            if (parts.length === 3) {
              if (parts[2].length === 4) {
                // DD/MM/YYYY or MM/DD/YYYY -> YYYY-MM-DD
                expectedValue = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
              } else if (parts[0].length === 4) {
                // YYYY/MM/DD -> YYYY-MM-DD
                expectedValue = `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
              }
            } else if (!/^\d{4}-\d{2}-\d{2}$/.test(expectedValue)) {
              const parsed = new Date(expectedValue);
              if (!isNaN(parsed.getTime())) {
                expectedValue = parsed.toISOString().split("T")[0];
              } else {
                expectedValue = todayStr;
              }
            }
          }
          if (!/^\d{4}-\d{2}-\d{2}$/.test(expectedValue)) {
            expectedValue = todayStr;
          }
        }

        // Clear any previous text value first to prevent string concatenation
        try {
          element.value = "";
          const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
          if (desc && desc.set) {
            desc.set.call(element, "");
          }
        } catch {}

        // Simulate user click, focus & selection on the input element
        try {
          element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, composed: true }));
          element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, composed: true }));
          element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, composed: true }));
          element.focus();
          if (typeof element.select === "function") {
            element.select();
          }
        } catch {}

        // Try document.execCommand FIRST (simulates trusted browser typing for Google Forms Wiz, React, etc.)
        try {
          if (typeof document !== "undefined" && typeof document.execCommand === "function") {
            document.execCommand("selectAll", false, undefined);
            document.execCommand("insertText", false, expectedValue);
          }
        } catch {}

        // If execCommand did not set or fully set the value, apply native descriptor setter
        if (element.value !== expectedValue) {
          const descriptor = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            "value"
          );
          if (descriptor && descriptor.set) {
            descriptor.set.call(element, expectedValue);
          } else {
            element.value = expectedValue;
          }
        }

        try {
          element.setAttribute("value", expectedValue);
          element.setAttribute("data-initial-value", expectedValue);
          element.setAttribute("data-value", expectedValue);
          element.setAttribute("aria-invalid", "false");
          element.setAttribute("badinput", "false");
          (element as any).defaultValue = expectedValue;
        } catch {}

        // Apply Google Forms state (hide placeholder, remove error, add CDNmEc)
        applyGoogleFormsState(element, expectedValue);

        // Notify React's synthetic event system tracker if present
        const tracker = (element as any)._valueTracker;
        if (tracker && typeof tracker.setValue === "function") {
          tracker.setValue("");
        }

        // Invoke React internal onChange/onInput handler if present on fiber
        try {
          const reactKey = Object.keys(element).find(
            (k) => k.startsWith("__reactProps$") || k.startsWith("__reactEvents$") || k.startsWith("__reactFiber$")
          );
          if (reactKey) {
            const reactProps = (element as any)[reactKey];
            if (reactProps) {
              if (typeof reactProps.onChange === "function") {
                reactProps.onChange({ target: element, currentTarget: element, type: "change", bubbles: true });
              }
              if (typeof reactProps.onInput === "function") {
                reactProps.onInput({ target: element, currentTarget: element, type: "input", bubbles: true });
              }
            }
          }
        } catch {}

        // Check for combobox / custom dropdown parent container and sibling elements
        const parentContainer = element.closest(
          'div[class*="select"], div[class*="dropdown"], div[class*="combobox"], .form-group, .field-wrapper, .custom-select, div[class*="input"], div[class*="field"], div[class*="form-group"]'
        );
        if (parentContainer) {
          const hiddenSelect = parentContainer.querySelector("select");
          if (hiddenSelect && (hiddenSelect as any) !== element) {
            setNativeValue(hiddenSelect, expectedValue);
          }
          const customTextSpan = parentContainer.querySelector(
            '.select-value, .dropdown-text, .selected-value, .filter-option-inner-inner, span[class*="label"], span[class*="text"], span[class*="value"], .selected-option'
          );
          if (customTextSpan) {
            customTextSpan.textContent = expectedValue.includes("months") ? expectedValue : (expectedValue === "0" ? "0 months" : expectedValue);
          }
        }
      }
    } else if (element instanceof HTMLTextAreaElement) {
      expectedValue = String(value);

      // Simulate user click & focus on the textarea element
      try {
        element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, composed: true }));
        element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, composed: true }));
        element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, composed: true }));
        element.focus();
        if (typeof element.select === "function") {
          element.select();
        }
      } catch {}

      // Try document.execCommand first to simulate real keyboard text insertion
      try {
        if (typeof document !== "undefined" && typeof document.execCommand === "function") {
          document.execCommand("selectAll", false, undefined);
          document.execCommand("insertText", false, expectedValue);
        }
      } catch {}

      if (element.value !== expectedValue) {
        const descriptor = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype,
          "value"
        );
        if (descriptor && descriptor.set) {
          descriptor.set.call(element, expectedValue);
        } else {
          element.value = expectedValue;
        }
      }

      try {
        element.setAttribute("value", expectedValue);
        element.setAttribute("data-initial-value", expectedValue);
        element.setAttribute("data-value", expectedValue);
        element.setAttribute("aria-invalid", "false");
        element.setAttribute("badinput", "false");
        (element as any).defaultValue = expectedValue;
      } catch {}

      // Auto-grow textarea height for Google Forms & dynamic textareas
      try {
        element.style.height = "auto";
        if (element.scrollHeight) {
          element.style.height = `${element.scrollHeight}px`;
        }
      } catch {}

      // Apply Google Forms state (hide placeholder, remove error, add CDNmEc)
      applyGoogleFormsState(element, expectedValue);

      // Notify React's synthetic event system tracker if present
      const tracker = (element as any)._valueTracker;
      if (tracker && typeof tracker.setValue === "function") {
        tracker.setValue("");
      }
    } else if (
      element.getAttribute("role") === "radiogroup" ||
      element.getAttribute("role") === "group" ||
      element.getAttribute("role") === "radio" ||
      element.getAttribute("role") === "checkbox" ||
      element.classList.contains("SGkqec") ||
      element.classList.contains("Y62e3c") ||
      Boolean(element.querySelector('[role="radio"], [role="checkbox"], input[type="radio"], input[type="checkbox"]'))
    ) {
      const targetValues = Array.isArray(value)
        ? value.map(String)
        : typeof value === "string"
        ? value.split(/[,;|\n]/).map((s) => s.trim()).filter(Boolean)
        : [String(value)];

      const questionCard = element.closest('.Qr7Oae, .geS5n, [role="listitem"], fieldset, .form-group') || element;
      const roleElements = Array.from(
        questionCard.querySelectorAll(
          '[role="radio"], [role="checkbox"], input[type="radio"], input[type="checkbox"]'
        )
      );
      const allOptionElements = roleElements.length > 0
        ? roleElements
        : Array.from(
            questionCard.querySelectorAll(
              '.docssharedWizTogglelabeledContainer, .nWQGrd, .e3Duub, .appsMaterialWizToggleRadiogroupEl, .appsMaterialWizToggleCheckboxEl'
            )
          );

      for (const targetVal of targetValues) {
        const cleanTarget = targetVal.toLowerCase().trim();
        if (!cleanTarget) continue;

        const matchingOpt = allOptionElements.find((opt) => {
          const optVal = (
            opt.getAttribute("data-value") ||
            opt.getAttribute("data-answer-value") ||
            opt.getAttribute("value") ||
            opt.getAttribute("aria-label") ||
            ""
          ).toLowerCase().trim();

          const labelParent = opt.closest(".docssharedWizTogglelabeledContainer, label, .nWQGrd, .e3Duub, .appsMaterialWizToggleRadiogroupEl, .appsMaterialWizToggleCheckboxEl") || opt.parentElement;
          const labelText = (
            labelParent?.querySelector(".aDTYNe, .M7eMe, span.M7eMe, span, label, p")?.textContent ||
            labelParent?.textContent ||
            ""
          ).toLowerCase().trim();

          const cleanOpt = optVal || labelText;
          if (!cleanOpt) return false;

          // 1. Exact match
          if (cleanOpt === cleanTarget || optVal === cleanTarget || labelText === cleanTarget) {
            return true;
          }

          // 2. Normalized alphanumeric match (e.g. "3rd year" === "3rd year", "technology / it" === "technology / it")
          const normOpt = cleanOpt.replace(/[^\w]/g, "");
          const normTarget = cleanTarget.replace(/[^\w]/g, "");
          if (normOpt && normTarget && normOpt === normTarget) {
            return true;
          }

          // 3. Substring match only if length >= 4 and starts/ends with target
          if (normOpt.length >= 4 && normTarget.length >= 4) {
            if (normOpt.startsWith(normTarget) || normTarget.startsWith(normOpt)) {
              return true;
            }
          }

          return false;
        });

        if (matchingOpt instanceof HTMLElement) {
          const actualControl = (matchingOpt.matches('[role="radio"], [role="checkbox"], input')
            ? matchingOpt
            : matchingOpt.querySelector('[role="radio"], [role="checkbox"], input')) as HTMLElement || matchingOpt;

          const toggleContainer = matchingOpt.closest(".docssharedWizTogglelabeledContainer, label") as HTMLElement | null;

          try {
            actualControl.click();
          } catch {}

          if (toggleContainer && toggleContainer !== actualControl) {
            try {
              toggleContainer.click();
            } catch {}
          }

          actualControl.setAttribute("aria-checked", "true");
          matchingOpt.setAttribute("aria-checked", "true");
          if (actualControl instanceof HTMLInputElement) {
            actualControl.checked = true;
          }

          try {
            actualControl.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
            actualControl.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
            actualControl.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
            actualControl.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
            actualControl.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
          } catch {}

          if (toggleContainer) {
            try {
              toggleContainer.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
              toggleContainer.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
            } catch {}
          }
        }
      }

      applyGoogleFormsState(element, String(value));
      return {
        success: true,
        valueRegistered: true,
      };
    } else if (element instanceof HTMLSelectElement) {
      const matchResult = findBestOptionMatch(
        Array.from(element.options),
        value
      );

      if (matchResult && matchResult.matchedIndex >= 0) {
        const targetIndex = matchResult.matchedIndex;
        const matchedOption = element.options[targetIndex];

        for (let i = 0; i < element.options.length; i++) {
          const isTarget = i === targetIndex;
          element.options[i].selected = isTarget;
          if (isTarget) {
            element.options[i].setAttribute("selected", "selected");
          } else {
            element.options[i].removeAttribute("selected");
          }
        }

        element.selectedIndex = targetIndex;
        expectedValue = matchedOption ? (matchedOption.value !== undefined && matchedOption.value !== "" ? matchedOption.value : matchedOption.text) : matchResult.matchedValue;

        const descriptor = Object.getOwnPropertyDescriptor(
          window.HTMLSelectElement.prototype,
          "value"
        );
        if (descriptor && descriptor.set && expectedValue) {
          try {
            descriptor.set.call(element, expectedValue);
          } catch {}
        } else if (expectedValue) {
          element.value = expectedValue;
        }

        // Ensure selectedIndex didn't get reset
        element.selectedIndex = targetIndex;
        if (matchedOption) {
          matchedOption.selected = true;
        }

        // Notify React's select value tracker
        const tracker = (element as any)._valueTracker;
        if (tracker && typeof tracker.setValue === "function") {
          tracker.setValue("");
        }

        // Invoke React internal onChange on select fiber
        try {
          const reactKey = Object.keys(element).find(
            (k) => k.startsWith("__reactProps$") || k.startsWith("__reactEvents$") || k.startsWith("__reactFiber$")
          );
          if (reactKey) {
            const reactProps = (element as any)[reactKey];
            if (reactProps) {
              if (typeof reactProps.onChange === "function") {
                reactProps.onChange({ target: element, currentTarget: element, type: "change", bubbles: true });
              }
            }
          }
        } catch {}
      } else {
        selectMatched = false;
        expectedValue = String(value);
      }
    }

    // Dispatch full bubbling & composed event pipeline
    try {
      element.dispatchEvent(new FocusEvent("focusin", { bubbles: true, composed: true }));
      element.dispatchEvent(new FocusEvent("focus", { bubbles: true, composed: true }));

      if (element instanceof HTMLSelectElement) {
        // Standard change, input and mouse events for select elements
        element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
        element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
        element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        element.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
        element.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
        element.dispatchEvent(new CustomEvent("ngModelChange", { bubbles: true, detail: expectedValue }));

        const selOption = element.options[element.selectedIndex];
        if (selOption) {
          try {
            selOption.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
            selOption.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
            selOption.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
          } catch {}
        }

        // Update custom dropdown wrappers
        const parentContainer = element.closest(
          'div[class*="select"], div[class*="dropdown"], div[class*="combobox"], .form-group, .field-wrapper, .custom-select, div[class*="input"], div[class*="field"], div[class*="form-group"]'
        );
        if (parentContainer) {
          parentContainer.dispatchEvent(new Event("input", { bubbles: true }));
          parentContainer.dispatchEvent(new Event("change", { bubbles: true }));
          const customTextSpan = parentContainer.querySelector(
            '.select-value, .dropdown-text, .selected-value, .filter-option-inner-inner, span[class*="label"], span[class*="text"], span[class*="value"], .selected-option'
          );
          if (customTextSpan && selOption) {
            customTextSpan.textContent = selOption.text;
          }
          const siblingInput = parentContainer.querySelector("input");
          if (siblingInput && (siblingInput as any) !== element) {
            try {
              const inputDesc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
              if (inputDesc && inputDesc.set) {
                inputDesc.set.call(siblingInput, selOption?.text || expectedValue);
              } else {
                siblingInput.value = selOption?.text || expectedValue;
              }
              siblingInput.dispatchEvent(new Event("input", { bubbles: true }));
              siblingInput.dispatchEvent(new Event("change", { bubbles: true }));
            } catch {}
          }
        }
      } else {
        // Dispatch Keyboard & Input events for input/textarea (including space key simulation)
        try {
          const keyChar = expectedValue ? expectedValue[0] : " ";
          element.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: keyChar }));
          element.dispatchEvent(new KeyboardEvent("keypress", { bubbles: true, cancelable: true, key: keyChar }));
          element.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: " ", code: "Space", keyCode: 32, which: 32 }));
          element.dispatchEvent(new KeyboardEvent("keypress", { bubbles: true, cancelable: true, key: " ", code: "Space", keyCode: 32, which: 32 }));
        } catch {}

        try {
          if (typeof InputEvent === "function") {
            element.dispatchEvent(
              new InputEvent("beforeinput", {
                bubbles: true,
                composed: true,
                cancelable: true,
                data: expectedValue,
                inputType: "insertText",
              })
            );
          }
        } catch {}

        const inputEvent = typeof InputEvent === "function"
          ? new InputEvent("input", {
              bubbles: true,
              composed: true,
              cancelable: true,
              data: expectedValue,
              inputType: "insertText",
            })
          : new Event("input", { bubbles: true, composed: true });

        element.dispatchEvent(inputEvent);

        try {
          if (typeof CompositionEvent === "function") {
            element.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: expectedValue }));
          }
        } catch {}

        try {
          const keyChar = expectedValue ? expectedValue[0] : " ";
          element.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, cancelable: true, key: " ", code: "Space", keyCode: 32, which: 32 }));
          element.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, cancelable: true, key: keyChar }));
        } catch {}

        element.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
        element.dispatchEvent(new CustomEvent("ngModelChange", { bubbles: true, detail: expectedValue }));

        // Try clicking matching dropdown option item in DOM if popup is rendered
        const parentContainer = element.closest(
          'div[class*="select"], div[class*="dropdown"], div[class*="combobox"], .form-group, .field-wrapper, .custom-select, div[class*="input"], div[class*="field"], div[class*="form-group"]'
        );
        if (parentContainer) {
          const listItems = Array.from(
            document.querySelectorAll('[role="option"], .dropdown-item, .select-option, li[data-value], div[class*="option"]')
          ) as HTMLElement[];
          const targetOptText = expectedValue.includes("months") ? expectedValue : (expectedValue === "0" ? "0 months" : expectedValue);
          const matchedLi = listItems.find((li) => {
            const liText = (li.textContent || "").trim().toLowerCase();
            return liText === targetOptText.toLowerCase() || liText === expectedValue.toLowerCase();
          });
          if (matchedLi) {
            try {
              matchedLi.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
              matchedLi.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
              matchedLi.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
            } catch {}
          }
        }
      }

      // Trigger jQuery / Select2 / Chosen custom events if page uses them
      try {
        element.dispatchEvent(new CustomEvent("select2:select", { bubbles: true }));
        element.dispatchEvent(new CustomEvent("chosen:updated", { bubbles: true }));
      } catch {}

      element.dispatchEvent(new FocusEvent("blur", { bubbles: true, composed: true }));
      element.dispatchEvent(new FocusEvent("focusout", { bubbles: true, composed: true }));

      // Clear any validation error classes or message nodes and hide Google Forms placeholders
      if (expectedValue !== "") {
        applyGoogleFormsState(element, expectedValue);

        const parentField = element.closest('.form-group, .field-wrapper, div[class*="field"], div[class*="form-control"], div[class*="input"], div[class*="group"]') || element.parentElement;
        if (parentField) {
          parentField.classList.remove("has-error", "is-invalid", "invalid", "error");
          element.classList.remove("is-invalid", "invalid", "error");
          element.removeAttribute("aria-invalid");
          const errorNodes = parentField.querySelectorAll('.help-block, .invalid-feedback, .error-message, [role="alert"], span[class*="error"], div[class*="error"]');
          errorNodes.forEach((node) => {
            const txt = (node.textContent || "").toLowerCase();
            if (txt.includes("required") || txt.includes("property") || txt.includes("blank") || txt.includes("enter")) {
              (node as HTMLElement).style.display = "none";
            }
          });
        }
      }
    } catch {
      return {
        success: false,
        valueRegistered: false,
        errorCode: "CSP_BLOCKED",
      };
    }

    // Post-fill verification: Check if value registered on DOM element
    let registered = true;
    if (element instanceof HTMLInputElement) {
      if (element.type !== "checkbox" && element.type !== "radio" && expectedValue) {
        registered = Boolean(element.value);
      }
    } else if (element instanceof HTMLTextAreaElement && expectedValue) {
      registered = Boolean(element.value);
    } else if (element instanceof HTMLSelectElement) {
      const curOptText = element.options[element.selectedIndex]?.text || "";
      const curVal = element.value || "";
      const isPlaceholder = !curVal && (curOptText.toLowerCase().includes("select") || curOptText.toLowerCase().includes("choose") || curOptText.toLowerCase().includes("please"));
      registered = selectMatched && element.selectedIndex >= 0 && !isPlaceholder;
    }

    return {
      success: true,
      valueRegistered: registered,
      errorCode: registered ? undefined : "FRAMEWORK_BLOCKED",
    };
  } catch (err: any) {
    console.warn("setNativeValue safe execution warning:", err?.message || err);
    return {
      success: false,
      valueRegistered: false,
      errorCode: "FRAMEWORK_BLOCKED",
    };
  }
}
