import type { StoredResume } from "@/lib/ai/schemas/resume-json";

/** Shared profile fixture for the F34 tests. */
export function base(): StoredResume {
  return {
    basics: {
      name: "Asha Example",
      label: "",
      email: "asha@example.com",
      phone: "+91 98765 43210",
      url: "https://asha.dev",
      summary: "",
      location: { city: "Pune", region: "MH", countryCode: "IN" },
      profiles: [{ network: "GitHub", username: "asha", url: "https://github.com/asha" }],
    },
    work: [
      {
        name: "Acme",
        position: "Frontend Engineer",
        location: "",
        startDate: "2022-01",
        endDate: null,
        summary: "",
        highlights: ["A one", "B two", "C three", "D four"],
      },
      {
        name: "Beta",
        position: "Developer",
        location: "",
        startDate: "2019-06",
        endDate: "2021-12",
        summary: "Agency work for retail clients.",
        highlights: [],
      },
    ],
    education: [
      {
        institution: "IIT Bombay",
        area: "CS",
        studyType: "B.Tech",
        startDate: null,
        endDate: null,
        score: "",
        courses: [],
      },
    ],
    skills: [
      { name: "React", level: "", keywords: [] },
      { name: "react ", level: "", keywords: [] },
      { name: "TypeScript", level: "", keywords: [] },
    ],
    projects: [
      {
        name: "Budget app",
        description: "Shared-flat budgeting, see https://budget.example",
        url: "",
        startDate: null,
        endDate: null,
        highlights: [],
      },
    ],
    certificates: [{ name: "AWS SA", issuer: "AWS", date: null, url: "" }],
    volunteer: [],
    awards: [],
    languages: [],
    x_roleform: {
      schemaVersion: 1,
      bulletIds: {
        "work.0.highlights.0": "id-a",
        "work.0.highlights.1": "id-b",
        "work.0.highlights.2": "id-c",
        "work.0.highlights.3": "id-d",
      },
      sensitivity: { hidePhone: false, hideAddress: true },
    },
  };
}
