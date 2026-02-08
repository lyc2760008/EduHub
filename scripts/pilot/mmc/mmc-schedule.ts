// Shared MMC Spring 2026 pilot schedule config for setup/import scripts.
export type ProgramKey = "singapore-math" | "writing" | "english-lsrw";

export type ProgramConfig = {
  key: ProgramKey;
  name: string;
  defaultTutorEmail: string;
};

export type LevelConfig = {
  code: string;
  name: string;
  sortOrder: number;
};

export type ScheduleItem = {
  code: string;
  programKey: ProgramKey;
  levelCode: string;
  displayName: string;
  weekday: number;
  startTime: string;
  durationMinutes: number;
};

const WEEKDAY_LABELS: Record<number, string> = {
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
  7: "Sun",
};

function formatTimeLabel(time24: string) {
  const [rawHour, rawMinute] = time24.split(":").map((part) => Number(part));
  const hour = rawHour % 12 || 12;
  const suffix = rawHour >= 12 ? "PM" : "AM";
  const minute = rawMinute.toString().padStart(2, "0");
  return `${hour}:${minute} ${suffix}`;
}

export function buildGroupName(item: ScheduleItem) {
  const dayLabel = WEEKDAY_LABELS[item.weekday] ?? "";
  const timeLabel = formatTimeLabel(item.startTime);
  return `${item.displayName} (${dayLabel} ${timeLabel})`;
}

export const MMC_PROGRAMS: ProgramConfig[] = [
  {
    key: "singapore-math",
    name: "Singapore Math",
    defaultTutorEmail: "mmceducationcalgary@gmail.com",
  },
  {
    key: "writing",
    name: "Writing",
    defaultTutorEmail: "nicolemacarthur@mywic.ca",
  },
  {
    key: "english-lsrw",
    name: "English LSRW",
    defaultTutorEmail: "hanka.ilott@gmail.com",
  },
];

export const MMC_LEVELS: LevelConfig[] = [
  { code: "KG1", name: "K–G1", sortOrder: 10 },
  { code: "G2", name: "Grade 2", sortOrder: 20 },
  { code: "G2-3", name: "Grade 2–3", sortOrder: 21 },
  { code: "G4", name: "Grade 4", sortOrder: 40 },
  { code: "G4-6", name: "Grade 4–6", sortOrder: 41 },
  { code: "G5", name: "Grade 5", sortOrder: 50 },
  { code: "G5A", name: "Grade 5A", sortOrder: 51 },
  { code: "G5B", name: "Grade 5B", sortOrder: 52 },
  { code: "G6-7", name: "Grade 6–7", sortOrder: 60 },
  { code: "G6-8", name: "Grade 6–8", sortOrder: 61 },
  { code: "G6B-7A", name: "Grade 6B–7A", sortOrder: 62 },
  { code: "G7", name: "Grade 7", sortOrder: 70 },
  { code: "G7B", name: "Grade 7B", sortOrder: 71 },
  { code: "G8", name: "Grade 8", sortOrder: 80 },
  { code: "G8-9", name: "Grade 8–9", sortOrder: 81 },
  { code: "G9-10", name: "Grade 9–10", sortOrder: 90 },
  { code: "G11-12", name: "Grade 11–12", sortOrder: 110 },
];

export const MMC_SCHEDULE: ScheduleItem[] = [
  // Singapore Math (60 min)
  {
    code: "sm-kg1-mon-1630",
    programKey: "singapore-math",
    levelCode: "KG1",
    displayName: "K–G1 Singapore Math",
    weekday: 1,
    startTime: "16:30",
    durationMinutes: 60,
  },
  {
    code: "sm-g7b-tue-1630",
    programKey: "singapore-math",
    levelCode: "G7B",
    displayName: "Grade 7B Singapore Math",
    weekday: 2,
    startTime: "16:30",
    durationMinutes: 60,
  },
  {
    code: "sm-g2-tue-1830",
    programKey: "singapore-math",
    levelCode: "G2",
    displayName: "Grade 2 Singapore Math",
    weekday: 2,
    startTime: "18:30",
    durationMinutes: 60,
  },
  {
    code: "sm-g8-tue-1930",
    programKey: "singapore-math",
    levelCode: "G8",
    displayName: "Grade 8 Singapore Math",
    weekday: 2,
    startTime: "19:30",
    durationMinutes: 60,
  },
  {
    code: "sm-g5b-wed-1645",
    programKey: "singapore-math",
    levelCode: "G5B",
    displayName: "Grade 5B Singapore Math",
    weekday: 3,
    startTime: "16:45",
    durationMinutes: 60,
  },
  {
    code: "sm-g6b-7a-wed-1830",
    programKey: "singapore-math",
    levelCode: "G6B-7A",
    displayName: "Grade 6B–7A Singapore Math",
    weekday: 3,
    startTime: "18:30",
    durationMinutes: 60,
  },
  {
    code: "sm-g4-thu-1630",
    programKey: "singapore-math",
    levelCode: "G4",
    displayName: "Grade 4 Singapore Math",
    weekday: 4,
    startTime: "16:30",
    durationMinutes: 60,
  },
  {
    code: "sm-g5a-thu-1830",
    programKey: "singapore-math",
    levelCode: "G5A",
    displayName: "Grade 5A Singapore Math",
    weekday: 4,
    startTime: "18:30",
    durationMinutes: 60,
  },
  // Writing (75 min)
  {
    code: "wr-g6-7-mon-1800",
    programKey: "writing",
    levelCode: "G6-7",
    displayName: "Grade 6–7 Academic Writing & PAT",
    weekday: 1,
    startTime: "18:00",
    durationMinutes: 75,
  },
  {
    code: "wr-g11-12-mon-1800",
    programKey: "writing",
    levelCode: "G11-12",
    displayName: "Grade 11–12 University Prep Writing",
    weekday: 1,
    startTime: "18:00",
    durationMinutes: 75,
  },
  {
    code: "wr-g6-8-tue-1700",
    programKey: "writing",
    levelCode: "G6-8",
    displayName: "Grade 6–8 Literature & Writing",
    weekday: 2,
    startTime: "17:00",
    durationMinutes: 75,
  },
  {
    code: "wr-g9-10-tue-1845",
    programKey: "writing",
    levelCode: "G9-10",
    displayName: "Grade 9–10 Academic Writing & PAT",
    weekday: 2,
    startTime: "18:45",
    durationMinutes: 75,
  },
  {
    code: "wr-g4-6-wed-1830",
    programKey: "writing",
    levelCode: "G4-6",
    displayName: "Grade 4–6 Creative Writing",
    weekday: 3,
    startTime: "18:30",
    durationMinutes: 75,
  },
  {
    code: "wr-g8-9-wed-1830",
    programKey: "writing",
    levelCode: "G8-9",
    displayName: "Grade 8–9 Academic Writing & PAT",
    weekday: 3,
    startTime: "18:30",
    durationMinutes: 75,
  },
  // English LSRW (75 min)
  {
    code: "en-g2-3-fri-1745",
    programKey: "english-lsrw",
    levelCode: "G2-3",
    displayName: "English LSRW Grade 2–3",
    weekday: 5,
    startTime: "17:45",
    durationMinutes: 75,
  },
  {
    code: "en-g4-fri-1915",
    programKey: "english-lsrw",
    levelCode: "G4",
    displayName: "English LSRW Grade 4",
    weekday: 5,
    startTime: "19:15",
    durationMinutes: 75,
  },
  {
    code: "en-g5-sat-1730",
    programKey: "english-lsrw",
    levelCode: "G5",
    displayName: "English LSRW Grade 5",
    weekday: 6,
    startTime: "17:30",
    durationMinutes: 75,
  },
  {
    code: "en-g7-sat-1900",
    programKey: "english-lsrw",
    levelCode: "G7",
    displayName: "English LSRW Grade 7",
    weekday: 6,
    startTime: "19:00",
    durationMinutes: 75,
  },
];

export const AUTO_ENROLL_GROUP_BY_GRADE_KEY: Record<string, string> = {
  KG1: "sm-kg1-mon-1630",
  G2: "sm-g2-tue-1830",
  G4: "sm-g4-thu-1630",
  G8: "sm-g8-tue-1930",
};
