# Step 20.9 — Designer Copy Fix List
Date: 2026-02-05 (America/Edmonton)

**Scope**
- Parent portal
- Parent login (throttle/lockout messaging)
- Absence request statuses + request UI
- Admin audit log

**Grounded Repo References**
- i18n dictionaries: `messages/en.json`, `messages/zh-CN.json`, `src/i18n/request.ts`
- Parent login page: `src/app/[tenant]/(parent-auth)/parent/login/page.tsx`
- Parent login entry link: `src/app/[tenant]/login/page.tsx`
- Admin audit log page: `src/app/[tenant]/(admin)/admin/audit/page.tsx`
- Admin audit log UI: `src/components/admin/audit/AuditLogClient.tsx`
- Portal header identity: `src/components/parent/ParentShell.tsx`, `src/components/parent/PortalTopNav.tsx`, `src/components/parent/portal/PortalIdentityMenu.tsx`
- Portal requests pages: `src/app/[tenant]/(parent)/portal/requests/page.tsx`, `src/app/[tenant]/(parent)/portal/sessions/[id]/page.tsx`
- Time hint + formatting: `src/components/parent/portal/PortalTimeHint.tsx`, `src/lib/portal/format.ts`

**Prioritized Copy Issues (P0)**
1. Priority: P0
Screen/location: `/[tenant]/portal/requests`, `/[tenant]/portal/sessions/[id]` (parent status labels + filters)
Problem: Parent-facing pending status has two keys (`portal.absence.status.pending` = "Pending", `portal.absence.status.pendingFriendly` = "Pending review"), which risks inconsistent labels in the portal.
Proposed EN string: "Pending review"
Proposed zh-CN string: "待处理"
i18n key(s) impacted: `portal.absence.status.pending` (align to Pending review), `portal.absence.status.pendingFriendly`, `portal.requests.filter.status.pending`
Notes: Keep admin/staff labels as "Pending" unless product wants parity across roles.

2. Priority: P0
Screen/location: `/[tenant]/portal/requests`, `/[tenant]/portal/sessions/[id]` (withdrawn status labels)
Problem: `portal.absence.status.withdrawn` is missing in zh-CN, which can surface raw keys or fallback text for parents.
Proposed EN string: "Withdrawn"
Proposed zh-CN string: "已撤回"
i18n key(s) impacted: `portal.absence.status.withdrawn` (MISSING zh-CN value)
Notes: This key is used by parent status label helpers in the portal pages above.

3. Priority: P0
Screen/location: `/[tenant]/parent/login` (throttle + lockout banners)
Problem: Throttle/lockout messaging should be consistently friendly and should always surface minutes when provided.
Proposed EN string: "Too many attempts. Try again in a few minutes." (throttle body)
Proposed zh-CN string: "尝试次数过多，请稍后再试。"
i18n key(s) impacted: `portal.auth.throttle.body`, `portal.auth.throttle.retryAfter`, `portal.auth.lockout.body.withTime`, `portal.auth.lockout.body.noTime`, `portal.auth.lockout.buttonHelper`
Notes: Keep `portal.auth.throttle.retryAfter` as "Try again in {minutes} minutes." and mirror the same tone in lockout fallbacks.

4. Priority: P0
Screen/location: `/[tenant]/admin/audit` (audit event labels)
Problem: Current parent auth audit labels feel technical/blamey; should be neutral and consistent.
Proposed EN string: "Parent sign-in failed", "Parent sign-in throttled", "Parent sign-in locked"
Proposed zh-CN string: "家长登录未成功", "家长登录受限", "家长登录被暂时锁定"
i18n key(s) impacted: `admin.audit.event.parentLoginFailed`, `admin.audit.event.parentLoginThrottled`, `admin.audit.event.parentLoginLocked`
Notes: Keep audit labels factual without implying wrongdoing.

**Prioritized Copy Issues (P1)**
1. Priority: P1
Screen/location: `/[tenant]/portal/help` (timezone FAQ)
Problem: Timezone help text should align with the "Times shown in {tz}" hint language used across portal pages.
Proposed EN string: "Times are shown in the center's timezone (shown on each page)."
Proposed zh-CN string: "课程时间按校区时区显示（每个页面都会提示）。"
i18n key(s) impacted: `portal.help.a.timezone`, `portal.timeHint.label`, `portal.timeHint.local`
Notes: Ensure help text matches the visible hint phrasing.

2. Priority: P1
Screen/location: `/[tenant]/portal/sessions/[id]` (parent-visible note)
Problem: Parent note label/helper should emphasize "shared with parents" and avoid implying internal notes exist.
Proposed EN string: "Note shared with parents" (label) and "Shared by your tutor/center and visible to parents." (helper)
Proposed zh-CN string: "家长可见留言" (label) and "此留言由老师/校区填写，并会显示给家长。" (helper)
i18n key(s) impacted: `portal.sessionDetail.section.parentNote`, `portal.sessionDetail.parentNote.helper`
Notes: Keep helper short and reassuring.

3. Priority: P1
Screen/location: `/[tenant]/portal` and `/[tenant]/portal/students` empty states
Problem: Empty states should suggest a safe next step without implying new features.
Proposed EN string: "Once your center links students to your account, you'll see them here. If this looks wrong, please contact your center admin." (no students)
Proposed zh-CN string: "当校区将孩子关联到您的账号后，您会在这里看到相关信息。如有疑问，请联系校区管理员。"
i18n key(s) impacted: `portal.empty.noStudents.body`, `portal.empty.noUpcomingSessions.body`, `portal.requests.empty.body`, `portal.requests.empty.cta`
Notes: Also consider "Try adjusting the date range" for no upcoming sessions and a "Go to Sessions" CTA for requests.

**Prioritized Copy Issues (P2)**
1. Priority: P2
Screen/location: `/[tenant]/parent/login`
Problem: Invalid-credentials copy contains a smart apostrophe that can render as mojibake in some environments.
Proposed EN string: "We couldn't sign you in. Please check your email and access code."
Proposed zh-CN string: "无法登录，请检查邮箱和访问码。"
i18n key(s) impacted: `portal.auth.error.invalidCredentials`
Notes: Prefer ASCII apostrophes to avoid encoding issues.

2. Priority: P2
Screen/location: `/[tenant]/portal/requests`, `/[tenant]/portal/sessions/[id]`
Problem: Hyphenation varies between "Re-submit", "Re-submitting", and "re-submitted", creating minor tone drift.
Proposed EN string: Standardize to "Resubmit" / "Resubmitting" / "Resubmitted" (no hyphen)
Proposed zh-CN string: "重新提交" (no change)
i18n key(s) impacted: `portal.absence.action.resubmit`, `portal.absence.resubmit.modal.title`, `portal.absence.resubmit.modal.body`, `portal.absence.resubmit.modal.confirm`, `portal.absence.toast.resubmitted`
Notes: Optional polish; keep if the product prefers hyphenated forms.

**Status Vocabulary Standardization (Parent + Admin/Staff)**
| Status enum (canonical) | Parent-facing EN | Parent-facing zh-CN | Admin/staff-facing EN | Admin/staff-facing zh-CN |
| --- | --- | --- | --- | --- |
| Pending | Pending review | 待处理 | Pending | 待处理 |
| Approved | Approved | 已批准 | Approved | 已批准 |
| Declined | Declined | 已拒绝 | Declined | 已拒绝 |
| Withdrawn | Withdrawn | 已撤回 | Withdrawn | 已撤回 |

Note: For parents, use "Pending review" consistently (avoid plain "Pending") while keeping the enum value as `PENDING`.

**Error/Empty State Tone Rules**
- Friendly, non-technical language.
- Never confirm whether an email exists.
- Never imply schedule mutation for absence requests.
- Offer a safe next step (view sessions or contact center admin).
- Avoid blame wording like "wrong" or "invalid"; prefer "couldn't" and "please check".
- Keep zh-CN phrasing natural and not overly literal.
- Keep sentences short for 320px readability.

**Missing Keys (if applicable)**
- `portal.absence.status.withdrawn` is missing a zh-CN value; suggest "已撤回".
- Optional if standardizing status keys: `portal.status.pendingReview`, `portal.status.approved`, `portal.status.declined`, `portal.status.withdrawn` (MISSING KEY) to reduce duplication across portal/admin/staff.
