import { FormSelectOption } from "@internship-copilot/types";

/**
 * Option List Matcher (v3.0 §17.3)
 * Rule-based high-speed fuzzy matcher for large option lists (>50 items)
 * Eliminates redundant LLM token spend on huge lists (e.g. 190+ country lists,
 * state pickers, university dropdowns, graduation years).
 */

export interface OptionMatchResult {
  matchedOption: string | null;
  confidence: number;
  isAmbiguous: boolean;
}

const COMMON_ALIASES: Record<string, string[]> = {
  // Countries
  "united states": ["us", "usa", "united states of america", "america"],
  "india": ["in", "ind", "bharat", "indian"],
  "united kingdom": ["uk", "gb", "great britain", "england", "british"],
  "canada": ["ca", "can", "canadian"],
  "australia": ["au", "aus", "australian"],
  "germany": ["de", "deu", "deutschland", "german"],
  "singapore": ["sg", "sgp", "singaporean"],

  // Genders
  "male": ["m", "man", "boy"],
  "female": ["f", "woman", "girl"],
  "other": ["non-binary", "transgender", "prefer not to say"],

  // Notice Period
  "immediate": ["0", "imm", "0-15 days", "immediate (0-15 days)", "serving notice"],
  "30 days": ["1 month", "30", "30d"],
  "60 days": ["2 months", "60", "60d"],
  "90 days": ["3 months", "90", "90d"],
};

function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Checks if the option count exceeds the LLM structured output threshold (~50)
 */
export function isLargeOptionList(options: (string | FormSelectOption)[]): boolean {
  return options.length > 50;
}

/**
 * Performs deterministic fuzzy rule-matching against a field's option list.
 */
export function matchLargeOptionList(
  options: (string | FormSelectOption)[],
  targetValue: string
): OptionMatchResult {
  if (!options || options.length === 0 || !targetValue) {
    return { matchedOption: null, confidence: 0, isAmbiguous: false };
  }

  const normalizedTarget = normalizeString(targetValue);
  const normalizedOptions = options.map((opt, index) => {
    const rawLabel = typeof opt === "string" ? opt : opt.label || opt.value;
    const rawValue = typeof opt === "string" ? opt : opt.value;
    return {
      original: rawLabel,
      value: rawValue,
      normLabel: normalizeString(rawLabel),
      normValue: normalizeString(rawValue),
      index,
    };
  });

  // 1. Exact match against label or value
  for (const item of normalizedOptions) {
    if (item.normLabel === normalizedTarget || item.normValue === normalizedTarget) {
      return { matchedOption: item.original, confidence: 0.99, isAmbiguous: false };
    }
  }

  // 2. Exact alias match
  for (const [canonical, aliases] of Object.entries(COMMON_ALIASES)) {
    const targetIsAlias = canonical === normalizedTarget || aliases.includes(normalizedTarget);
    if (targetIsAlias) {
      for (const item of normalizedOptions) {
        if (
          item.normLabel === canonical ||
          item.normValue === canonical ||
          aliases.includes(item.normLabel) ||
          aliases.includes(item.normValue)
        ) {
          return { matchedOption: item.original, confidence: 0.98, isAmbiguous: false };
        }
      }
    }
  }

  // 3. Substring / Token containment
  const candidates: Array<{ item: (typeof normalizedOptions)[0]; score: number }> = [];

  const targetTokens = normalizedTarget.split(" ").filter((t) => t.length > 1);

  for (const item of normalizedOptions) {
    let score = 0;

    if (item.normLabel.startsWith(normalizedTarget)) {
      score = 0.9;
    } else if (item.normLabel.includes(normalizedTarget)) {
      score = 0.85;
    } else if (normalizedTarget.includes(item.normLabel) && item.normLabel.length >= 3) {
      score = 0.8;
    } else {
      // Token overlap
      let matchedTokens = 0;
      for (const token of targetTokens) {
        if (item.normLabel.includes(token)) matchedTokens++;
      }
      if (targetTokens.length > 0 && matchedTokens === targetTokens.length) {
        score = 0.8;
      } else if (matchedTokens > 0) {
        score = 0.5 * (matchedTokens / targetTokens.length);
      }
    }

    if (score >= 0.5) {
      candidates.push({ item, score });
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  if (candidates.length === 1 && candidates[0].score >= 0.8) {
    return {
      matchedOption: candidates[0].item.original,
      confidence: candidates[0].score,
      isAmbiguous: false,
    };
  }

  if (candidates.length > 1) {
    const top = candidates[0];
    const runnerUp = candidates[1];
    // If top score significantly exceeds runner up
    if (top.score >= 0.85 && top.score - runnerUp.score > 0.15) {
      return {
        matchedOption: top.item.original,
        confidence: top.score,
        isAmbiguous: false,
      };
    }
    // Multiple close candidates -> Ambiguous!
    return {
      matchedOption: top.item.original,
      confidence: 0.65,
      isAmbiguous: true,
    };
  }

  return { matchedOption: null, confidence: 0.3, isAmbiguous: false };
}
