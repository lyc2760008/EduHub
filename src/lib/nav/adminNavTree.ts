// Centralized admin nav tree keeps sidebar + drawer in sync with RBAC gating.
import type { Role } from "@/generated/prisma/client";

export type AdminNavGroupId = "people" | "setup" | "operations" | "reports";
export type AdminNavMatch = "exact" | "prefix";

export type AdminNavItem = {
  id: string;
  href: string;
  labelKey: string;
  titleKey: string;
  iconKey: string;
  match: AdminNavMatch;
  roles: Role[];
};

export type AdminNavGroup = {
  id: AdminNavGroupId;
  labelKey: string;
  href?: string;
  items: AdminNavItem[];
};

const ADMIN_ONLY: Role[] = ["Owner", "Admin"];
const ADMIN_OR_TUTOR: Role[] = ["Owner", "Admin", "Tutor"];

// Top-level items sit above grouped navigation in the sidebar.
export const ADMIN_NAV_TOP_ITEMS: AdminNavItem[] = [
  {
    id: "dashboard",
    href: "/admin",
    labelKey: "admin.nav.dashboard",
    titleKey: "admin.dashboard.title",
    iconKey: "dashboard",
    match: "exact",
    roles: ADMIN_ONLY,
  },
];

// Single source of truth for the admin sidebar/drawer navigation.
export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    id: "people",
    labelKey: "admin.nav.group.people",
    items: [
      {
        id: "students",
        href: "/admin/students",
        labelKey: "admin.nav.students",
        titleKey: "admin.students.title",
        iconKey: "students",
        match: "prefix",
        roles: ADMIN_ONLY,
      },
      {
        id: "parents",
        href: "/admin/parents",
        labelKey: "admin.nav.parents",
        titleKey: "admin.parentsList.title",
        iconKey: "parents",
        match: "prefix",
        roles: ADMIN_ONLY,
      },
      {
        id: "staff",
        // Staff list is implemented in the users route but stays labeled as Staff.
        href: "/admin/users",
        labelKey: "admin.nav.staff",
        titleKey: "admin.staffList.title",
        iconKey: "staff",
        match: "prefix",
        roles: ADMIN_ONLY,
      },
    ],
  },
  {
    id: "setup",
    labelKey: "admin.nav.group.setup",
    items: [
      {
        id: "centers",
        href: "/admin/centers",
        labelKey: "admin.nav.centers",
        titleKey: "admin.centers.title",
        iconKey: "centers",
        match: "prefix",
        roles: ADMIN_ONLY,
      },
      {
        id: "groups",
        href: "/admin/groups",
        labelKey: "admin.nav.groups",
        titleKey: "admin.groupsList.title",
        iconKey: "groups",
        match: "prefix",
        roles: ADMIN_ONLY,
      },
      {
        id: "programs",
        href: "/admin/programs",
        labelKey: "admin.nav.programs",
        titleKey: "admin.programsList.title",
        iconKey: "programs",
        match: "prefix",
        roles: ADMIN_ONLY,
      },
      {
        id: "subjects",
        href: "/admin/subjects",
        labelKey: "admin.nav.subjects",
        titleKey: "admin.subjectsList.title",
        iconKey: "subjects",
        match: "prefix",
        roles: ADMIN_ONLY,
      },
      {
        id: "levels",
        href: "/admin/levels",
        labelKey: "admin.nav.levels",
        titleKey: "admin.levelsList.title",
        iconKey: "levels",
        match: "prefix",
        roles: ADMIN_ONLY,
      },
    ],
  },
  {
    id: "operations",
    labelKey: "admin.nav.group.operations",
    items: [
      {
        id: "sessions",
        href: "/admin/sessions",
        labelKey: "admin.nav.sessions",
        titleKey: "admin.sessions.title",
        iconKey: "sessions",
        match: "prefix",
        roles: ADMIN_OR_TUTOR,
      },
      {
        id: "requests",
        href: "/admin/requests",
        labelKey: "admin.nav.requests",
        titleKey: "admin.requests.title",
        iconKey: "requests",
        match: "prefix",
        roles: ADMIN_ONLY,
      },
      {
        id: "audit",
        href: "/admin/audit",
        labelKey: "admin.nav.audit",
        titleKey: "admin.audit.title",
        iconKey: "audit",
        match: "prefix",
        roles: ADMIN_ONLY,
      },
      {
        id: "help",
        href: "/admin/help",
        labelKey: "admin.nav.help",
        titleKey: "admin.nav.help",
        iconKey: "help",
        match: "prefix",
        roles: ADMIN_ONLY,
      },
    ],
  },
  {
    id: "reports",
    labelKey: "admin.nav.group.reports",
    href: "/admin/reports",
    items: [
      {
        id: "reports",
        href: "/admin/reports",
        labelKey: "admin.nav.reportsHome",
        titleKey: "admin.reports.index.title",
        iconKey: "reports",
        match: "exact",
        roles: ADMIN_ONLY,
      },
      {
        id: "reports-upcoming",
        href: "/admin/reports/upcoming-sessions",
        labelKey: "admin.nav.report.upcomingSessions",
        titleKey: "admin.reports.upcoming.title",
        iconKey: "reports",
        match: "exact",
        roles: ADMIN_ONLY,
      },
      {
        id: "reports-attendance",
        href: "/admin/reports/attendance-summary",
        labelKey: "admin.nav.report.attendanceSummary",
        titleKey: "admin.reports.attendance.title",
        iconKey: "reports",
        match: "exact",
        roles: ADMIN_ONLY,
      },
      {
        id: "reports-requests",
        href: "/admin/reports/absence-requests",
        labelKey: "admin.nav.report.absenceRequests",
        titleKey: "admin.reports.requests.title",
        iconKey: "reports",
        match: "exact",
        roles: ADMIN_ONLY,
      },
      {
        id: "reports-workload",
        href: "/admin/reports/tutor-workload",
        labelKey: "admin.nav.report.tutorWorkload",
        titleKey: "admin.reports.workload.title",
        iconKey: "reports",
        match: "exact",
        roles: ADMIN_ONLY,
      },
      {
        id: "reports-students",
        href: "/admin/reports/students-directory",
        labelKey: "admin.nav.report.studentsDirectory",
        titleKey: "admin.reports.students.title",
        iconKey: "reports",
        match: "exact",
        roles: ADMIN_ONLY,
      },
    ],
  },
];

// Helper keeps menu logic focused on groups + items rather than hardcoded arrays.
export function getAdminNavGroupIds(groups: AdminNavGroup[]) {
  return groups.map((group) => group.id);
}
