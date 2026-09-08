import { describe, it, expect, beforeEach, vi } from "vitest";
import { runFillQueue, fillOneField, verifyFieldValue, dispatchPointerSequence, waitForFocus } from "../apps/extension/src/content/fill-queue";
import { executeAutofill } from "../apps/extension/src/content/autofill-engine";
import { QueuedField, FieldDescriptor, FieldMapping } from "@internship-copilot/types";
import { getFillProgress, persistFillProgress, clearFillProgress } from "../apps/extension/src/storage/chrome-storage";

describe("Phase 3 Revised: Sequential Fill Engine & Verification (§6, §16)", () => {
  beforeEach(async () => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("fills fields sequentially in DOM order and verifies each fill before advancing", async () => {
    document.body.innerHTML = `
      <form id="test-form">
        <input type="text" id="field-1" data-ihateform-hash="hash_1" />
        <input type="text" id="field-2" data-ihateform-hash="hash_2" />
        <input type="text" id="field-3" data-ihateform-hash="hash_3" />
      </form>
    `;

    const el1 = document.getElementById("field-1") as HTMLInputElement;
    const el2 = document.getElementById("field-2") as HTMLInputElement;
    const el3 = document.getElementById("field-3") as HTMLInputElement;

    const fillEvents: string[] = [];

    el1.addEventListener("input", () => fillEvents.push("fill_1"));
    el2.addEventListener("input", () => fillEvents.push("fill_2"));
    el3.addEventListener("input", () => fillEvents.push("fill_3"));

    const queue: QueuedField[] = [
      { frameId: 0, domSelectorHash: "hash_1", element: el1, profilePath: "personal.firstName", value: "Sanjeev", fieldType: "text" },
      { frameId: 0, domSelectorHash: "hash_2", element: el2, profilePath: "personal.lastName", value: "Kumar", fieldType: "text" },
      { frameId: 0, domSelectorHash: "hash_3", element: el3, profilePath: "personal.email", value: "sanjeev@example.com", fieldType: "text" },
    ];

    const results = await runFillQueue(queue, { interFieldDelayMs: 20, showCursor: false });

    expect(fillEvents).toEqual(["fill_1", "fill_2", "fill_3"]);
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.status === "filled")).toBe(true);
    expect(el1.value).toBe("Sanjeev");
    expect(el2.value).toBe("Kumar");
    expect(el3.value).toBe("sanjeev@example.com");
  });

  it("performs type-aware verification on text, select, custom dropdown, and checkbox", async () => {
    document.body.innerHTML = `
      <div>
        <input type="text" id="input-text" value="Alice" />
        <select id="select-role">
          <option value="intern" selected>Intern</option>
          <option value="fte">Full Time</option>
        </select>
        <div id="custom-dropdown" role="combobox">
          <span class="opt" aria-selected="true">Remote</span>
        </div>
        <input type="checkbox" id="chk-agree" checked />
      </div>
    `;

    const textEl = document.getElementById("input-text") as HTMLInputElement;
    const selectEl = document.getElementById("select-role") as HTMLSelectElement;
    const customDropEl = document.getElementById("custom-dropdown") as HTMLElement;
    const checkEl = document.getElementById("chk-agree") as HTMLInputElement;

    expect(await verifyFieldValue(textEl, "Alice", "text", { timeoutMs: 50 })).toBe(true);
    expect(await verifyFieldValue(textEl, "Bob", "text", { timeoutMs: 50 })).toBe(false);

    expect(await verifyFieldValue(selectEl, "Intern", "select", { timeoutMs: 50 })).toBe(true);
    expect(await verifyFieldValue(selectEl, "Full Time", "select", { timeoutMs: 50 })).toBe(false);

    expect(await verifyFieldValue(customDropEl, "Remote", "custom-dropdown", { timeoutMs: 50 })).toBe(true);
    expect(await verifyFieldValue(customDropEl, "Onsite", "custom-dropdown", { timeoutMs: 50 })).toBe(false);

    expect(await verifyFieldValue(checkEl, "true", "checkbox", { timeoutMs: 50 })).toBe(true);
    expect(await verifyFieldValue(checkEl, "false", "checkbox", { timeoutMs: 50 })).toBe(false);
  });

  it("retries after settle window when framework updates asynchronously (§6.4)", async () => {
    document.body.innerHTML = `
      <input type="text" id="async-field" data-ihateform-hash="hash_async" />
    `;
    const input = document.getElementById("async-field") as HTMLInputElement;

    // Simulate async framework delay: clears value initially, sets after 450ms (exceeds initial 400ms window)
    input.addEventListener("input", () => {
      const v = input.value;
      input.value = "";
      setTimeout(() => {
        input.value = v;
      }, 450);
    });

    const field: QueuedField = {
      frameId: 0,
      domSelectorHash: "hash_async",
      element: input,
      profilePath: "personal.firstName",
      value: "Sanjeev",
      fieldType: "text",
    };

    const result = await fillOneField(field, { showCursor: false });

    // Should succeed on second attempt (attempts: 2)
    expect(result.status).toBe("filled");
    expect(result.attempts).toBe(2);
    expect(input.value).toBe("Sanjeev");
  });

  it("falls back to review immediately when custom dropdown option is not found (§12)", async () => {
    document.body.innerHTML = `
      <div id="dropdown-country" role="combobox" data-ihateform-hash="hash_custom_drop">
        <div class="custom-select-trigger">Choose Country</div>
        <div class="options">
          <div role="option">United States</div>
          <div role="option">Canada</div>
          <div role="option">United Kingdom</div>
        </div>
      </div>
    `;
    const dropdown = document.getElementById("dropdown-country") as HTMLElement;

    const field: QueuedField = {
      frameId: 0,
      domSelectorHash: "hash_custom_drop",
      element: dropdown,
      profilePath: "personal.country",
      value: "Atlantis", // Non-existent option
      fieldType: "custom-dropdown",
    };

    const result = await fillOneField(field, { showCursor: false });

    expect(result.status).toBe("review");
    expect(result.attempts).toBe(1);
  });

  it("persists progress to session storage and resumes mid-queue without refilling already verified fields (§6.5)", async () => {
    const sessionId = `test_session_${Date.now()}`;
    await clearFillProgress(sessionId);

    document.body.innerHTML = `
      <input type="text" id="f1" data-ihateform-hash="h1" value="" />
      <input type="text" id="f2" data-ihateform-hash="h2" value="" />
      <input type="text" id="f3" data-ihateform-hash="h3" value="" />
    `;

    const f1 = document.getElementById("f1") as HTMLInputElement;
    const f2 = document.getElementById("f2") as HTMLInputElement;
    const f3 = document.getElementById("f3") as HTMLInputElement;

    let f1FillCount = 0;
    f1.addEventListener("input", () => f1FillCount++);

    // Pre-populate progress as if field 1 was already verified and worker died at index 1
    await persistFillProgress({
      sessionId,
      queueOrder: ["h1", "h2", "h3"],
      results: [{ fieldId: "h1", status: "filled", attempts: 1 }],
      currentIndex: 1,
    });
    f1.value = "Prefilled";

    const queue: QueuedField[] = [
      { frameId: 0, domSelectorHash: "h1", element: f1, profilePath: "personal.f1", value: "Prefilled", fieldType: "text" },
      { frameId: 0, domSelectorHash: "h2", element: f2, profilePath: "personal.f2", value: "SecondVal", fieldType: "text" },
      { frameId: 0, domSelectorHash: "h3", element: f3, profilePath: "personal.f3", value: "ThirdVal", fieldType: "text" },
    ];

    const results = await runFillQueue(queue, { sessionId, showCursor: false, interFieldDelayMs: 10 });

    // Field 1 was already filled; should NOT have been re-dispatched
    expect(f1FillCount).toBe(0);
    expect(results).toHaveLength(3);
    expect(results[0].fieldId).toBe("h1");
    expect(results[1].fieldId).toBe("h2");
    expect(results[2].fieldId).toBe("h3");
    expect(f2.value).toBe("SecondVal");
    expect(f3.value).toBe("ThirdVal");

    // Session progress should now have all 3 fields recorded
    const saved = await getFillProgress(sessionId);
    expect(saved?.currentIndex).toBe(3);
    expect(saved?.results).toHaveLength(3);
  });

  it("asserts showCursor: false produces bit-identical FillResult[] to showCursor: true (§6.6 parity)", async () => {
    function setupParityDom() {
      document.body.innerHTML = `
        <form>
          <input type="text" id="p-name" data-ihateform-hash="p1" />
          <input type="email" id="p-email" data-ihateform-hash="p2" />
          <select id="p-role" data-ihateform-hash="p3">
            <option value="">Select</option>
            <option value="Engineer">Engineer</option>
          </select>
        </form>
      `;
    }

    // Run 1: with cursor enabled
    setupParityDom();
    const q1: QueuedField[] = [
      { frameId: 0, domSelectorHash: "p1", element: document.getElementById("p-name") as HTMLElement, profilePath: "personal.name", value: "Test User", fieldType: "text" },
      { frameId: 0, domSelectorHash: "p2", element: document.getElementById("p-email") as HTMLElement, profilePath: "personal.email", value: "test@example.com", fieldType: "text" },
      { frameId: 0, domSelectorHash: "p3", element: document.getElementById("p-role") as HTMLElement, profilePath: "personal.role", value: "Engineer", fieldType: "select" },
    ];
    const resultsWithCursor = await runFillQueue(q1, { showCursor: true, interFieldDelayMs: 10 });

    // Run 2: with cursor disabled
    setupParityDom();
    const q2: QueuedField[] = [
      { frameId: 0, domSelectorHash: "p1", element: document.getElementById("p-name") as HTMLElement, profilePath: "personal.name", value: "Test User", fieldType: "text" },
      { frameId: 0, domSelectorHash: "p2", element: document.getElementById("p-email") as HTMLElement, profilePath: "personal.email", value: "test@example.com", fieldType: "text" },
      { frameId: 0, domSelectorHash: "p3", element: document.getElementById("p-role") as HTMLElement, profilePath: "personal.role", value: "Engineer", fieldType: "select" },
    ];
    const resultsWithoutCursor = await runFillQueue(q2, { showCursor: false, interFieldDelayMs: 10 });

    // Bit-identical comparison
    expect(resultsWithCursor).toEqual(resultsWithoutCursor);
    expect(resultsWithCursor).toHaveLength(3);
    expect(resultsWithCursor.every((r) => r.status === "filled")).toBe(true);
  });
});
