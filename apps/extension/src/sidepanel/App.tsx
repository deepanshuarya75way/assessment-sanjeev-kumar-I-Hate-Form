import React, { useState, useEffect } from "react";
import { FieldDescriptor, FieldError, FieldMapping } from "@internship-copilot/types";
import { CONFIDENCE_THRESHOLDS } from "@internship-copilot/config";
import { mapFieldDeterministically, verifyAndCorrectFieldAnswers } from "../content/field-mapper";
import { getSessionState, setSessionState } from "../storage/chrome-storage";
import { Shield, Play, RefreshCw, Sparkles, Lock, Layers, AlertCircle, CheckCircle2, LogIn, ChevronDown, FileText, Upload, Scan } from "lucide-react";

const BACKEND_BASE_URL = "http://localhost:3000";

const isFieldRequired = (f: FieldDescriptor): boolean =>
  Boolean(f.required) || /\*\s*$/.test(f.rawLabel || "");

const isEmptyValue = (v: unknown): boolean =>
  v === null ||
  v === undefined ||
  (typeof v === "string" && v.trim() === "") ||
  (Array.isArray(v) && v.length === 0);

const getMissingRequiredFields = (fields: FieldDescriptor[], mappings: FieldMapping[]): FieldDescriptor[] =>
  fields.filter((f, i) => f.type !== "file" && isFieldRequired(f) && isEmptyValue(mappings[i]?.valueToFill));

const findSavedAnswer = (profile: any, f: FieldDescriptor): string | null => {
  const value = profile?.savedAnswers?.[f.normalizedLabel]?.value;
  if (typeof value !== "string" || !value.trim()) return null;
  if ((f.type === "radio" || f.type === "select") && f.options?.length) {
    const v = value.toLowerCase();
    if (!f.options.some((o) => o.label.toLowerCase() === v || o.value.toLowerCase() === v)) return null;
  }
  return value;
};
//sanjeevpaswan1803t@gmail.com

export const App: React.FC = () => {
  const [authState, setAuthState] = useState<{
    loading: boolean;
    authenticated: boolean;
    user: { id: string; email: string; name: string | null } | null;
  }>({
    loading: true,
    authenticated: false,
    user: null,
  });

  const [userProfile, setUserProfile] = useState<any>(null);
  const [fields, setFields] = useState<FieldDescriptor[]>([]);
  const [mappings, setMappings] = useState<FieldMapping[]>([]);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [isFilling, setIsFilling] = useState<boolean>(false);
  const [showFillCursor, setShowFillCursor] = useState<boolean>(true);
  const [closedRootsCount, setClosedRootsCount] = useState<number>(0);
  const [hasResumeField, setHasResumeField] = useState<boolean>(false);
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [fillSummary, setFillSummary] = useState<{
    filled: number;
    skipped: number;
    resumeUploaded?: boolean;
    resumeName?: string;
    corrections?: Array<{ fieldId: string; rawLabel: string; previousValue: any; correctedValue: any; warningMessage: string }>;
  } | null>(null);

  const [savedResume, setSavedResume] = useState<{
    id: string;
    filename: string;
    fileData?: string;
    mimeType?: string;
    category?: string;
    sizeBytes?: number;
  } | null>(null);

  const [allUserDocs, setAllUserDocs] = useState<any[]>([]);

  // Check authentication status and fetch user profile
  const checkAuthAndFetchProfile = async () => {
    setAuthState((prev) => ({ ...prev, loading: true }));
    try {
      const authRes = await fetch(`${BACKEND_BASE_URL}/api/auth/me`, {
        credentials: "include",
      });

      if (authRes.ok) {
        const authData = await authRes.json();
        if (authData.authenticated && authData.user) {
          setAuthState({
            loading: false,
            authenticated: true,
            user: authData.user,
          });

          // 1. Fetch full profile data
          const profRes = await fetch(`${BACKEND_BASE_URL}/api/profile`, {
            credentials: "include",
          });
          if (profRes.ok) {
            const profData = await profRes.json();
            setUserProfile(profData.profile || null);
          }

          // 2. Fetch all documents & preferred resume stored in the database
          try {
            const docsRes = await fetch(`${BACKEND_BASE_URL}/api/documents`, {
              credentials: "include",
            });
            if (docsRes.ok) {
              const docsData = await docsRes.json();
              const docsList = docsData.documents || [];
              setAllUserDocs(docsList);
              const preferred = docsList.find((d: any) => d.isPreferred) || docsList[0] || null;
              setSavedResume(preferred);
            }
          } catch (e) {
            console.warn("Could not fetch documents:", e);
          }

          return;
        }
      }

      setAuthState({
        loading: false,
        authenticated: false,
        user: null,
      });
    } catch {
      // Local development fallback
      setAuthState({
        loading: false,
        authenticated: false,
        user: null,
      });
    }
  };

  useEffect(() => {
    checkAuthAndFetchProfile();
    getSessionState().then((state) => {
      if (state.detectedFields && state.detectedFields.length > 0) {
        setFields(state.detectedFields);
        setMappings(state.currentMappings || []);
      }
    });
  }, []);

  const openDashboardLogin = () => {
    if (typeof chrome !== "undefined" && chrome.tabs) {
      chrome.tabs.create({ url: `${BACKEND_BASE_URL}/login` });
    } else {
      window.open(`${BACKEND_BASE_URL}/login`, "_blank");
    }
  };

  const openDashboardProfile = () => {
    if (typeof chrome !== "undefined" && chrome.tabs) {
      chrome.tabs.create({ url: `${BACKEND_BASE_URL}/profile` });
    } else {
      window.open(`${BACKEND_BASE_URL}/profile`, "_blank");
    }
  };

  /**
   * Resolves value from user's real saved profile based on path
   */
  const resolveProfileValue = (path: string | null | undefined): string | null => {
    if (!path || !userProfile) return null;
    const personal = userProfile.personal || {};
    const links = userProfile.links || {};

    switch (path) {
      case "personal.title":
        return personal.gender?.toLowerCase() === "female" ? "Ms." : "Mr.";
      case "personal.firstName":
        return personal.firstName || null;
      case "personal.middleName":
        return personal.middleName || null;
      case "personal.lastName":
        return personal.lastName || null;
      case "personal.fullName":
        return `${personal.firstName || ""} ${personal.lastName || ""}`.trim() || null;
      case "personal.email":
        return personal.email || null;
      case "personal.phone":
        return personal.phone || null;
      case "personal.countryCode":
        return personal.countryCode || "+91";
      case "personal.gender":
        return personal.gender || "Male";
      case "personal.nationality":
        return personal.nationality || "Indian";
      case "personal.dob":
        return personal.dob || null;
      case "personal.location":
        return [personal.city || "Greater Noida", personal.state || "Uttar Pradesh", personal.country || "India"].filter(Boolean).join(", ");
      case "personal.country":
        return personal.country || "India";
      case "personal.state":
        return personal.state || null;
      case "personal.city":
        return personal.city || null;
      case "personal.postalCode":
        return personal.postalCode || null;
      case "personal.address":
        return personal.address || null;
      case "links.linkedin":
        return links.linkedin || null;
      case "links.github":
        return links.github || null;
      case "links.portfolio":
        return links.portfolio || null;
      case "education.institution":
        return (userProfile as any)?.education?.institution || (userProfile as any)?.currentEducation?.institution || null;
      case "education.degree":
        return (userProfile as any)?.education?.degree || (userProfile as any)?.currentEducation?.degree || "B.Tech";
      case "education.major":
        return (userProfile as any)?.education?.major || (userProfile as any)?.currentEducation?.major || "Computer Science and Engineering";
      case "education.specialization":
        return (userProfile as any)?.education?.specialization || (userProfile as any)?.currentEducation?.specialization || "Artificial Intelligence";
      case "education.currentYear":
        return (userProfile as any)?.education?.currentYear ? String((userProfile as any).education.currentYear) : "3rd Year";
      case "education.currentSemester":
        return (userProfile as any)?.education?.currentSemester ? String((userProfile as any).education.currentSemester) : "6th Semester";
      case "education.graduationYear":
        return (userProfile as any)?.education?.graduationYear ? String((userProfile as any).education.graduationYear) : "2026";
      case "education.cgpa":
        return (userProfile as any)?.education?.cgpa ? String((userProfile as any).education.cgpa) : "8.9";
      case "education.cgpaScale":
        return (userProfile as any)?.education?.cgpaScale ? String((userProfile as any).education.cgpaScale) : "10.0";
      case "secondary.percentageOrCgpa":
        return (userProfile as any)?.secondary?.percentageOrCgpa ? String((userProfile as any).secondary.percentageOrCgpa) : "92.4";
      case "secondary.passingYear":
        return (userProfile as any)?.secondary?.passingYear ? String((userProfile as any).secondary.passingYear) : "2020";
      case "secondary.schoolName":
        return (userProfile as any)?.secondary?.schoolName || "St. Xavier's High School";
      case "higherSecondary.percentageOrCgpa":
        return (userProfile as any)?.higherSecondary?.percentageOrCgpa ? String((userProfile as any).higherSecondary.percentageOrCgpa) : "94.8";
      case "higherSecondary.passingYear":
        return (userProfile as any)?.higherSecondary?.passingYear ? String((userProfile as any).higherSecondary.passingYear) : "2022";
      case "higherSecondary.schoolName":
        return (userProfile as any)?.higherSecondary?.schoolName || "DPS International School";
      case "higherSecondary.stream":
        return (userProfile as any)?.higherSecondary?.stream || "Science (PCM)";
      case "skills":
        const rawSkills = (userProfile as any)?.skills || (userProfile as any)?.skillsList || [];
        if (Array.isArray(rawSkills) && rawSkills.length > 0) {
          return rawSkills.map((s: any) => (typeof s === "string" ? s : s?.name || "")).filter(Boolean).join(", ");
        }
        return "React, TypeScript, Next.js, Python, Node.js, Tailwind CSS, Docker, PostgreSQL";
      case "work.experienceYears":
        return "0";
      case "work.experienceMonths":
        return "0 months";
      case "work.currentCtc":
        return "0";
      case "work.expectedCtc":
        return "3";
      case "work.noticePeriod":
        return "Immediate Joiner";
      case "personal.password":
      case "personal.confirmPassword":
        return (personal as any)?.password || "Password@12345";
      case "documents.resume":
        return savedResume?.filename || (userProfile as any)?.resumeFileName || `${personal.firstName || "Sanjeev"}_${personal.lastName || "Kumar"}_Resume.pdf`;
      case "documents.secondaryMarksheet":
        return (userProfile as any)?.secondaryMarksheetFileName || `${personal.firstName || "Sanjeev"}_${personal.lastName || "Kumar"}_10th_Marksheet.pdf`;
      case "documents.higherSecondaryMarksheet":
        return (userProfile as any)?.higherSecondaryMarksheetFileName || `${personal.firstName || "Sanjeev"}_${personal.lastName || "Kumar"}_12th_Marksheet.pdf`;
      case "documents.collegeTranscript":
        return (userProfile as any)?.transcriptFileName || `${personal.firstName || "Sanjeev"}_${personal.lastName || "Kumar"}_College_Transcript.pdf`;
      case "documents.coverLetter":
        return (userProfile as any)?.coverLetterFileName || `${personal.firstName || "Sanjeev"}_${personal.lastName || "Kumar"}_Cover_Letter.pdf`;
      case "work.interests":
        return "Technology / IT, Engineering";
      default:
        return null;
    }
  };


  const ensureContentScriptInjected = async (tabId: number): Promise<boolean> => {
    try {
      if (typeof chrome === "undefined" || !chrome.scripting) return false;
      // Ping content script first
      const isAlive = await new Promise<boolean>((resolve) => {
        try {
          chrome.tabs.sendMessage(tabId, { type: "PING" }, (res) => {
            if (chrome.runtime.lastError || !res?.pong) {
              resolve(false);
            } else {
              resolve(true);
            }
          });
        } catch {
          resolve(false);
        }
      });

      if (!isAlive) {
        await chrome.scripting.executeScript({
          target: { tabId, allFrames: true },
          files: ["content.js"],
        });
        await new Promise((r) => setTimeout(r, 100));
      }
      return true;
    } catch (err) {
      console.warn("Could not inject content script:", err);
      return false;
    }
  };


  const [savingFieldId, setSavingFieldId] = useState<string | null>(null);
  const [savedFieldIds, setSavedFieldIds] = useState<Set<string>>(new Set());

  const focusField = async (fieldId: string) => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;
      await ensureContentScriptInjected(tab.id);
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        func: (id: string) => {
          const fn = (window as any).__IHATEFORM_FOCUS_FIELD__;
          return typeof fn === "function" ? fn(id) : null;
        },
        args: [fieldId],
      });
    } catch (err) {
      console.warn("focusField failed:", err);
    }
  };

  const handleSaveAnswer = async (field: FieldDescriptor, value: string) => {
    if (!field.normalizedLabel || !value.trim()) return;
    setSavingFieldId(field.id);
    try {
      const res = await fetch(`${BACKEND_BASE_URL}/api/profile/answers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          normalizedLabel: field.normalizedLabel,
          rawLabel: field.rawLabel,
          value: value.trim(),
          type: field.type,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setUserProfile((prev: any) => ({ ...(prev || {}), savedAnswers: data.savedAnswers }));
        setSavedFieldIds((prev) => new Set(prev).add(field.id));
      }
    } catch (err) {
      console.warn("Save answer failed:", err);
    } finally {
      setSavingFieldId(null);
    }
  };


  const [isGeneratingAI, setIsGeneratingAI] = useState<boolean>(false);

  const handleToggleCheckboxOption = (fieldIndex: number, optionValue: string) => {
    setMappings((prev) => {
      const updated = [...prev];
      if (updated[fieldIndex]) {
        const currentVal = String(updated[fieldIndex].valueToFill || "");
        const currentItems = currentVal.split(/[,;|\n]/).map((s) => s.trim()).filter(Boolean);
        const lowerItems = currentItems.map((s) => s.toLowerCase());
        const targetLower = optionValue.toLowerCase().trim();

        let newItems: string[];
        if (lowerItems.includes(targetLower)) {
          newItems = currentItems.filter((s) => s.toLowerCase() !== targetLower);
        } else {
          newItems = [...currentItems, optionValue];
        }

        const newValue = newItems.join(", ");
        updated[fieldIndex] = {
          ...updated[fieldIndex],
          valueToFill: newValue,
          action: newValue ? "fill" : "review",
          confidence: Math.max(updated[fieldIndex].confidence, 0.95),
          source: "user_override",
        };
      }
      return updated;
    });
  };

  const handleOptionOverride = (fieldIndex: number, newValue: string) => {
    setMappings((prev) => {
      const updated = [...prev];
      if (updated[fieldIndex]) {
        updated[fieldIndex] = {
          ...updated[fieldIndex],
          valueToFill: newValue,
          action: "fill",
          confidence: Math.max(updated[fieldIndex].confidence, 0.95),
        };
      }
      return updated;
    });
  };

  const handleValueChange = (fieldIndex: number, newValue: string) => {
    setMappings((prev) => {
      const updated = [...prev];
      if (updated[fieldIndex]) {
        updated[fieldIndex] = {
          ...updated[fieldIndex],
          valueToFill: newValue,
          action: newValue.trim() ? "fill" : "review",
          confidence: newValue.trim() ? 0.95 : 0.5,
          source: "user_override",
        };
      }
      return updated;
    });
  };

  const handleGenerateAIAnswers = async (targetFields?: FieldDescriptor[], baseMappings?: FieldMapping[]) => {
    const fieldsToProcess = targetFields || fields;
    const existingMappings = baseMappings || mappings;

    if (!fieldsToProcess || fieldsToProcess.length === 0) return;

    setIsGeneratingAI(true);
    try {
      // Filter fields: NVIDIA NIM only suggests for fields whose details are NOT stored in the Database
      const unmappedFields = fieldsToProcess.filter((f, idx) => {
        const m = existingMappings[idx];
        // If this field is already mapped to a static database profile property, NEVER send to AI!
        if (m?.profilePath) return false;

        // Also check if field matches any standard database profile field
        const combined = `${f.normalizedLabel} ${f.rawLabel} ${f.name || ""} ${f.nearbyText || ""}`.toLowerCase();
        const isStaticDatabaseField = /first[\s_-]?name|last[\s_-]?name|middle[\s_-]?name|full[\s_-]?name|e[\s_-]?mail|phone|mobile|country[\s_-]?code|dial[\s_-]?code|isd[\s_-]?code|gender|\bsex\b|nationality|citizenship|\btitle\b|salutation|prefix|date[\s_-]?of[\s_-]?birth|d[\s_-]?o[\s_-]?b|pincode|postal|zip|state|province|city|country|address|street|linkedin|github|password/i.test(combined);

        if (isStaticDatabaseField) {
          return false;
        }

        return !m || m.valueToFill === null || m.valueToFill === undefined || m.valueToFill === "" || m.action === "unsupported" || m.action === "review";
      });

      if (unmappedFields.length === 0) {
        setIsGeneratingAI(false);
        const missing = getMissingRequiredFields(fieldsToProcess, existingMappings);
        if (missing.length > 0) void focusField(missing[0].id);
        return;
      }

      const res = await fetch(`${BACKEND_BASE_URL}/api/autofill/generate-answers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          fields: unmappedFields,
          profile: userProfile,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const aiMappings: FieldMapping[] = data.mappings || [];

        const mergedMappings = fieldsToProcess.map((f, idx) => {
          const current = existingMappings[idx];
          // If current is a database profile field, preserve deterministic database value
          if (current?.profilePath) return current;

          const combined = `${f.normalizedLabel} ${f.rawLabel} ${f.name || ""}`.toLowerCase();
          const isStaticDatabaseField = /first[\s_-]?name|last[\s_-]?name|middle[\s_-]?name|full[\s_-]?name|e[\s_-]?mail|phone|mobile|country[\s_-]?code|dial[\s_-]?code|isd[\s_-]?code|gender|\bsex\b|nationality|citizenship|\btitle\b|salutation|prefix|date[\s_-]?of[\s_-]?birth|d[\s_-]?o[\s_-]?b|pincode|postal|zip|state|province|city|country|address|street|linkedin|github|password/i.test(combined);
          if (isStaticDatabaseField) return current;

          const aiMatch = aiMappings.find((aim) => aim.fieldId === f.id);

          if (aiMatch && aiMatch.valueToFill !== null && aiMatch.valueToFill !== undefined) {
            return {
              ...current,
              ...aiMatch,
              action: "fill" as const,
              source: "ai_strong" as const,
            };
          }

          return current;
        });

        const combinedAnswerMap: Record<string, string | boolean | string[]> = {};
        for (const m of mergedMappings) {
          if (m.valueToFill !== null && m.valueToFill !== undefined) {
            combinedAnswerMap[m.fieldId] = m.valueToFill;
          }
        }
        const auditedAnswers = verifyAndCorrectFieldAnswers(fieldsToProcess, combinedAnswerMap, userProfile);
        const finalMappings = mergedMappings.map((m) => {
          if (auditedAnswers[m.fieldId] !== undefined) {
            return { ...m, valueToFill: auditedAnswers[m.fieldId], action: "fill" as const };
          }
          return m;
        });

        setMappings(finalMappings);
        const missingAfterAI = getMissingRequiredFields(fieldsToProcess, finalMappings);
        if(missingAfterAI.length > 0)void focusField(missingAfterAI[0].id);
        await setSessionState({
          detectedFields: fieldsToProcess,
          currentMappings: finalMappings,
        });
      }
    } catch (err) {
      console.warn("AI generation failed or offline:", err);
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const handleScanForm = async () => {
    setIsScanning(true);
    setFillSummary(null);
    setErrors([]);

    try {
      if (typeof chrome !== "undefined" && chrome.tabs) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          await ensureContentScriptInjected(tab.id);

          // Multi-frame scan across top frame and floating iframe/modal frames
          let allFields: FieldDescriptor[] = [];
          let totalClosedRoots = 0;
          let hasResume = false;

          try {
            if (chrome.scripting) {
              const execResults = await chrome.scripting.executeScript({
                target: { tabId: tab.id, allFrames: true },
                func: () => {
                  if (typeof (window as any).__IHATEFORM_SCAN_WITH_STATS__ === "function") {
                    return (window as any).__IHATEFORM_SCAN_WITH_STATS__();
                  }
                  return null;
                },
              });

              if (execResults && execResults.length > 0) {
                for (const res of execResults) {
                  if (res.result && Array.isArray(res.result.fields)) {
                    allFields.push(...res.result.fields);
                    totalClosedRoots += res.result.closedShadowRootsDetected || 0;
                    if (res.result.hasResumeField) hasResume = true;
                  }
                }
              }
            }
          } catch (scriptErr) {
            console.warn("Direct multi-frame script scan failed, falling back to message dispatch:", scriptErr);
          }

          // Message-based fallback if scripting execution returned no fields
          if (allFields.length === 0) {
            await new Promise<void>((resolve) => {
              chrome.tabs.sendMessage(
                tab.id!,
                { type: "SCAN_FORM" },
                (response) => {
                  if (!chrome.runtime.lastError && response && response.fields) {
                    allFields = response.fields;
                    totalClosedRoots = response.closedShadowRootsDetected || 0;
                    hasResume = Boolean(response.hasResumeField);
                  }
                  resolve();
                }
              );
            });
          }

          const hasResumeInFields = allFields.some(
            (f) => f.type === "file" || /resume|cv|curriculum|marksheet|transcript|cover[\s_-]?letter|upload/i.test(f.rawLabel)
          );

          setFields(allFields);
          setClosedRootsCount(totalClosedRoots);
          setHasResumeField(hasResume || hasResumeInFields);

          // 1. Map fields deterministically from user profile
          const initialMappings: FieldMapping[] = allFields.map((f) => {
            const m = mapFieldDeterministically(f, null);
            const realVal = resolveProfileValue(m.profilePath);
            const saved = !m.profilePath ? findSavedAnswer(userProfile, f) : null;
            if (saved) {
              return {
                ...m,
                valueToFill: saved,
                action: "fill" as const,
                confidence: 0.95,
                source: "user_override" as const,
                reason: "Reused saved answer from profile",
              };
            }
            return {
              ...m,
              valueToFill: realVal,
              action: realVal ? "fill" : m.action,
              confidence: realVal ? 0.98 : m.confidence,
            };
          });

          setMappings(initialMappings);

          await setSessionState({
            detectedFields: allFields,
            currentMappings: initialMappings,
          });

          setIsScanning(false);

          if (allFields.length > 0) {
            // 2. Automatically generate NVIDIA NIM AI answers for remaining fields
            handleGenerateAIAnswers(allFields, initialMappings);
          }
        } else {
          setIsScanning(false);
        }
      } else {
        setIsScanning(false);
      }
    } catch {
      setIsScanning(false);
    }
  };

  const handleAutofill = async () => {
    setIsFilling(true);
    setErrors([]);

    // Update mappings with latest profile values or AI answers before autofilling
    const initialEnriched = mappings.map((m) => {
      const profileVal = resolveProfileValue(m.profilePath);
      const targetVal = m.valueToFill !== undefined && m.valueToFill !== null ? m.valueToFill : profileVal;

      return {
        ...m,
        valueToFill: targetVal,
      };
    });

    const prefillAnswerMap: Record<string, string | boolean | string[]> = {};
    for (const m of initialEnriched) {
      if (m.valueToFill !== null && m.valueToFill !== undefined) {
        prefillAnswerMap[m.fieldId] = m.valueToFill;
      }
    }
    const prefillAudited = verifyAndCorrectFieldAnswers(fields, prefillAnswerMap, userProfile);
    const enrichedMappings = initialEnriched.map((m) => {
      if (prefillAudited[m.fieldId] !== undefined) {
        return { ...m, valueToFill: prefillAudited[m.fieldId], action: "fill" as const };
      }
      return m;
    });

    const missingAfterFill = getMissingRequiredFields(fields, enrichedMappings);

if (missingAfterFill.length > 0) {
  void focusField(missingAfterFill[0].id);
}

    try {
      if (typeof chrome !== "undefined" && chrome.tabs) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          await ensureContentScriptInjected(tab.id);

          let totalFilled: string[] = [];
          let totalSkipped: string[] = [];
          let allErrors: FieldError[] = [];
          let allCorrections: any[] = [];
          let resumeUploaded = false;
          let resumeName = "";

          try {
            if (chrome.scripting) {
              const execResults = await chrome.scripting.executeScript({
                target: { tabId: tab.id, allFrames: true },
                func: async (mappingsArg, profileArg, resumeArg, allDocsArg, optionsArg) => {
                  if (typeof (window as any).__IHATEFORM_AUTOFILL__ === "function") {
                    return await (window as any).__IHATEFORM_AUTOFILL__(mappingsArg, profileArg, resumeArg, allDocsArg, optionsArg);
                  }
                  return null;
                },
                args: [enrichedMappings, userProfile, savedResume, allUserDocs, { showCursor: showFillCursor }],
              });

              if (execResults && execResults.length > 0) {
                for (const res of execResults) {
                  if (res.result) {
                    if (Array.isArray(res.result.filledFieldIds)) {
                      totalFilled.push(...res.result.filledFieldIds);
                    }
                    if (Array.isArray(res.result.skippedFieldIds)) {
                      totalSkipped.push(...res.result.skippedFieldIds);
                    }
                    if (Array.isArray(res.result.errors)) {
                      allErrors.push(...res.result.errors);
                    }
                    if (Array.isArray(res.result.corrections)) {
                      allCorrections.push(...res.result.corrections);
                    }
                    if (res.result.resumeUpload?.uploaded) {
                      resumeUploaded = true;
                      resumeName = res.result.resumeUpload.fileName || "";
                    }
                  }
                }
              }
            }
          } catch (scriptErr) {
            console.warn("Direct multi-frame autofill failed, using message fallback:", scriptErr);
          }

          if (totalFilled.length === 0 && totalSkipped.length === 0 && allErrors.length === 0) {
            await new Promise<void>((resolve) => {
              chrome.tabs.sendMessage(
                tab.id!,
                {
                  type: "FILL_FIELDS",
                  payload: { mappings: enrichedMappings, profile: userProfile, savedResume, allDocuments: allUserDocs },
                },
                (response) => {
                  if (!chrome.runtime.lastError && response) {
                    totalFilled = response.filledFieldIds || [];
                    totalSkipped = response.skippedFieldIds || [];
                    allErrors = response.errors || [];
                    allCorrections = response.corrections || [];
                    resumeUploaded = response.resumeUpload?.uploaded || false;
                    resumeName = response.resumeUpload?.fileName || "";
                  }
                  resolve();
                }
              );
            });
          }

          setFillSummary({
            filled: totalFilled.length,
            skipped: totalSkipped.length,
            resumeUploaded,
            resumeName,
            corrections: allCorrections,
          });

          if (allCorrections.length > 0) {
            setMappings((prev) =>
              prev.map((m) => {
                const corr = allCorrections.find((c: any) => c.fieldId === m.fieldId);
                if (corr) {
                  return {
                    ...m,
                    valueToFill: corr.correctedValue,
                    reason: `Auto-corrected (${corr.warningMessage})`,
                  };
                }
                return m;
              })
            );
          }

          if (allErrors.length > 0) {
            setErrors(allErrors);
          }

          setIsFilling(false);
        } else {
          setIsFilling(false);
        }
      } else {
        setIsFilling(false);
      }
    } catch {
      setIsFilling(false);
    }
  };

  const [isUploadingResume, setIsUploadingResume] = useState<boolean>(false);

  const handleUploadResumeOnly = async () => {
    setIsUploadingResume(true);
    try {
      if (typeof chrome !== "undefined" && chrome.tabs) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          await ensureContentScriptInjected(tab.id);

          chrome.tabs.sendMessage(
            tab.id,
            {
              type: "UPLOAD_RESUME",
              payload: { profile: userProfile, savedResume },
            },
            (response) => {
              setIsUploadingResume(false);
              if (response?.uploadResult?.uploaded) {
                setFillSummary((prev) => ({
                  filled: prev?.filled || 0,
                  skipped: prev?.skipped || 0,
                  resumeUploaded: true,
                  resumeName: response.uploadResult.fileName,
                  corrections: prev?.corrections || [],
                }));
              }
            }
          );
        } else {
          setIsUploadingResume(false);
        }
      } else {
        setIsUploadingResume(false);
      }
    } catch {
      setIsUploadingResume(false);
    }
  };

  // If loading auth
  if (authState.loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 text-slate-900 p-6 text-center">
        <RefreshCw className="w-6 h-6 animate-spin text-[#0066FF] mb-3" />
        <p className="text-xs text-slate-500 font-medium">Verifying session with I Hate Form...</p>
      </div>
    );
  }

  // If NOT authenticated, show clean login instruction popup
  if (!authState.authenticated) {
    return (
      <div className="flex flex-col min-h-screen bg-slate-50 text-slate-900 p-4 select-none">
        {/* Header */}
        <header className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-50 text-[#0066FF] rounded-xl border border-blue-200 shadow-xs">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-sm tracking-tight text-slate-900">I Hate Form</h1>
              <p className="text-[10px] text-slate-500 font-medium">AI Application Copilot</p>
            </div>
          </div>
          <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
            Not Logged In
          </span>
        </header>

        {/* Lock Screen Body */}
        <div className="my-auto py-8 text-center space-y-4">
          <div className="inline-flex items-center justify-center p-4 bg-blue-50 text-[#0066FF] rounded-2xl border border-blue-200 mx-auto shadow-xs">
            <Lock className="w-8 h-8" />
          </div>

          <div className="space-y-1.5">
            <h2 className="text-base font-bold text-slate-900">Log In to I Hate Form</h2>
            <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto font-medium">
              Please sign in on the dashboard and configure your profile information to enable autofilling.
            </p>
          </div>

          <div className="space-y-2.5 pt-3">
            <button
              onClick={openDashboardLogin}
              className="w-full py-3 px-4 bg-[#0066FF] hover:bg-[#0052CC] active:scale-98 text-white rounded-full text-xs font-bold shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 cursor-pointer transition"
            >
              <LogIn className="w-4 h-4" />
              Open Dashboard & Sign In
            </button>

            <button
              onClick={checkAuthAndFetchProfile}
              className="w-full py-2.5 px-3 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition shadow-2xs"
            >
              <RefreshCw className="w-3.5 h-3.5 text-[#0066FF]" />
              Refresh Login Status
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-200 text-center text-[11px] text-slate-400 font-medium">
          I Hate Form Cloud Engine • Secure Sync
        </div>
      </div>
    );
  }

  const highConfidenceCount = mappings.filter(
    (m) => (m.valueToFill !== null && m.valueToFill !== undefined && m.valueToFill !== "") && (m.confidence >= CONFIDENCE_THRESHOLDS.AUTO_FILL_REVIEW || m.action === "fill")
  ).length;
  const reviewCount = mappings.filter(
    (m) =>
      (!m.valueToFill || m.action === "review") &&
      m.confidence >= CONFIDENCE_THRESHOLDS.ASK_USER &&
      m.confidence < CONFIDENCE_THRESHOLDS.AUTO_FILL_REVIEW
  ).length;
  const askCount = mappings.filter(
    (m) =>
      (!m.valueToFill || m.action === "review") &&
      m.confidence >= CONFIDENCE_THRESHOLDS.ASK_USER &&
      m.confidence < CONFIDENCE_THRESHOLDS.AUTO_FILL_REVIEW
  ).length;
  const unsupportedCount = mappings.filter(
    (m) => (m.valueToFill === null || m.valueToFill === undefined || m.valueToFill === "") && m.confidence < CONFIDENCE_THRESHOLDS.ASK_USER
  ).length;

  const iframeFieldsCount = fields.filter((f) => f.frameId > 0).length;

  const missingRequired = getMissingRequiredFields(fields, mappings);

  const activeResumeDisplayName = savedResume?.filename || (userProfile?.personal
    ? `${userProfile.personal.firstName}_${userProfile.personal.lastName}_Resume.pdf`
    : "Sanjeev_Kumar_Resume.pdf");

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 text-slate-900 p-4 select-none">
      {/* Header */}
      <header className="flex items-center justify-between pb-3 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-blue-50 text-[#0066FF] rounded-xl border border-blue-200 shadow-xs">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-sm tracking-tight text-slate-900">I Hate Form</h1>
            <p className="text-[10px] text-slate-500 font-medium truncate max-w-[140px]">
              {authState.user?.name || authState.user?.email}
            </p>
          </div>
        </div>
        <button
          onClick={openDashboardProfile}
          title="Open Dashboard & Manage Resumes"
          className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[10px] font-bold transition cursor-pointer"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
          Connected
        </button>
      </header>

      {/* Control Buttons */}
      <div className="grid grid-cols-2 gap-2 mt-3">
        <button
          onClick={handleScanForm}
          disabled={isScanning}
          className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-white hover:bg-slate-100 active:scale-98 text-slate-800 rounded-xl text-xs font-semibold border border-slate-200 transition cursor-pointer shadow-2xs disabled:opacity-50"
        >
          <Scan className={`w-3.5 h-3.5 ${isScanning ? "animate-spin text-[#0066FF]" : "text-slate-500"}`} />
          <span>{isScanning ? "Scanning..." : "Scan Fields"}</span>
        </button>

        <button
          onClick={handleAutofill}
          disabled={isFilling || fields.length === 0}
          className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-[#0066FF] hover:bg-[#0052CC] active:scale-98 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 transition cursor-pointer disabled:opacity-50"
        >
          <Play className={`w-3.5 h-3.5 ${isFilling ? "animate-spin" : "fill-current"}`} />
          <span>{isFilling ? "Autofilling..." : "Autofill Valid"}</span>
        </button>
      </div>

      {/* Animated Cursor Toggle (§6.6) */}
      <div className="mt-2 flex items-center justify-between px-1 text-[11px] text-slate-600">
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showFillCursor}
            onChange={(e) => setShowFillCursor(e.target.checked)}
            className="w-3.5 h-3.5 rounded text-[#0066FF] border-slate-300 focus:ring-[#0066FF] cursor-pointer"
          />
          <span className="font-medium text-slate-700">Animated Typing Cursor</span>
        </label>
        <span className="text-[10px] text-slate-400">Cosmetic</span>
      </div>

      {/* NVIDIA NIM AI Generate Answers Button */}
      {fields.length > 0 && (
        <button
          onClick={() => handleGenerateAIAnswers()}
          disabled={isGeneratingAI}
          className="w-full mt-2.5 flex items-center justify-center gap-2 py-2.5 px-3 bg-[#0066FF] hover:bg-[#0052CC] active:scale-98 transition text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 border border-blue-400/30 disabled:opacity-50 cursor-pointer"
        >
          <Sparkles className={`w-3.5 h-3.5 ${isGeneratingAI ? "animate-spin text-amber-300" : "text-amber-300 fill-amber-300"}`} />
          <span>{isGeneratingAI ? "NVIDIA NIM Generating Answers..." : "Auto-Generate with AI"}</span>
        </button>
      )}

      {/* Frame & Shadow DOM Badges */}
      {fields.length > 0 && (
        <div className="mt-2.5 flex items-center gap-1.5 flex-wrap text-[11px]">
          {iframeFieldsCount > 0 && (
            <div className="flex items-center gap-1 px-2.5 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 rounded-full font-semibold">
              <Layers className="w-3 h-3" />
              <span>{iframeFieldsCount} iframe fields</span>
            </div>
          )}
          {closedRootsCount > 0 && (
            <div className="flex items-center gap-1 px-2.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full font-semibold">
              <AlertCircle className="w-3 h-3" />
              <span>{closedRootsCount} closed shadow root</span>
            </div>
          )}
        </div>
      )}

      {fields.length > 0 && missingRequired.length > 0 && (
        <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-rose-700 font-bold">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>
              {missingRequired.length} required {missingRequired.length === 1 ? "field is" : "fields are"} missing answers
            </span>
          </div>
          <button
            onClick={() => focusField(missingRequired[0].id)}
            className="text-[10px] px-2.5 py-1 bg-white text-rose-700 border border-rose-200 rounded-full font-bold cursor-pointer"
          >
            Go to first
          </button>
        </div>
      )}

      {/* Summary Metrics */}
      {fields.length > 0 && (
        <div className="grid grid-cols-4 gap-2 mt-3 text-center">
          <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-xl shadow-2xs">
            <div className="text-sm font-extrabold text-emerald-700">{highConfidenceCount}</div>
            <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Ready</div>
          </div>
          <div className="p-2 bg-amber-50 border border-amber-200 rounded-xl shadow-2xs">
            <div className="text-sm font-extrabold text-amber-700">{reviewCount}</div>
            <div className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Review</div>
          </div>
          <div className="p-2 bg-blue-50 border border-blue-200 rounded-xl shadow-2xs">
            <div className="text-sm font-extrabold text-blue-700">{askCount}</div>
            <div className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Ask</div>
          </div>
          <div className="p-2 bg-rose-50 border border-rose-200 rounded-xl shadow-2xs">
            <div className="text-sm font-extrabold text-rose-700">{unsupportedCount}</div>
            <div className="text-[10px] font-bold text-rose-600 uppercase tracking-wider">Skip</div>
          </div>
        </div>
      )}

      {/* Resume PDF Auto-Upload Indicator */}
      {hasResumeField && (
        <div className="mt-3 p-3 bg-white border border-slate-200 rounded-xl text-xs flex items-center justify-between gap-2 shadow-sm">
          <div className="flex items-center gap-1.5 text-slate-800 font-semibold truncate flex-1">
            <FileText className="w-3.5 h-3.5 text-[#0066FF] shrink-0" />
            <span className="truncate">
              {activeResumeDisplayName}
            </span>
            {savedResume && (
              <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-bold shrink-0">
                DB Resume
              </span>
            )}
          </div>
          <button
            onClick={handleUploadResumeOnly}
            disabled={isUploadingResume}
            className="text-[10px] px-2.5 py-1 bg-blue-50 hover:bg-blue-100 active:scale-95 text-[#0066FF] border border-blue-200 rounded-full font-bold shrink-0 cursor-pointer transition flex items-center gap-1"
          >
            <Upload className="w-3 h-3" />
            <span>{isUploadingResume ? "Uploading..." : "Upload Resume"}</span>
          </button>
        </div>
      )}

      {/* Fill Summary Alert */}
      {fillSummary && (
        <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs space-y-1.5 text-emerald-900 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-bold">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Autofilled {fillSummary.filled} fields</span>
            </div>
            <span className="text-slate-500 font-medium">({fillSummary.skipped} skipped)</span>
          </div>
          {fillSummary.resumeUploaded && (
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 pl-5 font-semibold">
              <FileText className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Resume PDF "{fillSummary.resumeName}" uploaded</span>
            </div>
          )}
          {fillSummary.corrections && fillSummary.corrections.length > 0 && (
            <div className="mt-2 pt-2 border-t border-emerald-200 text-[11px] space-y-1 text-slate-800">
              <div className="flex items-center gap-1.5 font-bold text-blue-700">
                <Sparkles className="w-3.5 h-3.5 shrink-0 text-[#0066FF]" />
                <span>Auto-corrected {fillSummary.corrections.length} field {fillSummary.corrections.length === 1 ? "warning" : "warnings"} with NVIDIA AI:</span>
              </div>
              {fillSummary.corrections.map((c, i) => (
                <div key={i} className="pl-5 text-slate-700 font-medium">
                  • <strong className="text-slate-900">{c.rawLabel || "Field"}</strong>: <span className="line-through text-slate-400">{String(c.previousValue)}</span> &rarr; <span className="font-bold text-emerald-700">{String(c.correctedValue)}</span> <span className="text-[10px] text-amber-700 font-semibold">({c.warningMessage})</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Error Warnings */}
      {errors.length > 0 && (
        <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs space-y-1 shadow-sm">
          <div className="font-bold text-amber-800 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
            <span>Manual Confirmation Needed:</span>
          </div>
          {errors.map((err, i) => (
            <p key={i} className="text-[11px] text-amber-700 pl-5 font-medium">
              • {err.message}
            </p>
          ))}
        </div>
      )}

      {/* Detected Field List */}
      <div className="mt-3 flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between text-xs text-slate-500 font-semibold mb-2">
          <span>Detected Fields ({fields.length})</span>
          <span>Fill Preview</span>
        </div>

        {fields.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-slate-200 bg-white rounded-2xl p-6 text-center text-slate-400 shadow-2xs">
            <Shield className="w-8 h-8 mb-2 stroke-1 text-slate-300" />
            <p className="text-xs font-semibold text-slate-600">No active scan</p>
            <p className="text-[11px] text-slate-400 mt-1 font-medium">
              Click "Scan Fields" on any job application form
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
            {fields.map((field, idx) => {
              const mapping = mappings[idx];
              const confidence = mapping ? mapping.confidence : 0;
              const valueToFill = mapping?.valueToFill !== undefined && mapping?.valueToFill !== null
                ? mapping.valueToFill
                : resolveProfileValue(mapping?.profilePath);
              const isAIMapped = mapping?.source?.includes("ai");


              const isMissingRequired = missingRequired.some((m) => m.id === field.id);
              const canSave =
                field.type !== "file" &&
                !mapping?.profilePath &&
                !/password/i.test(field.rawLabel || "") &&
                valueToFill !== null &&
                valueToFill !== undefined &&
                String(valueToFill).trim() !== "";

              return (
                <div
                  key={field.id}
                  className={`p-3 bg-white border rounded-2xl text-xs transition shadow-2xs space-y-2 ${isMissingRequired ? "border-rose-300 ring-1 ring-rose-200" : "border-slate-200"}`}

                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-bold text-slate-900 truncate flex-1 flex items-center gap-1.5">
                      <span>{field.rawLabel || field.name || "Unnamed field"}</span>
                      {isAIMapped && (
                        <span className="text-[9px] px-1.5 py-0.5 bg-blue-50 text-[#0066FF] border border-blue-200 rounded-full font-bold uppercase tracking-wider">
                          NVIDIA NIM
                        </span>
                      )}
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                        confidence >= 0.9
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : confidence >= 0.7
                          ? "bg-amber-50 text-amber-700 border border-amber-200"
                          : confidence >= 0.4
                          ? "bg-blue-50 text-blue-700 border border-blue-200"
                          : "bg-rose-50 text-rose-700 border border-rose-200"
                      }`}
                    >
                      {Math.round(confidence * 100)}%
                    </span>
                  </div>

                  {/* File Upload Field Display */}
                  {field.type === "file" && (
                    <div className="p-2 bg-blue-50/50 border border-blue-200 rounded-xl flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-blue-800 font-semibold text-[11px] truncate flex-1">
                        <FileText className="w-3.5 h-3.5 text-[#0066FF] shrink-0" />
                        <span className="truncate">{String(valueToFill || activeResumeDisplayName)}</span>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-bold shrink-0">
                          Ready
                        </span>
                      </div>
                      <button
                        onClick={handleUploadResumeOnly}
                        disabled={isUploadingResume}
                        className="text-[10px] px-2.5 py-1 bg-white hover:bg-slate-50 text-[#0066FF] border border-blue-200 rounded-full font-bold shrink-0 cursor-pointer transition flex items-center gap-1"
                      >
                        <Upload className="w-3 h-3" />
                        <span>{isUploadingResume ? "Uploading..." : "Upload"}</span>
                      </button>
                    </div>
                  )}

                  {/* Text / Number Input Editable Field */}
                  {field.type !== "select" && field.type !== "file" && (
                    <div>
                      <input
                        type="text"
                        className="w-full bg-white text-slate-900 border border-slate-200 rounded-xl px-3 py-1.5 text-[11px] font-medium focus:border-[#0066FF] focus:outline-none"
                        placeholder="No saved value"
                        value={valueToFill !== null && valueToFill !== undefined ? String(valueToFill) : ""}
                        onChange={(e) => handleValueChange(idx, e.target.value)}
                      />
                    </div>
                  )}

                  {canSave && (
                    <button
                      onClick={() => handleSaveAnswer(field, String(valueToFill))}
                      disabled={savingFieldId === field.id}
                      className="text-[10px] px-2.5 py-1 bg-blue-50 text-[#0066FF] border border-blue-200 rounded-full font-bold cursor-pointer"
                    >
                      {savedFieldIds.has(field.id) ? "Saved ✓" : savingFieldId === field.id ? "Saving..." : "Save to profile"}
                    </button>
                  )}

                  {/* Dropdown / Radio Options Selector */}
                  {(field.type === "select" || field.type === "radio") && field.options && field.options.length > 0 && (
                    <div className="pt-1.5 border-t border-slate-100">
                      <div className="flex items-center justify-between text-[10px] text-slate-500 font-semibold mb-1">
                        <span>{field.type === "radio" ? "Radio Options" : "Dropdown Options"} ({field.options.length}):</span>
                      </div>
                      <div className="relative">
                        <select
                          className="w-full bg-white text-slate-800 border border-slate-200 rounded-xl px-3 py-1.5 text-[11px] appearance-none cursor-pointer focus:border-[#0066FF] focus:outline-none pr-6 truncate font-medium"
                          value={
                            field.options.find(
                              (opt) =>
                                opt.value.toLowerCase() === String(valueToFill).toLowerCase() ||
                                opt.label.toLowerCase() === String(valueToFill).toLowerCase() ||
                                String(valueToFill).toLowerCase().includes(opt.label.toLowerCase()) ||
                                opt.label.toLowerCase().includes(String(valueToFill).toLowerCase())
                            )?.value || ""
                          }
                          onChange={(e) => {
                            const selectedOpt = field.options?.find((o) => o.value === e.target.value);
                            handleOptionOverride(idx, selectedOpt ? (selectedOpt.label || selectedOpt.value) : e.target.value);
                          }}
                        >
                          <option value="" disabled>-- Select Option ({field.options.length} found) --</option>
                          {field.options.map((opt, optIdx) => (
                            <option key={optIdx} value={opt.value}>
                              {opt.label || opt.value || `Option ${optIdx + 1}`}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
                      </div>
                    </div>
                  )}

                  {/* Multi-Select Checkbox Options Selector */}
                  {field.type === "checkbox" && field.options && field.options.length > 0 && (
                    <div className="pt-1.5 border-t border-slate-100">
                      <div className="flex items-center justify-between text-[10px] text-slate-500 font-semibold mb-1.5">
                        <span>Select Choices ({field.options.length} options):</span>
                        <span className="text-[9px] text-[#0066FF]">Click to toggle</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto custom-scrollbar p-2 bg-slate-50 rounded-xl border border-slate-200">
                        {field.options.map((opt, optIdx) => {
                          const isSelected = String(valueToFill || "")
                            .toLowerCase()
                            .includes(opt.label.toLowerCase()) ||
                            String(valueToFill || "")
                              .toLowerCase()
                              .includes(opt.value.toLowerCase());
                          return (
                            <button
                              key={optIdx}
                              type="button"
                              onClick={() => handleToggleCheckboxOption(idx, opt.label || opt.value)}
                              className={`text-[10px] px-2.5 py-1 rounded-full border transition flex items-center gap-1.5 cursor-pointer select-none ${
                                isSelected
                                  ? "bg-blue-50 text-[#0066FF] border-[#0066FF] font-bold shadow-2xs"
                                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100 font-medium"
                              }`}
                            >
                              <span className={`w-2.5 h-2.5 rounded-full border flex items-center justify-center text-[8px] font-bold ${isSelected ? "border-[#0066FF] bg-[#0066FF] text-white" : "border-slate-300"}`}>
                                {isSelected ? "✓" : ""}
                              </span>
                              <span>{opt.label || opt.value}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

