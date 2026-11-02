import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve(process.cwd(), "..", "..", "data");
const DB_FILE = path.join(DATA_DIR, "ihateform-database.json");
const DOCS_DIR = path.join(DATA_DIR, "documents");

export interface StoredProfile {
  personal: {
    fullName?: string;
    firstName?: string;
    middleName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    countryCode?: string;
    gender?: string;
    dob?: string;
    nationality?: string;
    country?: string;
    state?: string;
    city?: string;
    postalCode?: string;
    address?: string;
    requiresSponsorship?: boolean;
    authorizedInCountry?: boolean;
    password?: string;
  };
  education?: {
    institution?: string;
    degree?: string;
    major?: string;
    specialization?: string;
    currentYear?: string;
    currentSemester?: string;
    graduationYear?: string;
    cgpa?: string;
    cgpaScale?: string;
  };
  secondary?: {
    percentageOrCgpa?: string;
    passingYear?: string;
    schoolName?: string;
  };
  higherSecondary?: {
    percentageOrCgpa?: string;
    passingYear?: string;
    schoolName?: string;
    stream?: string;
  };
  skills?: string[];
  links: {
    linkedin?: string;
    github?: string;
    portfolio?: string;
  };
  documents?: {
    resumeDocId?: string;
    secondaryMarksheetDocId?: string;
    higherSecondaryMarksheetDocId?: string;
    collegeTranscriptDocId?: string;
    coverLetterDocId?: string;
  };

  savedAnswers?: Record<string, {rawLabel: string; value: string; type?: string; updatedAt: string}>;
}

export interface StoredDocument {
  id: string;
  userId: string;
  title: string;
  filename: string;
  sizeBytes: number;
  mimeType: string;
  category?: "resume" | "secondaryMarksheet" | "higherSecondaryMarksheet" | "collegeTranscript" | "coverLetter" | string;
  tags: string[];
  isPreferred: boolean;
  fileData?: string; // base64 string
  filePath?: string;
  createdAt: string;
}

export interface StoredUser {
  id: string;
  email: string;
  name: string;
  passwordHash?: string;
  authProvider: "google" | "email";
  createdAt: string;
  updatedAt: string;
  profile: StoredProfile;
  documents: StoredDocument[];
  applications: Array<{
    id: string;
    company: string;
    jobTitle: string;
    url: string;
    status: string;
    fieldsFilled: number;
    createdAt: string;
  }>;
}

export interface DatabaseData {
  users: Record<string, StoredUser>;
  version: string;
}

function ensureDataDirs(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DOCS_DIR)) {
      fs.mkdirSync(DOCS_DIR, { recursive: true });
    }
  } catch {}
}

export function readDatabase(): DatabaseData {
  ensureDataDirs();
  try {
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, "utf-8");
      return JSON.parse(content);
    }
  } catch (err) {
    console.warn("Error reading database file, initializing default:", err);
  }

  const initialData: DatabaseData = {
    users: {
      usr_jch177u: {
        id: "usr_jch177u",
        email: "sanjeev1803t@gmail.com",
        name: "Sanjeev Kumar",
        authProvider: "google",
        createdAt: "2026-08-23T07:39:20.815Z",
        updatedAt: "2026-08-23T07:39:20.817Z",
        profile: {
          personal: {
            fullName: "Sanjeev Kumar",
            firstName: "Sanjeev",
            middleName: "",
            lastName: "Kumar",
            email: "sanjeev1803t@gmail.com",
            phone: "8825171882",
            countryCode: "+91",
            gender: "Male",
            nationality: "Indian",
            dob: "06/07/2005",
            country: "India",
            state: "Uttar Pradesh",
            city: "Greater Noida",
            postalCode: "201306",
            address: "Lakhnawali, back of RCS School",
            requiresSponsorship: false,
            authorizedInCountry: true,
          },
          education: {
            institution: "Bennett University",
            degree: "B.Tech",
            major: "Computer Science and Engineering",
            specialization: "Artificial Intelligence",
            currentYear: "3rd Year",
            currentSemester: "6th Semester",
            graduationYear: "2026",
            cgpa: "8.9",
            cgpaScale: "10.0",
          },
          secondary: {
            percentageOrCgpa: "92.4",
            passingYear: "2020",
            schoolName: "St. Xavier's High School",
          },
          higherSecondary: {
            percentageOrCgpa: "94.8",
            passingYear: "2022",
            schoolName: "DPS International School",
            stream: "Science (PCM)",
          },
          skills: [
            "React",
            "Next.js",
            "TypeScript",
            "Node.js",
            "Python",
            "Tailwind CSS",
            "Docker",
            "PostgreSQL",
            "AI/ML",
            "PyTorch",
            "Git",
            "REST APIs",
          ],
          links: {
            linkedin: "https://www.linkedin.com/in/sanjeev-kumar-1803t/",
            github: "https://github.com/Sanjeevp-07",
            portfolio: "https://port-folio-three-olive.vercel.app/",
          },
          documents: {},
        },
        documents: [],
        applications: [],
      },
    },
    version: "2.0.0",
  };

  writeDatabase(initialData);
  return initialData;
}

export function writeDatabase(data: DatabaseData): void {
  ensureDataDirs();
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("Error writing to database file:", err);
  }
}

export function getOrCreateUser(email: string, name?: string, authProvider: "google" | "email" = "google"): StoredUser {
  const db = readDatabase();
  const normalizedEmail = email.toLowerCase().trim();

  let user = Object.values(db.users).find((u) => u.email.toLowerCase() === normalizedEmail);

  if (!user) {
    const id = "usr_" + Math.random().toString(36).substring(2, 9);
    user = {
      id,
      email: normalizedEmail,
      name: name || normalizedEmail.split("@")[0],
      authProvider,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      profile: {
        personal: {
          firstName: "",
          lastName: "",
          email: normalizedEmail,
          phone: "",
          countryCode: "+91",
          city: "",
          state: "",
          country: "",
          postalCode: "",
          address: "",
          requiresSponsorship: false,
          authorizedInCountry: true,
        },
        links: {
          linkedin: "",
          github: "",
          portfolio: "",
        },
      },
      documents: [],
      applications: [],
    };
    db.users[id] = user;
    writeDatabase(db);
  }

  return user;
}

export function updateUserProfile(userIdOrEmail: string, profile: StoredProfile): StoredUser {
  const db = readDatabase();
  let user: StoredUser | undefined = db.users[userIdOrEmail];

  if (!user) {
    user = Object.values(db.users).find((u) => u.email.toLowerCase() === userIdOrEmail.toLowerCase());
  }

  if (!user) {
    user = getOrCreateUser(userIdOrEmail);
  }

  user.profile = profile;
  user.updatedAt = new Date().toISOString();
  if (profile.personal?.firstName || profile.personal?.lastName) {
    user.name = `${profile.personal.firstName || ""} ${profile.personal.lastName || ""}`.trim() || user.name;
  }

  db.users[user.id] = user;
  writeDatabase(db);
  return user;
}

export function getUserDocuments(userIdOrEmail: string): StoredDocument[] {
  const db = readDatabase();
  const user = db.users[userIdOrEmail] || Object.values(db.users).find((u) => u.email.toLowerCase() === userIdOrEmail.toLowerCase());
  return user?.documents || [];
}

export function addDocumentToUser(
  userIdOrEmail: string,
  doc: {
    title: string;
    filename: string;
    sizeBytes: number;
    mimeType: string;
    tags: string[];
    category?: string;
    fileBufferBase64?: string;
    fileData?: string;
  }
): StoredDocument {
  ensureDataDirs();
  const db = readDatabase();
  let user = db.users[userIdOrEmail] || Object.values(db.users).find((u) => u.email.toLowerCase() === userIdOrEmail.toLowerCase());
  if (!user) user = getOrCreateUser(userIdOrEmail);

  if (!user.documents) user.documents = [];

  const docId = "doc_" + Math.random().toString(36).substring(2, 9);
  const base64Data = doc.fileData || doc.fileBufferBase64 || "";

  // Optionally persist physical file to disk
  let savedFilePath: string | undefined = undefined;
  if (base64Data) {
    try {
      const sanitizedName = doc.filename.replace(/[^a-zA-Z0-9_.-]/g, "_");
      savedFilePath = path.join(DOCS_DIR, `${docId}_${sanitizedName}`);
      fs.writeFileSync(savedFilePath, Buffer.from(base64Data, "base64"));
    } catch (e) {
      console.warn("Could not write document to disk:", e);
    }
  }

  // If this is the first document, make it preferred. Otherwise if any is preferred, keep it.
  const hasPreferred = user.documents.some((d) => d.isPreferred);

  const newDoc: StoredDocument = {
    id: docId,
    userId: user.id,
    title: doc.title,
    filename: doc.filename,
    sizeBytes: doc.sizeBytes,
    mimeType: doc.mimeType,
    category: doc.category || (doc.tags.includes("10th") ? "secondaryMarksheet" : doc.tags.includes("12th") ? "higherSecondaryMarksheet" : doc.tags.includes("Transcript") ? "collegeTranscript" : doc.tags.includes("Cover Letter") ? "coverLetter" : "resume"),
    tags: doc.tags.length > 0 ? doc.tags : ["Resume", "Software Engineering"],
    isPreferred: !hasPreferred,
    fileData: base64Data || undefined,
    filePath: savedFilePath,
    createdAt: new Date().toISOString(),
  };

  user.documents.push(newDoc);

  // Link document in user profile if category matches
  if (!user.profile) user.profile = { personal: {}, links: {} };
  if (!user.profile.documents) user.profile.documents = {};
  if (doc.category === "resume") user.profile.documents.resumeDocId = docId;
  else if (doc.category === "secondaryMarksheet") user.profile.documents.secondaryMarksheetDocId = docId;
  else if (doc.category === "higherSecondaryMarksheet") user.profile.documents.higherSecondaryMarksheetDocId = docId;
  else if (doc.category === "collegeTranscript") user.profile.documents.collegeTranscriptDocId = docId;
  else if (doc.category === "coverLetter") user.profile.documents.coverLetterDocId = docId;

  writeDatabase(db);
  return newDoc;
}

export function getPreferredDocument(userIdOrEmail: string): StoredDocument | null {
  const docs = getUserDocuments(userIdOrEmail);
  if (docs.length === 0) return null;
  const preferred = docs.find((d) => d.isPreferred);
  return preferred || docs[0] || null;
}

export function getDocumentById(userIdOrEmail: string, docId: string): StoredDocument | null {
  const docs = getUserDocuments(userIdOrEmail);
  return docs.find((d) => d.id === docId) || null;
}

export function deleteUserDocument(userIdOrEmail: string, docId: string): boolean {
  const db = readDatabase();
  const user = db.users[userIdOrEmail] || Object.values(db.users).find((u) => u.email.toLowerCase() === userIdOrEmail.toLowerCase());
  if (!user || !user.documents) return false;

  const initialLen = user.documents.length;
  const targetDoc = user.documents.find((d) => d.id === docId);

  // Remove physical file from disk if present
  if (targetDoc?.filePath && fs.existsSync(targetDoc.filePath)) {
    try {
      fs.unlinkSync(targetDoc.filePath);
    } catch {}
  }

  user.documents = user.documents.filter((d) => d.id !== docId);

  if (user.documents.length < initialLen) {
    if (user.documents.length > 0 && !user.documents.some((d) => d.isPreferred)) {
      user.documents[0].isPreferred = true;
    }
    writeDatabase(db);
    return true;
  }
  return false;
}

export function setPreferredDocument(userIdOrEmail: string, docId: string): boolean {
  const db = readDatabase();
  const user = db.users[userIdOrEmail] || Object.values(db.users).find((u) => u.email.toLowerCase() === userIdOrEmail.toLowerCase());
  if (!user || !user.documents) return false;

  for (const doc of user.documents) {
    doc.isPreferred = doc.id === docId;
  }

  writeDatabase(db);
  return true;
}

