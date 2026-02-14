// Centralized audit constants keep action/entity strings stable across writes + filters.
export const AUDIT_ACTIONS = {
  // Step 22.6 action keys use dot notation for stable filtering and CSV export.
  REQUEST_RESOLVED: "request.resolved",
  SESSIONS_GENERATED: "sessions.generated",
  SESSIONS_BULK_CANCELED: "sessions.bulkCanceled",
  GROUP_FUTURE_SESSIONS_SYNCED: "group.futureSessions.synced",
  ATTENDANCE_UPDATED: "attendance.updated",
  NOTES_UPDATED: "notes.updated",
  PARENT_INVITE_SENT: "parent.invite.sent",
  PARENT_INVITE_RESENT: "parent.invite.resent",
  PARENT_LOGIN_SUCCEEDED: "PARENT_LOGIN_SUCCEEDED",
  PARENT_LOGIN_FAILED: "PARENT_LOGIN_FAILED",
  PARENT_LOGIN_THROTTLED: "PARENT_LOGIN_THROTTLED",
  PARENT_ACCESS_CODE_RESET: "PARENT_ACCESS_CODE_RESET",
  // Admin-only onboarding actions for parent invite workflows.
  PARENT_INVITE_COPIED: "PARENT_INVITE_COPIED",
  PARENT_LINKED_TO_STUDENT: "PARENT_LINKED_TO_STUDENT",
  ABSENCE_REQUEST_CREATED: "ABSENCE_REQUEST_CREATED",
  ABSENCE_REQUEST_WITHDRAWN: "ABSENCE_REQUEST_WITHDRAWN",
  ABSENCE_REQUEST_RESUBMITTED: "ABSENCE_REQUEST_RESUBMITTED",
  ABSENCE_REQUEST_RESOLVED: "ABSENCE_REQUEST_RESOLVED",
  ATTENDANCE_PARENT_VISIBLE_NOTE_UPDATED:
    "ATTENDANCE_PARENT_VISIBLE_NOTE_UPDATED",
  // Step 22.8 admin announcement lifecycle actions.
  ANNOUNCEMENT_CREATED: "announcement.created",
  ANNOUNCEMENT_UPDATED: "announcement.updated",
  ANNOUNCEMENT_PUBLISHED: "announcement.published",
  ANNOUNCEMENT_ARCHIVED: "announcement.archived",
  // Step 22.9 session resources lifecycle + bulk apply actions.
  SESSION_RESOURCE_CREATED: "sessionResource.created",
  SESSION_RESOURCE_UPDATED: "sessionResource.updated",
  SESSION_RESOURCE_DELETED: "sessionResource.deleted",
  SESSION_RESOURCE_BULK_APPLIED: "sessionResource.bulkApplied",
  // Step 23.2 homework workflow + file lifecycle actions.
  HOMEWORK_STATUS_CHANGED: "homework.status.changed",
  HOMEWORK_FILE_UPLOADED: "homework.file.uploaded",
  HOMEWORK_BULK_REVIEWED: "homework.bulk.reviewed",
  // Step 23.3 notification lifecycle actions capture fanout creation and recipient bulk read updates.
  NOTIFICATION_CREATED: "notification.created",
  NOTIFICATION_BULK_MARKED_READ: "notification.bulkMarkedRead",
  // Reporting export action for admin CSV downloads.
  REPORT_EXPORTED: "REPORT_EXPORTED",
} as const;

// Entity types are intentionally minimal and filter-friendly for admin audit queries.
export const AUDIT_ENTITY_TYPES = {
  GROUP: "GROUP",
  PARENT: "PARENT",
  ACCESS_CODE: "ACCESS_CODE",
  REQUEST: "REQUEST",
  ATTENDANCE: "ATTENDANCE",
  SESSION: "SESSION",
  STUDENT: "STUDENT",
  ANNOUNCEMENT: "ANNOUNCEMENT",
  HOMEWORK: "HOMEWORK",
  NOTIFICATION: "NOTIFICATION",
  // REPORT entity type scopes audit entries to reporting exports.
  REPORT: "REPORT",
} as const;

// Auth-related actions are grouped for category filtering on admin audit endpoints.
export const AUDIT_AUTH_ACTIONS = [
  AUDIT_ACTIONS.PARENT_LOGIN_SUCCEEDED,
  AUDIT_ACTIONS.PARENT_LOGIN_FAILED,
  AUDIT_ACTIONS.PARENT_LOGIN_THROTTLED,
  AUDIT_ACTIONS.PARENT_ACCESS_CODE_RESET,
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];
export type AuditEntityType =
  (typeof AUDIT_ENTITY_TYPES)[keyof typeof AUDIT_ENTITY_TYPES];
