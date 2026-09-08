import { scanFormFieldsWithStats } from "./dom-scanner";
import { executeAutofill } from "./autofill-engine";
import { findResumeUploadInputs, autoUploadResume } from "./resume-uploader";
import { FrameRegistry } from "./frame-registry";
import { FormMutationWatcher } from "./mutation-observer";
import { injectGoogleFormsHelperStyles } from "./event-dispatcher";
import { ExtensionMessage, FillFieldsPayload, FillResultPayload, ScanResultPayload } from "../types";

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
