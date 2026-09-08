import { understandQuestion, resolveAnswer } from "../packages/ai/src";
import { FieldContext, UserProfile } from "../packages/types/src";

const mockProfile: UserProfile = {
  id: "test_user",
  userId: "test_user",
  personal: {
    fullName: "Sanjeev Kumar",
    firstName: "Sanjeev",
    lastName: "Kumar",
    email: "sanjeev1803t@gmail.com",
    phone: "+91-8825171882",
    city: "Greater Noida",
    state: "Uttar Pradesh",
    country: "India",
    dateOfBirth: "2003-07-18",
  },
  links: {
    linkedin: "https://www.linkedin.com/in/sanjeev-kumar-1803t/",
    github: "https://github.com/Sanjeevp-07",
  },
  education: [
    {
      id: "edu_1",
      institution: "Bennett University",
      degree: "B.Tech",
      fieldOfStudy: "Computer Science and Engineering",
      startDate: "2022-08-01",
      endDate: "2026-06-01",
    },
  ],
  experience: [
    {
      id: "exp_1",
      company: "Tech Corp",
      title: "Software Engineer Intern",
      startDate: "2023-06-01",
      endDate: "2023-12-01",
      description: "Built React microfrontends",
    },
  ],
  skills: [
    { id: "sk_1", category: "Languages", name: "TypeScript" },
    { id: "sk_2", category: "Languages", name: "Python" },
  ],
};

import { describe, it, expect } from "vitest";

describe("Phase 8: Semantic Auto-Answer Pipeline", () => {
  it("derives Level B Birth Year from profile dob", async () => {
    const dobCtx: FieldContext = {
      label: "Year of Birth",
      type: "number",
      placeholder: "YYYY",
      nearbyText: "Personal Details",
    };
    const plan1 = await understandQuestion(dobCtx);
    const result1 = await resolveAnswer({ plan: plan1, profile: mockProfile });
    expect(result1.answer).toBe("2003");
    expect(result1.source).toBe("derived");
  });

  it("derives Level B Graduation Year from education history", async () => {
    const gradCtx: FieldContext = {
      label: "Graduation Year",
      type: "number",
      placeholder: "YYYY",
      sectionTitle: "Education History",
    };
    const plan2 = await understandQuestion(gradCtx);
    const result2 = await resolveAnswer({ plan: plan2, profile: mockProfile });
    expect(result2.answer).toBe("2026");
  });

  it("derives Level B Location Composite", async () => {
    const locCtx: FieldContext = {
      label: "Where are you currently located?",
      type: "text",
      placeholder: "City, State, Country",
    };
    const plan3 = await understandQuestion(locCtx);
    const result3 = await resolveAnswer({ plan: plan3, profile: mockProfile });
    expect(result3.answer).toBe("Greater Noida, Uttar Pradesh, India");
  });

  it("resolves Level A Direct Fact for Email Address", async () => {
    const emailCtx: FieldContext = {
      label: "Email Address",
      type: "email",
    };
    const plan4 = await understandQuestion(emailCtx);
    const result4 = await resolveAnswer({ plan: plan4, profile: mockProfile });
    expect(result4.answer).toBe("sanjeev1803t@gmail.com");
    expect(result4.source).toBe("database");
  });
});
