import { ProfileInference, ProfileSummary, SeniorityTier, InferredCompensation } from "@internship-copilot/types";
import { callStructuredModel } from "./client";

/**
 * Resume Inference Layer (v3.0 §19)
 * One-time structured extraction from resume populating:
 * - totalExperienceMonths
 * - seniorityTier
 * - topSkills
 * - inferredCompensation (explicitly labeled rough estimate with reasoning)
 *
 * Provides cross-checking for hallucination and unconditional review for compensation.
 */

export interface ResumeInferenceOutput {
  totalExperienceMonths: number;
  seniorityTier: SeniorityTier;
  topSkills: string[];
  inferredCompensation: InferredCompensation;
}

const resumeInferenceJsonSchema = {
  type: "object",
  properties: {
    totalExperienceMonths: { type: "number" },
    seniorityTier: { type: "string", enum: ["student", "fresher", "junior", "mid"] },
    topSkills: {
      type: "array",
      items: { type: "string" },
    },
    inferredCompensation: {
      type: "object",
      properties: {
        min: { type: "number" },
        max: { type: "number" },
        currency: { type: "string" },
        confidence: { type: "number" },
        reasoning: { type: "string" },
      },
      required: ["min", "max", "currency", "confidence", "reasoning"],
    },
  },
  required: ["totalExperienceMonths", "seniorityTier", "topSkills", "inferredCompensation"],
};

/**
 * Deterministic fallback parser when model is offline or unconfigured
 */
function heuristicResumeInference(resumeText: string, existingProfile?: ProfileSummary): ResumeInferenceOutput {
  const text = (resumeText || "").toLowerCase();
  
  // Calculate experience months from text / profile
  let totalMonths = 0;
  if (existingProfile?.experience && existingProfile.experience.length > 0) {
    for (const exp of existingProfile.experience) {
      if (exp.startDate) {
        const start = new Date(exp.startDate).getTime();
        const end = exp.endDate ? new Date(exp.endDate).getTime() : Date.now();
        const diffMonths = Math.max(0, Math.round((end - start) / (1000 * 60 * 60 * 24 * 30.4)));
        totalMonths += diffMonths;
      }
    }
  }

  const isCurrentStudent =
    text.includes("student") ||
    text.includes("b.tech") ||
    text.includes("btech") ||
    text.includes("2026") ||
    text.includes("2025") ||
    (existingProfile?.education?.[0]?.isCurrent ?? false);

  let tier: SeniorityTier = "fresher";
  if (isCurrentStudent && totalMonths < 6) {
    tier = "student";
  } else if (totalMonths < 12) {
    tier = "fresher";
  } else if (totalMonths < 36) {
    tier = "junior";
  } else {
    tier = "mid";
  }

  // Extract skills
  const extractedSkills: string[] = [];
  const knownSkills = [
    "TypeScript",
    "JavaScript",
    "Python",
    "React",
    "Node.js",
    "Next.js",
    "SQL",
    "PostgreSQL",
    "TailwindCSS",
    "Docker",
    "Git",
    "C++",
    "Java",
    "AWS",
  ];

  for (const sk of knownSkills) {
    if (text.includes(sk.toLowerCase())) {
      extractedSkills.push(sk);
    }
  }

  if (existingProfile?.skills) {
    for (const s of existingProfile.skills) {
      if (!extractedSkills.includes(s.name)) {
        extractedSkills.push(s.name);
      }
    }
  }

  // Rough estimate compensation based on tier
  const comp: InferredCompensation =
    tier === "student"
      ? {
          min: 20000,
          max: 50000,
          currency: "INR/month (Stipend)",
          confidence: 0.85,
          reasoning: "Rough estimate based on pre-final year CS student profile seeking internship roles.",
        }
      : tier === "fresher"
      ? {
          min: 6,
          max: 12,
          currency: "LPA (INR)",
          confidence: 0.8,
          reasoning: "Estimated entry-level engineering graduate tier based on technical stack and project breadth.",
        }
      : {
          min: 10,
          max: 18,
          currency: "LPA (INR)",
          confidence: 0.75,
          reasoning: "Estimated junior engineering level based on accumulated project and internship duration.",
        };

  return {
    totalExperienceMonths: totalMonths,
    seniorityTier: tier,
    topSkills: extractedSkills.length > 0 ? extractedSkills : ["Full-Stack", "TypeScript"],
    inferredCompensation: comp,
  };
}

/**
 * Extracts structured inference from resume text (v3.0 §19.3)
 */
export async function extractResumeInference(
  resumeText: string,
  existingProfile?: ProfileSummary
): Promise<ResumeInferenceOutput> {
  const systemPrompt = `You are an expert ATS resume analyst for student and early-career internship applicants.
Your task is to extract structured signals:
1. totalExperienceMonths: Total professional/internship work experience in months (exclude high school or academic class projects; freshers or students with only coursework = 0).
2. seniorityTier: "student", "fresher", "junior", or "mid".
3. topSkills: Array of normalized technical skills and proficiencies.
4. inferredCompensation: A rough estimate for student reference, NEVER career advice. Always label with min, max, currency, confidence, and reasoning.

Return ONLY valid JSON matching schema.`;

  const userPrompt = `Applicant Resume Content:
${resumeText.slice(0, 4000)}

Existing Profile Summary:
${JSON.stringify(existingProfile || {}, null, 2)}`;

  try {
    const response = await callStructuredModel<ResumeInferenceOutput>({
      tier: "workhorse",
      systemPrompt,
      userPrompt,
      schema: resumeInferenceJsonSchema,
      schemaName: "resume_inference",
      maxRetries: 1,
    });

    if (response.data && response.data.seniorityTier) {
      return response.data;
    }
  } catch (err) {
    console.warn("Structured resume inference LLM call fell back to heuristic:", err);
  }

  return heuristicResumeInference(resumeText, existingProfile);
}

/**
 * Detects if a question/label relates to compensation, salary, CTC, or stipend (v3.0 §19.4)
 */
export function isCompensationQuestion(questionText: string, category?: string): boolean {
  const norm = `${questionText} ${category || ""}`.toLowerCase();
  return (
    norm.includes("salary") ||
    norm.includes("ctc") ||
    norm.includes("compensation") ||
    norm.includes("stipend") ||
    norm.includes("expected pay") ||
    norm.includes("current pay") ||
    norm.includes("remuneration") ||
    norm.includes("cost to company") ||
    norm.includes("desired salary") ||
    norm.includes("expected compensation")
  );
}

/**
 * Consistency Cross-Check (v3.0 §19.6):
 * Compares drafted answer against ProfileInference.
 * If draft answer contradicts inferred experience/seniority, flags consistencyFlag and forces review.
 */
export function crossCheckAnswerConsistency(
  draftAnswer: string,
  inference?: Partial<ProfileInference> | null
): { consistent: boolean; consistencyFlag?: string; forceReview: boolean } {
  if (!inference || !draftAnswer) {
    return { consistent: true, forceReview: false };
  }

  const answerLower = draftAnswer.toLowerCase();

  // Check experience claims in answer
  const yearsMatch = answerLower.match(/(\d+)\+?\s*(?:years?|yrs?)(?:\s+of)?(?:\s+experience)?/);
  if (yearsMatch && yearsMatch[1]) {
    const claimedYears = parseInt(yearsMatch[1], 10);
    const inferredYears = ((inference.totalExperienceMonths || 0) / 12);

    if (claimedYears > 1 && inferredYears < 1) {
      return {
        consistent: false,
        consistencyFlag: `EXPERIENCE_CONTRADICTION: Claimed ${claimedYears} years in draft answer contradicts inferred experience of ${inference.totalExperienceMonths || 0} months`,
        forceReview: true,
      };
    }
  }

  return { consistent: true, forceReview: false };
}
