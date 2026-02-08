// Pilot schedule definition for MMC Spring 2026 (safe to commit; no secrets).
// TODO(PO): Replace placeholder entries with the final approved MMC schedule before production.
export type PilotScheduleGroup = {
  name: string;
  type: "GROUP" | "CLASS";
  tutorEmail: string;
  dayOfWeek: number;
  startTimeLocal: string;
  durationMinutes: number;
  programName?: string;
  levelName?: string;
  centerName?: string;
  notes?: string;
};

export type PilotSchedule = {
  term: {
    startDate: string;
    endDate: string;
    timeZone: string;
  };
  defaultCenterName: string;
  groups: PilotScheduleGroup[];
  rosterPlaceholders?: string[];
};

export const MMC_SPRING_2026_SCHEDULE: PilotSchedule = {
  term: {
    startDate: "2026-02-09",
    endDate: "2026-06-13",
    timeZone: "America/Edmonton",
  },
  defaultCenterName: "MMC Education Calgary",
  groups: [
    // Singapore Math (60 minutes, once per week).
    {
      name: "K-G1 Singapore Math",
      type: "GROUP",
      tutorEmail: "mmceducationcalgary@gmail.com",
      dayOfWeek: 1,
      startTimeLocal: "16:30",
      durationMinutes: 60,
      programName: "Singapore Math",
      levelName: "K-G1",
      notes:
        "Derived from MMC Calgary Spring 2026 schedule (Mon 4:30-5:30 PM).",
    },
    {
      name: "Grade 7B Singapore Math",
      type: "GROUP",
      tutorEmail: "mmceducationcalgary@gmail.com",
      dayOfWeek: 2,
      startTimeLocal: "16:30",
      durationMinutes: 60,
      programName: "Singapore Math",
      levelName: "Grade 7B",
      notes:
        "Derived from MMC Calgary Spring 2026 schedule (Tue 4:30-5:30 PM).",
    },
    {
      name: "Grade 2 Singapore Math",
      type: "GROUP",
      tutorEmail: "mmceducationcalgary@gmail.com",
      dayOfWeek: 2,
      startTimeLocal: "18:30",
      durationMinutes: 60,
      programName: "Singapore Math",
      levelName: "Grade 2",
      notes:
        "Derived from MMC Calgary Spring 2026 schedule (Tue 6:30-7:30 PM).",
    },
    {
      name: "Grade 8 Singapore Math",
      type: "GROUP",
      tutorEmail: "mmceducationcalgary@gmail.com",
      dayOfWeek: 2,
      startTimeLocal: "19:30",
      durationMinutes: 60,
      programName: "Singapore Math",
      levelName: "Grade 8",
      notes:
        "Derived from MMC Calgary Spring 2026 schedule (Tue 7:30-8:30 PM).",
    },
    {
      name: "Grade 5B Singapore Math",
      type: "GROUP",
      tutorEmail: "mmceducationcalgary@gmail.com",
      dayOfWeek: 3,
      startTimeLocal: "16:45",
      durationMinutes: 60,
      programName: "Singapore Math",
      levelName: "Grade 5B",
      notes:
        "Derived from MMC Calgary Spring 2026 schedule (Wed 4:45-5:45 PM).",
    },
    {
      name: "Grade 6B-7A Singapore Math",
      type: "GROUP",
      tutorEmail: "mmceducationcalgary@gmail.com",
      dayOfWeek: 3,
      startTimeLocal: "18:30",
      durationMinutes: 60,
      programName: "Singapore Math",
      levelName: "Grade 6B-7A",
      notes:
        "Derived from MMC Calgary Spring 2026 schedule (Wed 6:30-7:30 PM).",
    },
    {
      name: "Grade 4 Singapore Math",
      type: "GROUP",
      tutorEmail: "mmceducationcalgary@gmail.com",
      dayOfWeek: 4,
      startTimeLocal: "16:30",
      durationMinutes: 60,
      programName: "Singapore Math",
      levelName: "Grade 4",
      notes:
        "Derived from MMC Calgary Spring 2026 schedule (Thu 4:30-5:30 PM).",
    },
    {
      name: "Grade 5A Singapore Math",
      type: "GROUP",
      tutorEmail: "mmceducationcalgary@gmail.com",
      dayOfWeek: 4,
      startTimeLocal: "18:30",
      durationMinutes: 60,
      programName: "Singapore Math",
      levelName: "Grade 5A",
      notes:
        "Derived from MMC Calgary Spring 2026 schedule (Thu 6:30-7:30 PM).",
    },
    // Writing Programs (75 minutes, once per week).
    // NOTE: Monday keeps Grade 11-12 University Prep Writing to avoid tutor-time overlap.
    {
      name: "Grade 11-12 University Prep Writing",
      type: "GROUP",
      tutorEmail: "nicolemacarthur@mywic.ca",
      dayOfWeek: 1,
      startTimeLocal: "18:00",
      durationMinutes: 75,
      programName: "Writing",
      levelName: "Grade 11-12",
      notes:
        "Derived from MMC Calgary Spring 2026 schedule (Mon 6:00-7:15 PM).",
    },
    {
      name: "Grade 6-8 Literature & Writing",
      type: "GROUP",
      tutorEmail: "nicolemacarthur@mywic.ca",
      dayOfWeek: 2,
      startTimeLocal: "17:00",
      durationMinutes: 75,
      programName: "Writing",
      levelName: "Grade 6-8",
      notes:
        "Derived from MMC Calgary Spring 2026 schedule (Tue 5:00-6:15 PM).",
    },
    {
      name: "Grade 9-10 Academic Writing & PAT",
      type: "GROUP",
      tutorEmail: "nicolemacarthur@mywic.ca",
      dayOfWeek: 2,
      startTimeLocal: "18:45",
      durationMinutes: 75,
      programName: "Writing",
      levelName: "Grade 9-10",
      notes:
        "Derived from MMC Calgary Spring 2026 schedule (Tue 6:45-8:00 PM).",
    },
    {
      name: "Grade 4-6 Creative Writing",
      type: "GROUP",
      tutorEmail: "nicolemacarthur@mywic.ca",
      dayOfWeek: 3,
      startTimeLocal: "18:30",
      durationMinutes: 75,
      programName: "Writing",
      levelName: "Grade 4-6",
      notes:
        "Derived from MMC Calgary Spring 2026 schedule (Wed 6:30-7:45 PM).",
    },
    {
      name: "Grade 8-9 Academic Writing & PAT",
      type: "GROUP",
      tutorEmail: "nicolemacarthur@mywic.ca",
      dayOfWeek: 3,
      startTimeLocal: "18:30",
      durationMinutes: 75,
      programName: "Writing",
      levelName: "Grade 8-9",
      notes:
        "Derived from MMC Calgary Spring 2026 schedule (Wed 6:30-7:45 PM).",
    },
    // English LSRW (75 minutes, once per week).
    {
      name: "Grade 2-3 English LSRW",
      type: "GROUP",
      tutorEmail: "hanka.ilott@gmail.com",
      dayOfWeek: 5,
      startTimeLocal: "17:45",
      durationMinutes: 75,
      programName: "English LSRW",
      levelName: "Grade 2-3",
      notes:
        "Derived from MMC Calgary Spring 2026 schedule (Fri 5:45-7:00 PM).",
    },
    {
      name: "Grade 4 English LSRW",
      type: "GROUP",
      tutorEmail: "hanka.ilott@gmail.com",
      dayOfWeek: 5,
      startTimeLocal: "19:15",
      durationMinutes: 75,
      programName: "English LSRW",
      levelName: "Grade 4",
      notes:
        "Derived from MMC Calgary Spring 2026 schedule (Fri 7:15-8:30 PM).",
    },
    {
      name: "Grade 5 English LSRW",
      type: "GROUP",
      tutorEmail: "hanka.ilott@gmail.com",
      dayOfWeek: 6,
      startTimeLocal: "17:30",
      durationMinutes: 75,
      programName: "English LSRW",
      levelName: "Grade 5",
      notes:
        "Derived from MMC Calgary Spring 2026 schedule (Sat 5:30-6:45 PM).",
    },
    {
      name: "Grade 7 English LSRW",
      type: "GROUP",
      tutorEmail: "hanka.ilott@gmail.com",
      dayOfWeek: 6,
      startTimeLocal: "19:00",
      durationMinutes: 75,
      programName: "English LSRW",
      levelName: "Grade 7",
      notes:
        "Derived from MMC Calgary Spring 2026 schedule (Sat 7:00-8:15 PM).",
    },
  ],
  rosterPlaceholders: [],
};
