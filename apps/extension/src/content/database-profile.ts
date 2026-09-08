import { UserProfile } from "@internship-copilot/types";
import { SavedResumeDoc } from "./resume-uploader";

/**
 * Standard gold-truth database profile extracted directly from data/ihateform-database.json.
 * This guarantees 100% reliable, deterministic fallback data even if the web server
 * is offline or session cookies are not yet initialized in the extension.
 */
export const DEFAULT_DATABASE_PROFILE: UserProfile = {
  id: "usr_jch177u",
  userId: "usr_jch177u",
  personal: {
    fullName: "Sanjeev Kumar",
    firstName: "Sanjeev",
    middleName: "",
    lastName: "Kumar",
    email: "sanjeev.kumar.cs27@iilm.edu",
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
    password: "Sanjeev1100",
    requiresSponsorship: false,
    authorizedInCountry: true,
  },
  education: [
    {
      id: "edu_iilm",
      institution: "IILM University Greater Noida",
      degree: "B.Tech",
      fieldOfStudy: "Computer science and Engineering",
      gpa: 7.89,
      startDate: "2023-08-01",
      endDate: "2027-06-30",
      isCurrent: true,
    },
  ],
  currentEducation: {
    institution: "IILM University Greater Noida",
    degree: "B.Tech",
    major: "Computer science and Engineering",
    specialization: "AI/ML",
    currentYear: "4",
    currentSemester: "7",
    graduationYear: "2027",
    cgpa: "7.89",
    cgpaScale: "10.0",
  },
  secondary: {
    percentageOrCgpa: "69.8",
    passingYear: "2021",
    schoolName: "Kendriya Vidyalaya BHEL",
  },
  higherSecondary: {
    percentageOrCgpa: "62.4",
    passingYear: "2023",
    schoolName: "Kendriya Vidyalaya BHEL",
    stream: "PCM",
  },
  skills: [
    { id: "sk_1", category: "Languages", name: "React" },
    { id: "sk_2", category: "Languages", name: "TypeScript" },
    { id: "sk_3", category: "Frameworks", name: "Node.js" },
    { id: "sk_4", category: "Languages", name: "JavaScript" },
    { id: "sk_5", category: "Frameworks", name: "Next.js" },
    { id: "sk_6", category: "Frameworks", name: "Tailwind CSS" },
    { id: "sk_7", category: "Tools", name: "Docker" },
    { id: "sk_8", category: "Databases", name: "MongoDB" },
    { id: "sk_9", category: "Databases", name: "PostgreSQL" },
    { id: "sk_10", category: "Languages", name: "Python" },
    { id: "sk_11", category: "Specialization", name: "AI/ML" },
    { id: "sk_12", category: "Tools", name: "Git" },
    { id: "sk_13", category: "Cloud", name: "AWS" },
    { id: "sk_14", category: "Languages", name: "Java" },
    { id: "sk_15", category: "Frameworks", name: "FastAPI" },
  ],
  skillsList: [
    "React",
    "TypeScript",
    "Node.js",
    "JavaScript",
    "Next.js",
    "Tailwind CSS",
    "Docker",
    "MongoDB",
    "PostgreSQL",
    "Python",
    "AI/ML",
    "Git",
    "AWS",
    "Java",
    "FastAPI",
  ],
  links: {
    linkedin: "https://www.linkedin.com/in/sanjeev-kumar-1803t/",
    github: "https://github.com/Sanjeevp-07",
    portfolio: "https://port-folio-three-olive.vercel.app/",
  },
  experience: [],
  projects: [
    {
      id: "proj_1",
      name: "Internship Application Copilot",
      description: "Full-stack browser extension and automation platform for streamlined job applications.",
      technologies: ["React", "TypeScript", "Node.js", "Tailwind CSS"],
      repoUrl: "https://github.com/Sanjeevp-07",
    },
  ],
  documents: {
    resumeDocId: "doc_h1diha5",
  },
};

export const DEFAULT_SAVED_RESUME: SavedResumeDoc = {
  id: "doc_h1diha5",
  filename: "Sanjeev_Resume.pdf",
  mimeType: "application/pdf",
  category: "resume",
  isPreferred: true,
  tags: ["Resume"],
  sizeBytes: 99990,
};
