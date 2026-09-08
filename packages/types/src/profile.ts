export interface PersonalInfo {
  fullName?: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  email: string;
  phone: string;
  countryCode?: string;
  dob?: string;
  nationality?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  authorizedInCountry?: boolean;
  requiresSponsorship?: boolean;
  gender?: string;
  veteranStatus?: string;
  disabilityStatus?: string;
  password?: string;
}

export interface ProfileLinks {
  linkedin?: string;
  github?: string;
  portfolio?: string;
  twitter?: string;
  other?: string[];
}

export interface CurrentCollegeEducation {
  institution: string;
  degree: string;
  major: string;
  specialization?: string;
  currentYear?: string | number;
  currentSemester?: string | number;
  graduationYear: string | number;
  cgpa: string | number;
  cgpaScale?: string | number;
}

export interface SecondaryEducation {
  percentageOrCgpa: string | number;
  passingYear: string | number;
  schoolName?: string;
}

export interface HigherSecondaryEducation {
  percentageOrCgpa: string | number;
  passingYear: string | number;
  schoolName?: string;
  stream?: string;
}

export interface ProfileDocuments {
  resumeDocId?: string;
  secondaryMarksheetDocId?: string;
  higherSecondaryMarksheetDocId?: string;
  collegeTranscriptDocId?: string;
  coverLetterDocId?: string;
}

export interface EducationItem {
  id: string;
  institution: string;
  degree: string;
  fieldOfStudy: string;
  gpa?: number;
  startDate: string;
  endDate?: string;
  isCurrent?: boolean;
}

export interface ExperienceItem {
  id: string;
  company: string;
  title: string;
  location?: string;
  startDate: string;
  endDate?: string;
  isCurrent?: boolean;
  description: string;
  skills?: string[];
}

export interface ProjectItem {
  id: string;
  name: string;
  description: string;
  technologies: string[];
  url?: string;
  repoUrl?: string;
}

export interface SkillItem {
  id: string;
  category: string; // e.g. "Languages", "Frameworks", "Tools"
  name: string;
  proficiency?: "beginner" | "intermediate" | "advanced" | "expert";
}

export interface UserProfile {
  id: string;
  userId: string;
  personal: PersonalInfo;
  links: ProfileLinks;
  education: EducationItem[];
  currentEducation?: CurrentCollegeEducation;
  secondary?: SecondaryEducation;
  higherSecondary?: HigherSecondaryEducation;
  skillsList?: string[];
  documents?: ProfileDocuments;
  experience: ExperienceItem[];
  projects: ProjectItem[];
  skills: SkillItem[];
  achievements?: string[];
  certifications?: string[];
}

export interface UserPreference {
  id?: string;
  userId: string;
  autofillConfidenceThreshold: number;
  preferredResumeId?: string | null;
  notificationSettings?: any;
  showFillCursor: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}
