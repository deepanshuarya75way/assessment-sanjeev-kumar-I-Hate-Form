import { StoredSessionData } from "../types";
import { FillProgress } from "@internship-copilot/types";

const DEFAULT_SESSION: StoredSessionData = {
  token: null,
  refreshToken: null,
  sessionId: null,
  currentUrl: null,
  currentDomain: null,
  detectedFields: [],
  currentMappings: [],
};

const SESSION_KEY = "copilot_session_state";

export async function getSessionState(): Promise<StoredSessionData> {
  try {
    if (typeof chrome !== "undefined" && chrome.storage?.session) {
      const data = await chrome.storage.session.get(SESSION_KEY);
      return data[SESSION_KEY] || DEFAULT_SESSION;
    }
  } catch (err) {
    console.warn("Could not read chrome.storage.session, fallback to default", err);
  }
  return DEFAULT_SESSION;
}

export async function setSessionState(partial: Partial<StoredSessionData>): Promise<StoredSessionData> {
  const current = await getSessionState();
  const updated: StoredSessionData = { ...current, ...partial };

  try {
    if (typeof chrome !== "undefined" && chrome.storage?.session) {
      await chrome.storage.session.set({ [SESSION_KEY]: updated });
    }
  } catch (err) {
    console.warn("Could not write chrome.storage.session", err);
  }

  return updated;
}

export async function clearSessionState(): Promise<void> {
  try {
    if (typeof chrome !== "undefined" && chrome.storage?.session) {
      await chrome.storage.session.remove(SESSION_KEY);
    }
  } catch (err) {
    console.warn("Could not clear chrome.storage.session", err);
  }
}

// In-memory fallback for test environments or when storage is unavailable
const memoryProgressStore = new Map<string, FillProgress>();

export async function getFillProgress(sessionId: string): Promise<FillProgress | null> {
  if (!sessionId) return null;
  try {
    const key = `fill_progress_${sessionId}`;
    if (typeof chrome !== "undefined" && chrome.storage?.session) {
      const data = await chrome.storage.session.get(key);
      if (data && data[key]) {
        return data[key] as FillProgress;
      }
    }
  } catch (err) {
    console.warn("Could not read fill progress from chrome.storage.session:", err);
  }
  return memoryProgressStore.get(sessionId) || null;
}

export async function persistFillProgress(progress: FillProgress): Promise<void> {
  if (!progress || !progress.sessionId) return;
  memoryProgressStore.set(progress.sessionId, progress);
  try {
    const key = `fill_progress_${progress.sessionId}`;
    if (typeof chrome !== "undefined" && chrome.storage?.session) {
      await chrome.storage.session.set({ [key]: progress });
    }
  } catch (err) {
    console.warn("Could not write fill progress to chrome.storage.session:", err);
  }
}

export async function clearFillProgress(sessionId: string): Promise<void> {
  if (!sessionId) return;
  memoryProgressStore.delete(sessionId);
  try {
    const key = `fill_progress_${sessionId}`;
    if (typeof chrome !== "undefined" && chrome.storage?.session) {
      await chrome.storage.session.remove(key);
    }
  } catch (err) {
    console.warn("Could not clear fill progress from chrome.storage.session:", err);
  }
}

