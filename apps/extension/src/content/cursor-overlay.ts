/**
 * Cosmetic Cursor Overlay (§6.6)
 *
 * Explicitly non-authoritative cosmetic layer.
 * Hosted inside an isolated Shadow DOM root to ensure zero CSS/JS bleed
 * with the host page.
 *
 * Hard rule: showCursor: false must produce bit-identical FillResult[] to showCursor: true.
 * This module never modifies form inputs, dispatches form events, or alters queue outcomes.
 */

export class CursorOverlayManager {
  private host: HTMLElement | null = null;
  private shadow: ShadowRoot | null = null;
  private cursorEl: HTMLElement | null = null;
  private isInitialized = false;

  public init(): void {
    if (this.isInitialized || typeof document === "undefined") {
      return;
    }

    try {
      const existingHost = document.getElementById("__ihateform_cursor_host__");
      if (existingHost) {
        existingHost.remove();
      }

      this.host = document.createElement("div");
      this.host.id = "__ihateform_cursor_host__";
      this.host.style.cssText = `
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 0 !important;
        height: 0 !important;
        pointer-events: none !important;
        z-index: 2147483647 !important;
      `;

      // Attach Shadow DOM for two-way CSS/JS isolation
      this.shadow = this.host.attachShadow({ mode: "open" });

      const style = document.createElement("style");
      style.textContent = `
        :host {
          pointer-events: none !important;
        }
        .cursor-pointer {
          position: fixed;
          top: 0;
          left: 0;
          width: 28px;
          height: 28px;
          pointer-events: none;
          z-index: 2147483647;
          opacity: 0;
          transform: translate3d(-100px, -100px, 0);
          transition: transform 250ms cubic-bezier(0.2, 0.9, 0.3, 1), opacity 150ms ease;
          filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.25));
        }
        .cursor-pointer.visible {
          opacity: 1;
        }
        .cursor-pulse {
          position: absolute;
          top: -6px;
          left: -6px;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: rgba(99, 102, 241, 0.35);
          animation: ihateform-pulse 1.2s infinite ease-out;
        }
        @keyframes ihateform-pulse {
          0% { transform: scale(0.6); opacity: 0.8; }
          100% { transform: scale(1.8); opacity: 0; }
        }
      `;
      this.shadow.appendChild(style);

      this.cursorEl = document.createElement("div");
      this.cursorEl.className = "cursor-pointer";
      this.cursorEl.innerHTML = `
        <div class="cursor-pulse"></div>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M4 3L18 10.5L11.5 12.5L8.5 19L4 3Z" fill="#6366F1" stroke="#FFFFFF" stroke-width="1.5" stroke-linejoin="round"/>
        </svg>
      `;
      this.shadow.appendChild(this.cursorEl);

      const root = document.body || document.documentElement;
      if (root) {
        root.appendChild(this.host);
        this.isInitialized = true;
      }
    } catch (err) {
      console.warn("Cursor overlay could not be mounted:", err);
    }
  }

  public moveTo(x: number, y: number, options?: { durationMs?: number }): Promise<void> {
    const duration = options?.durationMs ?? 250;

    if (!this.isInitialized) {
      this.init();
    }

    if (!this.cursorEl) {
      return Promise.resolve();
    }

    const targetX = Math.max(0, x + 8);
    const targetY = Math.max(0, y + 8);

    this.cursorEl.style.transitionDuration = `${duration}ms`;
    this.cursorEl.style.transform = `translate3d(${targetX}px, ${targetY}px, 0)`;
    this.cursorEl.classList.add("visible");

    // In test or non-browser environments or when duration is 0, resolve immediately
    if (typeof window === "undefined" || duration <= 0) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      setTimeout(resolve, duration);
    });
  }

  public hide(): void {
    if (this.cursorEl) {
      this.cursorEl.classList.remove("visible");
    }
  }

  public destroy(): void {
    if (this.host) {
      try {
        this.host.remove();
      } catch {}
      this.host = null;
      this.shadow = null;
      this.cursorEl = null;
      this.isInitialized = false;
    }
  }
}

export const cursorOverlay = new CursorOverlayManager();

/**
 * Animate cosmetic cursor to an element (§6.6)
 */
export async function animateCursorTo(
  el: HTMLElement,
  options?: { durationMs?: number }
): Promise<void> {
  if (!el || typeof el.getBoundingClientRect !== "function") {
    return;
  }
  const rect = el.getBoundingClientRect();
  await cursorOverlay.moveTo(rect.left, rect.top, { durationMs: options?.durationMs ?? 250 });
}
