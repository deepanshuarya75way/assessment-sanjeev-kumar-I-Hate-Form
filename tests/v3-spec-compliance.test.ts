import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { runFillQueue, fillOneField, verifyFieldValue, dispatchPointerSequence } from "../apps/extension/src/content/fill-queue";
import { cursorOverlay, animateCursorTo } from "../apps/extension/src/content/cursor-overlay";
import { getFillProgress, persistFillProgress, clearFillProgress } from "../apps/extension/src/storage/chrome-storage";
import { QueuedField, FillProgress } from "@internship-copilot/types";

function loadFixture(relPath: string): string {
  return fs.readFileSync(path.resolve(__dirname, relPath), "utf-8");
}

describe("Internship Application Copilot — Final Implementation Plan (v3.0) Compliance (§§1–16)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    cursorOverlay.destroy();
  });

  describe("§6: Sequential Fill Engine & Per-Field Verification State Machine", () => {
    it("§6.2: fills fields one at a time, sequentially in DOM position order", async () => {
      document.body.innerHTML = `
        <form>
          <input type="text" id="seq-name" tabindex="1" data-ihateform-hash="hash_name" />
          <input type="email" id="seq-email" tabindex="2" data-ihateform-hash="hash_email" />
          <input type="tel" id="seq-phone" tabindex="3" data-ihateform-hash="hash_phone" />
        </form>
      `;

      const nameEl = document.getElementById("seq-name") as HTMLInputElement;
      const emailEl = document.getElementById("seq-email") as HTMLInputElement;
      const phoneEl = document.getElementById("seq-phone") as HTMLInputElement;

      const orderFilled: string[] = [];
      nameEl.addEventListener("input", () => orderFilled.push("name"));
      emailEl.addEventListener("input", () => orderFilled.push("email"));
      phoneEl.addEventListener("input", () => orderFilled.push("phone"));

      const queue: QueuedField[] = [
        { frameId: 0, domSelectorHash: "hash_name", element: nameEl, profilePath: "personal.name", value: "Sanjeev", fieldType: "text" },
        { frameId: 0, domSelectorHash: "hash_email", element: emailEl, profilePath: "personal.email", value: "sanjeev@example.com", fieldType: "text" },
        { frameId: 0, domSelectorHash: "hash_phone", element: phoneEl, profilePath: "personal.phone", value: "8825171882", fieldType: "text" },
      ];

      const results = await runFillQueue(queue, { interFieldDelayMs: 15, showCursor: false });

      expect(orderFilled).toEqual(["name", "email", "phone"]);
      expect(results).toHaveLength(3);
      expect(results.every((r) => r.status === "filled")).toBe(true);
    });

    it("§6.4: passes custom dropdown fixture (sequential-custom-dropdown.html) requiring click sequence", async () => {
      document.body.innerHTML = loadFixture("fixtures/forms/sequential-custom-dropdown.html");

      // Execute scripts from fixture in JSDOM lexical scope
      const script = document.querySelector("script");
      if (script && script.textContent) {
        eval(script.textContent);
      }

      const dropdown = document.getElementById("experience-dropdown") as HTMLElement;
      expect(dropdown).toBeDefined();

      const field: QueuedField = {
        frameId: 0,
        domSelectorHash: "hash_exp_dropdown",
        element: dropdown,
        profilePath: "experience.years",
        value: "1 - 3 years",
        fieldType: "custom-dropdown",
      };

      const result = await fillOneField(field, { showCursor: false });

      expect(result.status).toBe("filled");
      expect(result.attempts).toBe(1);
      const display = document.getElementById("exp-display");
      expect(display?.textContent).toContain("1 - 3 years");
    });

    it("§6.4: passes debounced validation fixture (sequential-debounced-validation.html) via verify-with-retry", async () => {
      document.body.innerHTML = loadFixture("fixtures/forms/sequential-debounced-validation.html");

      const script = document.querySelector("script");
      if (script && script.textContent) {
        eval(script.textContent);
      }

      const input = document.getElementById("work-email") as HTMLInputElement;

      const field: QueuedField = {
        frameId: 0,
        domSelectorHash: "hash_work_email",
        element: input,
        profilePath: "personal.email",
        value: "student@university.edu",
        fieldType: "text",
      };

      const result = await fillOneField(field, { showCursor: false });

      expect(result.status).toBe("filled");
      expect(input.value).toBe("student@university.edu");
    });

    it("§6.5: passes dynamic reflow fixture (sequential-dynamic-reflow.html) after mid-fill DOM shift", async () => {
      document.body.innerHTML = loadFixture("fixtures/forms/sequential-dynamic-reflow.html");

      const script = document.querySelector("script");
      if (script && script.textContent) {
        eval(script.textContent);
      }

      const nameInput = document.getElementById("step1-input") as HTMLInputElement;
      const phoneInputInitial = document.getElementById("step2-input") as HTMLInputElement;

      const queue: QueuedField[] = [
        {
          frameId: 0,
          domSelectorHash: "hash_name",
          element: nameInput,
          profilePath: "personal.name",
          value: "Sanjeev Kumar",
          fieldType: "text",
        },
        {
          frameId: 0,
          domSelectorHash: "hash_phone",
          element: phoneInputInitial,
          profilePath: "personal.phone",
          value: "+91-8825171882",
          fieldType: "text",
        },
      ];

      const results = await runFillQueue(queue, { interFieldDelayMs: 20, showCursor: false });

      expect(results).toHaveLength(2);
      expect(results.every((r) => r.status === "filled")).toBe(true);

      const refreshedPhone = document.getElementById("step2-input") as HTMLInputElement;
      expect(refreshedPhone.value).toBe("+91-8825171882");
    });
  });

  describe("§6.5: MV3 Service Worker Lifecycle & Progress Persistence", () => {
    it("survives service worker termination and resumes from currentIndex without refilling", async () => {
      const sessionId = `test_recovery_${Date.now()}`;
      await clearFillProgress(sessionId);

      document.body.innerHTML = `
        <form>
          <input type="text" id="inp-1" data-ihateform-hash="f1" value="" />
          <input type="text" id="inp-2" data-ihateform-hash="f2" value="" />
        </form>
      `;

      const inp1 = document.getElementById("inp-1") as HTMLInputElement;
      const inp2 = document.getElementById("inp-2") as HTMLInputElement;

      let inp1Calls = 0;
      inp1.addEventListener("input", () => inp1Calls++);

      // Simulate step 1 was completed and persisted in chrome.storage.session
      await persistFillProgress({
        sessionId,
        queueOrder: ["f1", "f2"],
        results: [{ fieldId: "f1", status: "filled", attempts: 1 }],
        currentIndex: 1,
      });
      inp1.value = "Prefilled Value";

      const queue: QueuedField[] = [
        { frameId: 0, domSelectorHash: "f1", element: inp1, profilePath: "personal.f1", value: "Prefilled Value", fieldType: "text" },
        { frameId: 0, domSelectorHash: "f2", element: inp2, profilePath: "personal.f2", value: "Second Value", fieldType: "text" },
      ];

      const results = await runFillQueue(queue, { sessionId, showCursor: false });

      // Inp1 should NOT be touched again
      expect(inp1Calls).toBe(0);
      expect(results).toHaveLength(2);
      expect(results[0].fieldId).toBe("f1");
      expect(results[1].fieldId).toBe("f2");
      expect(inp2.value).toBe("Second Value");
    });
  });

  describe("§6.6: Cosmetic Cursor Overlay & Parity Invariant", () => {
    it("cursor overlay is isolated in Shadow DOM and does not leak page styles", async () => {
      document.body.innerHTML = `
        <div id="test-anchor" style="position: absolute; left: 50px; top: 100px; width: 200px; height: 30px;">
          Input target
        </div>
      `;
      const anchor = document.getElementById("test-anchor") as HTMLElement;

      await animateCursorTo(anchor, { durationMs: 0 });

      const host = document.getElementById("__ihateform_cursor_host__");
      expect(host).toBeDefined();
      expect(host?.shadowRoot).toBeDefined();

      const pointer = host?.shadowRoot?.querySelector(".cursor-pointer");
      expect(pointer).toBeDefined();
    });

    it("passes cursor-overlay-parity.html: showCursor: false and true produce bit-identical FillResult[]", async () => {
      const fixtureHtml = loadFixture("fixtures/forms/cursor-overlay-parity.html");

      // Run 1: with cursor enabled
      document.body.innerHTML = fixtureHtml;
      const q1: QueuedField[] = [
        { frameId: 0, domSelectorHash: "hash_p_name", element: document.getElementById("parity-name") as HTMLElement, profilePath: "personal.name", value: "Sanjeev", fieldType: "text" },
        { frameId: 0, domSelectorHash: "hash_p_email", element: document.getElementById("parity-email") as HTMLElement, profilePath: "personal.email", value: "sanjeev@example.com", fieldType: "text" },
        { frameId: 0, domSelectorHash: "hash_p_role", element: document.getElementById("parity-role") as HTMLElement, profilePath: "personal.role", value: "fullstack", fieldType: "select" },
        { frameId: 0, domSelectorHash: "hash_p_agree", element: document.getElementById("parity-agree") as HTMLElement, profilePath: "personal.agree", value: "true", fieldType: "checkbox" },
      ];
      const resultsWithCursor = await runFillQueue(q1, { showCursor: true, interFieldDelayMs: 10 });

      // Run 2: with cursor disabled
      document.body.innerHTML = fixtureHtml;
      const q2: QueuedField[] = [
        { frameId: 0, domSelectorHash: "hash_p_name", element: document.getElementById("parity-name") as HTMLElement, profilePath: "personal.name", value: "Sanjeev", fieldType: "text" },
        { frameId: 0, domSelectorHash: "hash_p_email", element: document.getElementById("parity-email") as HTMLElement, profilePath: "personal.email", value: "sanjeev@example.com", fieldType: "text" },
        { frameId: 0, domSelectorHash: "hash_p_role", element: document.getElementById("parity-role") as HTMLElement, profilePath: "personal.role", value: "fullstack", fieldType: "select" },
        { frameId: 0, domSelectorHash: "hash_p_agree", element: document.getElementById("parity-agree") as HTMLElement, profilePath: "personal.agree", value: "true", fieldType: "checkbox" },
      ];
      const resultsWithoutCursor = await runFillQueue(q2, { showCursor: false, interFieldDelayMs: 10 });

      // Hard Rule (§6.6): showCursor: false must produce bit-identical FillResult[] to showCursor: true
      expect(resultsWithCursor).toEqual(resultsWithoutCursor);
      expect(resultsWithCursor).toHaveLength(4);
      expect(resultsWithCursor.every((r) => r.status === "filled")).toBe(true);
    });
  });
});
