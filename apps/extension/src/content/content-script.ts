import { scanFormFieldsWithStats } from "./dom-scanner";
import { executeAutofill } from "./autofill-engine";
import { findResumeUploadInputs, autoUploadResume } from "./resume-uploader";
import { FrameRegistry } from "./frame-registry";
import { FormMutationWatcher } from "./mutation-observer";
import { injectGoogleFormsHelperStyles } from "./event-dispatcher";
import { ExtensionMessage, FillFieldsPayload, FillResultPayload, ScanResultPayload } from "../types";

import { querySelectorAllDeepWithStats } from "./shadow-dom-walker";


// Wrap in self-invoking function and guard against duplicate injection
(() => {
  if ((window as any).__IHATEFORM_CONTENT_SCRIPT_INITIALIZED__) {
    return;
  }
  (window as any).__IHATEFORM_CONTENT_SCRIPT_INITIALIZED__ = true;

  // Inject helper styles (e.g. Google Forms placeholder cleanup)
  injectGoogleFormsHelperStyles();

  // Initialize frame registry for this context
  const frameMeta = FrameRegistry.initialize();
  const currentFrameId = frameMeta.frameId;

  // Expose global scanning and autofill helpers for direct scripting
  (window as any).__IHATEFORM_SCAN_WITH_STATS__ = () => {
    const scanStats = scanFormFieldsWithStats();
    const resumeInputs = findResumeUploadInputs();
    const hasResume = resumeInputs.length > 0 || scanStats.fields.some((f) => f.type === "file");
    return {
      frameId: currentFrameId,
      fields: scanStats.fields,
      closedShadowRootsDetected: scanStats.closedShadowRootsDetected,
      hasResumeField: hasResume,
    };
  };


  const HIGHLIGHT_ATTR = "data-ihateform-highlight";

  const clearHighlights = () => {
    document.querySelectorAll(`[${HIGHLIGHT_ATTR}]`).forEach((n) => {
      const h = n as HTMLElement;
      h.style.outline = "";
      h.style.outlineOffset = "";
      h.removeAttribute(HIGHLIGHT_ATTR);
    });
  };

  (window as any).__IHATEFORM_FOCUS_FIELD__ = (fieldId: string) => {
    const { matchedElements } = querySelectorAllDeepWithStats(`[data-ihateform-id="${fieldId}"]`);
    const el = matchedElements[0] as HTMLElement | undefined;
    if (!el) return { found: false };

    clearHighlights();
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.setAttribute(HIGHLIGHT_ATTR, "true");
    el.style.outline = "3px solid #f59e0b";
    el.style.outlineOffset = "3px";

    const focusable = el.matches("input, textarea, select, [contenteditable]")
      ? el
      : (el.querySelector("input, textarea, select, [contenteditable='true']") as HTMLElement | null);
    try {
      focusable?.focus({ preventScroll: true });
    } catch {}

    el.addEventListener("input", clearHighlights, { once: true });
    return { found: true };
  };

  (window as any).__IHATEFORM_AUTOFILL__ = async (mappings: any[], profile: any, savedResume: any, allDocuments: any, options?: any) => {
    const scanStats = scanFormFieldsWithStats();
    return await executeAutofill(scanStats.fields, mappings, profile || null, savedResume || null, allDocuments || null, options);
  };

  // Listen for messages from background worker / sidepanel
  chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
    if (message.type === "PING") {
      sendResponse({ pong: true, frameId: currentFrameId });
      return true;
    }

    if (message.type === "SCAN_FORM") {
      try {
        const scanStats = scanFormFieldsWithStats();
        const resumeInputs = findResumeUploadInputs();
        const hasResume = resumeInputs.length > 0 || scanStats.fields.some((f) => f.type === "file");
        const payload: ScanResultPayload & { closedShadowRootsDetected?: number; hasResumeField?: boolean } = {
          frameId: currentFrameId,
          fields: scanStats.fields,
          closedShadowRootsDetected: scanStats.closedShadowRootsDetected,
          hasResumeField: hasResume,
        };
        sendResponse(payload);
      } catch (err) {
        sendResponse({ frameId: currentFrameId, fields: [], error: String(err) });
      }
      return true;
    }

    if (message.type === "FILL_FIELDS") {
      (async () => {
        try {
          const payload = message.payload as FillFieldsPayload & { profile?: any; savedResume?: any; allDocuments?: any; showCursor?: boolean; sessionId?: string };
          const scanStats = scanFormFieldsWithStats();
          const autofillResult = await executeAutofill(
            scanStats.fields,
            payload.mappings,
            payload.profile || null,
            payload.savedResume || null,
            payload.allDocuments || null,
            { showCursor: payload.showCursor, sessionId: payload.sessionId }
          );

          const resultPayload: FillResultPayload & { resumeUpload?: any; corrections?: any } = {
            filledFieldIds: autofillResult.filledFieldIds,
            skippedFieldIds: autofillResult.skippedFieldIds,
            errors: autofillResult.errors,
            resumeUpload: autofillResult.resumeUpload,
            corrections: autofillResult.corrections,
          };
          sendResponse(resultPayload);
        } catch (err) {
          sendResponse({
            filledFieldIds: [],
            skippedFieldIds: [],
            errors: [{ fieldId: "global", errorCode: "FRAMEWORK_BLOCKED", message: String(err) }],
          });
        }
      })();
      return true;
    }

    if (message.type === "UPLOAD_RESUME") {
      try {
        const payload = message.payload as { profile?: any; savedResume?: any; allDocuments?: any };
        const uploadResult = autoUploadResume(payload?.profile || null, payload?.savedResume || null, payload?.allDocuments || null);
        sendResponse({ success: uploadResult.uploaded, uploadResult });
      } catch (err) {
        sendResponse({ success: false, error: String(err) });
      }
      return true;
    }
  });

  // Setup dynamic form watcher
  try {
    const mutationWatcher = new FormMutationWatcher(() => {
      try {
        const scanStats = scanFormFieldsWithStats();
        chrome.runtime.sendMessage({
          type: "SCAN_RESULT",
          payload: {
            frameId: currentFrameId,
            fields: scanStats.fields,
            closedShadowRootsDetected: scanStats.closedShadowRootsDetected,
          },
        }).catch(() => {
          // Ignore disconnected port errors
        });
      } catch {
        // Ignore context invalidation on reload
      }
    });

    mutationWatcher.start();
  } catch {
    // Ignore mutation observer errors
  }
})();
