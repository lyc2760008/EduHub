# Step 21.0 — Launch Content Pack (EN + zh-CN)
Date: 2026-02-04 (America/Edmonton)

**Scope**
- Parent portal Help/Account content (trust + support)
- Parent login hardening copy confirmation (throttle/lockout)
- Portal + Admin production-friendly generic errors
- Status vocabulary reinforcement (Pending review / Approved / Declined / Withdrawn)

**Repo References**
- i18n dictionaries: `messages/en.json`
- i18n dictionaries: `messages/zh-CN.json`
- i18n loader: `src/i18n/request.ts`
- Help page: `src/app/[tenant]/(parent)/portal/help/page.tsx`
- Parent login page: `src/app/[tenant]/(parent-auth)/parent/login/page.tsx`
- Portal account page: `src/app/[tenant]/(parent)/portal/account/page.tsx`
- Shared portal empty states: `src/components/parent/EmptyState.tsx`
- Shared portal empty states: `src/components/parent/portal/PortalEmptyState.tsx`
- Portal generic error usage: `src/app/[tenant]/(parent)/portal/page.tsx`
- Portal not-available error usage: `src/app/[tenant]/(parent)/portal/sessions/[id]/page.tsx`
- Portal not-available error usage: `src/app/[tenant]/(parent)/portal/students/[id]/page.tsx`
- Admin requests inbox: `src/app/[tenant]/(admin)/admin/requests/page.tsx`
- Admin requests errors: `src/components/admin/requests/RequestsClient.tsx`
- Admin audit log: `src/app/[tenant]/(admin)/admin/audit/page.tsx`
- Admin audit errors: `src/components/admin/audit/AuditLogClient.tsx`
- Error boundary patterns: Not found in repo search

**Support Contact Pattern — Usage Notes**
- Decision: support contact is text-only (no in-app messaging).
- Primary instruction: “Contact your center admin” plus tenant/center contact info when available.
- Variables: `{centerName}`, `{supportEmail}`, `{supportPhone}`, `{supportHours}`.
- Data mapping (existing): `{centerName}` can use `tenant.displayName` from `src/app/api/portal/me/route.ts` or `tenant.name` / `center.name` in admin context.
- Data mapping (missing): `supportEmail`, `supportPhone`, `supportHours` not found in repo search or schema (no existing fields).
- Fallback rule: if no contact info is available, show generic guidance to contact the center using `{centerName}` = “your center” / “??”.
- Phone formatting rule: if `supportPhone` exists, append `portal.support.phonePart` or `admin.support.phonePart`.
- Optional hours rule: if `supportHours` exists, append `portal.support.hoursLine` / `admin.support.hoursLine`.
- Where shown (Portal): Help page FAQ item, Account page “Need help?” block, portal generic error callouts (where space allows).
- Where shown (Admin): Requests inbox and Audit Log error callouts.

**Final Help/FAQ Content (Portal)**
Notes: Align to existing `portal.help.q.*` / `portal.help.a.*` keys and add new keys for contact + safety + parent-visible notes.

```yaml
portal.help.title:
  en: "Help"
  zh-CN: "??"
portal.help.helper:
  en: "Common questions about using the Parent Portal."
  zh-CN: "???????????"

portal.help.q.gettingStarted:
  en: "What can I do in the Parent Portal?"
  zh-CN: "?????????"
portal.help.a.gettingStarted:
  en: "You can view linked students, upcoming sessions, attendance history, session details, and absence request statuses."
  zh-CN: "??????????????????????????????????????"

portal.help.q.missingStudents:
  en: "Why is a student missing or incorrect?"
  zh-CN: "??????????????"
portal.help.a.missingStudents:
  en: "Student links are managed by your center. If something looks wrong, contact your center admin for help."
  zh-CN: "???????????????,?????????????"

portal.help.q.timezone:
  en: "Which timezone are session times shown in?"
  zh-CN: "????????????"
portal.help.a.timezone:
  en: "Session times are shown in {tz}. You’ll see the timezone on each page."
  zh-CN: "????? {tz} ????????????????"

portal.help.q.attendanceStatuses:
  en: "What do attendance statuses mean?"
  zh-CN: "?????????"
portal.help.a.attendanceStatuses:
  en: "Attendance is marked by staff after sessions. You may see statuses like Present, Absent, Late, or Excused absent when applicable."
  zh-CN: "????????????????????“??/??/??/????”???(???)?"

portal.help.q.parentVisibleNotes: # MISSING KEY
  en: "What are parent-visible notes?"
  zh-CN: "??????????"
portal.help.a.parentVisibleNotes: # MISSING KEY
  en: "Some sessions may include a note shared with parents. Internal staff notes are never shown in the Parent Portal."
  zh-CN: "?????????“??????”??????????????????"

portal.help.q.accessCodeSafety: # MISSING KEY
  en: "How should I keep my access code safe?"
  zh-CN: "??????????"
portal.help.a.accessCodeSafety: # MISSING KEY
  en: "Keep your access code private. If you think it was shared by mistake, contact your center admin."
  zh-CN: "?????????????????,?????????"

portal.help.q.absenceRequests:
  en: "How do absence requests work?"
  zh-CN: "?????????"
portal.help.a.absenceRequests:
  en: "You can submit an absence request for an upcoming session. Staff will review it as Pending review, Approved, Declined, or Withdrawn. Requests do not cancel or reschedule sessions."
  zh-CN: "?????????????????????????????“???/???/???/???”???????????????"

portal.help.q.contactSupport: # MISSING KEY
  en: "How do I contact support?"
  zh-CN: "???????"
portal.help.a.contactSupport: # MISSING KEY
  en: "{supportContactLine}"
  zh-CN: "{supportContactLine}"
```

**Production-Friendly Error Messaging (Portal + Admin)**
Notes: `portal.auth.lockout.body` is an object; use `portal.auth.lockout.body.withTime` and `portal.auth.lockout.body.noTime` in copy updates.

```yaml
portal.error.generic.title:
  en: "Something went wrong"
  zh-CN: "???????"
portal.error.generic.body:
  en: "We couldn’t load this page. Please try again."
  zh-CN: "??????,??????"

portal.error.notAvailable.title:
  en: "Page not available"
  zh-CN: "?????"
portal.error.notAvailable.body:
  en: "This page may have been removed or you may not have access."
  zh-CN: "??????????????????"
portal.error.notAvailable.cta:
  en: "Back to Dashboard"
  zh-CN: "????"

portal.auth.throttle.title:
  en: "Please slow down"
  zh-CN: "?????"
portal.auth.throttle.body:
  en: "Too many attempts in a short time. Please try again soon."
  zh-CN: "??????????,??????"
portal.auth.throttle.retryAfter:
  en: "Try again in {minutes} minutes."
  zh-CN: "{minutes} ??????"

portal.auth.lockout.title:
  en: "Temporarily locked"
  zh-CN: "?????"
portal.auth.lockout.body.withTime:
  en: "For your security, sign-in is temporarily locked. Try again in {minutes} minutes."
  zh-CN: "?????,????????{minutes} ??????"
portal.auth.lockout.body.noTime:
  en: "For your security, sign-in is temporarily locked. Please wait a few minutes and try again."
  zh-CN: "?????,??????????????????"

admin.error.generic.title: # MISSING KEY
  en: "Something went wrong"
  zh-CN: "???????"
admin.error.generic.body: # MISSING KEY
  en: "Please try again."
  zh-CN: "??????"
```

**Status Vocabulary (Launch Standard)**
| Status | Key | Parent-facing label (EN) | Parent-facing label (zh-CN) |
| --- | --- | --- | --- |
| Pending | `portal.absence.status.pendingFriendly` | Pending review | ??? |
| Approved | `portal.absence.status.approved` | Approved | ??? |
| Declined | `portal.absence.status.declined` | Declined | ??? |
| Withdrawn | `portal.absence.status.withdrawn` | Withdrawn | ??? |

**Missing Keys To Add Later**
- `portal.support.contactLine`
- `portal.support.phonePart`
- `portal.support.hoursLine`
- `admin.support.contactLine`
- `admin.support.hoursLine`
- `portal.help.q.parentVisibleNotes`
- `portal.help.a.parentVisibleNotes`
- `portal.help.q.accessCodeSafety`
- `portal.help.a.accessCodeSafety`
- `portal.help.q.contactSupport`
- `portal.help.a.contactSupport`
- `admin.error.generic.title`
- `admin.error.generic.body`

**Key Inventory (EN + zh-CN)**
```yaml
# Support contact (shared)
portal.support.contactLine: # MISSING KEY
  en: "Need help? Contact {centerName} at {supportEmail}{supportPhonePart}."
  zh-CN: "???????? {centerName}:{supportEmail}{supportPhonePart}?"
portal.support.phonePart: # MISSING KEY
  en: " or call {supportPhone}"
  zh-CN: " ??? {supportPhone}"
portal.support.hoursLine: # MISSING KEY
  en: "Support hours: {supportHours}."
  zh-CN: "????:{supportHours}?"

admin.support.contactLine: # MISSING KEY
  en: "Need help? Contact your center admin at {supportEmail}{supportPhonePart}."
  zh-CN: "?????????????:{supportEmail}{supportPhonePart}?"
admin.support.hoursLine: # MISSING KEY
  en: "Support hours: {supportHours}."
  zh-CN: "????:{supportHours}?"

# Help / FAQ (Portal) — finalize
portal.help.title:
  en: "Help"
  zh-CN: "??"
portal.help.helper:
  en: "Common questions about using the Parent Portal."
  zh-CN: "???????????"

portal.help.q.gettingStarted:
  en: "What can I do in the Parent Portal?"
  zh-CN: "?????????"
portal.help.a.gettingStarted:
  en: "You can view linked students, upcoming sessions, attendance history, session details, and absence request statuses."
  zh-CN: "??????????????????????????????????????"

portal.help.q.missingStudents:
  en: "Why is a student missing or incorrect?"
  zh-CN: "??????????????"
portal.help.a.missingStudents:
  en: "Student links are managed by your center. If something looks wrong, contact your center admin for help."
  zh-CN: "???????????????,?????????????"

portal.help.q.timezone:
  en: "Which timezone are session times shown in?"
  zh-CN: "????????????"
portal.help.a.timezone:
  en: "Session times are shown in {tz}. You’ll see the timezone on each page."
  zh-CN: "????? {tz} ????????????????"

portal.help.q.attendanceStatuses:
  en: "What do attendance statuses mean?"
  zh-CN: "?????????"
portal.help.a.attendanceStatuses:
  en: "Attendance is marked by staff after sessions. You may see statuses like Present, Absent, Late, or Excused absent when applicable."
  zh-CN: "????????????????????“??/??/??/????”???(???)?"

portal.help.q.parentVisibleNotes: # MISSING KEY
  en: "What are parent-visible notes?"
  zh-CN: "??????????"
portal.help.a.parentVisibleNotes: # MISSING KEY
  en: "Some sessions may include a note shared with parents. Internal staff notes are never shown in the Parent Portal."
  zh-CN: "?????????“??????”??????????????????"

portal.help.q.accessCodeSafety: # MISSING KEY
  en: "How should I keep my access code safe?"
  zh-CN: "??????????"
portal.help.a.accessCodeSafety: # MISSING KEY
  en: "Keep your access code private. If you think it was shared by mistake, contact your center admin."
  zh-CN: "?????????????????,?????????"

portal.help.q.absenceRequests:
  en: "How do absence requests work?"
  zh-CN: "?????????"
portal.help.a.absenceRequests:
  en: "You can submit an absence request for an upcoming session. Staff will review it as Pending review, Approved, Declined, or Withdrawn. Requests do not cancel or reschedule sessions."
  zh-CN: "?????????????????????????????“???/???/???/???”???????????????"

portal.help.q.contactSupport: # MISSING KEY
  en: "How do I contact support?"
  zh-CN: "???????"
portal.help.a.contactSupport: # MISSING KEY
  en: "{supportContactLine}"
  zh-CN: "{supportContactLine}"

# Portal error messaging (production-friendly)
portal.error.generic.title:
  en: "Something went wrong"
  zh-CN: "???????"
portal.error.generic.body:
  en: "We couldn’t load this page. Please try again."
  zh-CN: "??????,??????"

portal.error.notAvailable.title:
  en: "Page not available"
  zh-CN: "?????"
portal.error.notAvailable.body:
  en: "This page may have been removed or you may not have access."
  zh-CN: "??????????????????"
portal.error.notAvailable.cta:
  en: "Back to Dashboard"
  zh-CN: "????"

# Auth throttled/lockout (launch wording)
portal.auth.throttle.title:
  en: "Please slow down"
  zh-CN: "?????"
portal.auth.throttle.body:
  en: "Too many attempts in a short time. Please try again soon."
  zh-CN: "??????????,??????"
portal.auth.throttle.retryAfter:
  en: "Try again in {minutes} minutes."
  zh-CN: "{minutes} ??????"

portal.auth.lockout.title:
  en: "Temporarily locked"
  zh-CN: "?????"
portal.auth.lockout.body.withTime:
  en: "For your security, sign-in is temporarily locked. Try again in {minutes} minutes."
  zh-CN: "?????,????????{minutes} ??????"
portal.auth.lockout.body.noTime:
  en: "For your security, sign-in is temporarily locked. Please wait a few minutes and try again."
  zh-CN: "?????,??????????????????"

# Status vocabulary (launch standard)
portal.absence.status.pendingFriendly:
  en: "Pending review"
  zh-CN: "???"
portal.absence.status.approved:
  en: "Approved"
  zh-CN: "???"
portal.absence.status.declined:
  en: "Declined"
  zh-CN: "???"
portal.absence.status.withdrawn:
  en: "Withdrawn"
  zh-CN: "???"

# Admin generic error (optional)
admin.error.generic.title: # MISSING KEY
  en: "Something went wrong"
  zh-CN: "???????"
admin.error.generic.body: # MISSING KEY
  en: "Please try again."
  zh-CN: "??????"
```
