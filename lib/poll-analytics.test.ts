import { describe, it, expect } from "vitest";
import { summarizePollResults } from "./poll-analytics";

describe("summarizePollResults", () => {
  it("groups vote totals by option and keeps the leading option at the top", () => {
    const rows = [
      {
        messageId: "m-1",
        messageSubject: "Which school are you from?",
        messageBody: "Choose the school you currently attend.",
        optionId: "opt-1",
        optionLabel: "Babcock",
        selectedAt: "2026-09-01T12:00:00.000Z",
        userId: "u-1",
        userName: "Alice",
        department: "Computer Science",
        course: "COS 201",
      },
      {
        messageId: "m-1",
        messageSubject: "Which school are you from?",
        messageBody: "Choose the school you currently attend.",
        optionId: "opt-1",
        optionLabel: "Babcock",
        selectedAt: "2026-09-01T12:05:00.000Z",
        userId: "u-2",
        userName: "Bob",
        department: "Computer Science",
        course: "COS 301",
      },
      {
        messageId: "m-1",
        messageSubject: "Which school are you from?",
        messageBody: "Choose the school you currently attend.",
        optionId: "opt-2",
        optionLabel: "UI",
        selectedAt: "2026-09-01T12:10:00.000Z",
        userId: "u-3",
        userName: "Chinelo",
        department: "Mass Communication",
        course: "MCM 101",
      },
      {
        messageId: "m-1",
        messageSubject: "Which school are you from?",
        messageBody: "Choose the school you currently attend.",
        optionId: "opt-3",
        optionLabel: "UNILAG",
        selectedAt: "2026-09-01T12:15:00.000Z",
        userId: "u-4",
        userName: "Dami",
        department: "Economics",
        course: "ECO 201",
      },
    ];

    const result = summarizePollResults(rows);

    expect(result.totalVotes).toBe(4);
    expect(result.optionBreakdown).toEqual([
      { label: "Babcock", votes: 2, percentage: 50 },
      { label: "UI", votes: 1, percentage: 25 },
      { label: "UNILAG", votes: 1, percentage: 25 },
    ]);
    expect(result.leadingOption).toBe("Babcock");
    expect(result.departmentMix).toEqual([
      { department: "Computer Science", votes: 2 },
      { department: "Economics", votes: 1 },
      { department: "Mass Communication", votes: 1 },
    ]);
  });
});
