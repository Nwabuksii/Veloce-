export interface PollAnalyticsRow {
  messageId: string;
  messageSubject: string;
  messageBody: string;
  optionId: string;
  optionLabel: string;
  selectedAt: string;
  userId: string;
  userName: string;
  department: string | null;
  course: string | null;
}

export interface PollOptionBreakdown {
  label: string;
  votes: number;
  percentage: number;
}

export interface PollDepartmentMix {
  department: string;
  votes: number;
}

export interface PollSummary {
  totalVotes: number;
  uniqueRespondents: number;
  totalPolls: number;
  leadingOption: string;
  optionBreakdown: PollOptionBreakdown[];
  departmentMix: PollDepartmentMix[];
}

export function summarizePollResults(rows: PollAnalyticsRow[]): PollSummary {
  const totalVotes = rows.length;
  const totalPolls = new Set(rows.map((row) => row.messageId)).size;
  const uniqueRespondents = new Set(rows.map((row) => row.userId)).size;

  const optionCounts = new Map<string, number>();
  for (const row of rows) {
    optionCounts.set(row.optionLabel, (optionCounts.get(row.optionLabel) ?? 0) + 1);
  }

  const optionBreakdown: PollOptionBreakdown[] = Array.from(optionCounts.entries())
    .sort(([leftLabel, leftVotes], [rightLabel, rightVotes]) => {
      if (rightVotes !== leftVotes) return rightVotes - leftVotes;
      return leftLabel.localeCompare(rightLabel);
    })
    .map(([label, votes]) => ({
      label,
      votes,
      percentage: totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0,
    }));

  const departmentCounts = new Map<string, number>();
  for (const row of rows) {
    const department = row.department?.trim() || "Unknown";
    departmentCounts.set(department, (departmentCounts.get(department) ?? 0) + 1);
  }

  const departmentMix: PollDepartmentMix[] = Array.from(departmentCounts.entries())
    .sort(([leftDepartment, leftVotes], [rightDepartment, rightVotes]) => {
      if (rightVotes !== leftVotes) return rightVotes - leftVotes;
      return leftDepartment.localeCompare(rightDepartment);
    })
    .map(([department, votes]) => ({ department, votes }));

  const leadingOption = optionBreakdown[0]?.label ?? "No responses";

  return {
    totalVotes,
    uniqueRespondents,
    totalPolls,
    leadingOption,
    optionBreakdown,
    departmentMix,
  };
}
