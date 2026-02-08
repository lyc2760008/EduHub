# MMC Pilot — Admin Quick Start (管理员快速上手)

## 1) What you’ll do most often / 常用操作
- Link a parent to a student / 关联家长与孩子
- Reset access code / 重置访问码
- Copy invite message / 复制邀请信息
- Help parents troubleshoot login / 协助家长排查登录问题

## 2) Link a parent to a student / 如何关联家长与孩子
EN
1. Open **Admin → Students**.
2. Select the student you want to link.
3. Go to the **Parents** section.
4. Choose **Link existing parent** (or **Create parent**, if available).
5. Enter/select the parent email and confirm.
6. Confirm the parent now appears in the Parents list.

zh-CN
1. 打开 **管理端 → 孩子（Students）**。
2. 选择需要关联的孩子。
3. 在页面中找到 **家长（Parents）** 区域。
4. 选择 **关联已有家长**（如有）或 **创建家长账号**（如有）。
5. 输入/选择家长邮箱并确认。
6. 确认家长已出现在家长列表中。

Notes / 注意
- Linking is tenant-scoped. Make sure you are in the correct MMC tenant.  
  关联仅在当前租户生效，请确认在正确的 MMC 租户中操作。

## 3) Reset access code / 如何重置访问码
EN
1. Open the student and find the linked parent in **Parents**.
2. Click **Reset access code**.
3. The system will generate a new code. Copy it immediately.
4. Share it with the parent **securely** (see next section).

zh-CN
1. 打开孩子详情，在 **家长（Parents）** 区域找到对应家长。
2. 点击 **重置访问码（Reset access code）**。
3. 系统会生成新的访问码，请立即复制/记录。
4. 通过 **安全方式** 单独发送给家长（见下一节）。

Important / 重要
- Do **not** paste access codes into public group chats or open channels.  
  **不要**在微信群/群聊/公开频道发送访问码。

## 4) Copy invite message / 如何复制邀请信息（要说什么 + 不要说什么）
EN — Recommended flow
1. In the parent row, click **Copy invite message**.
2. Choose language (EN or zh-CN).
3. Click **Copy** and paste the message to the parent.
4. Send the access code **separately**.

What the invite message includes
- Portal link (tenant-scoped)
- Parent email
- Simple login instructions

What NOT to share in the invite message
- Do NOT include the access code in the message body.
- Do NOT share internal staff notes or internal-only links.

zh-CN — 推荐流程
1. 在家长行点击 **复制邀请信息（Copy invite message）**。
2. 选择语言（中文/英文）。
3. 点击 **复制**，将内容发送给家长。
4. 访问码请 **单独**发送（更安全）。

邀请信息包含
- 家长端链接（租户专属）
- 家长邮箱
- 简单登录说明

邀请信息中不要包含
- 不要在邀请信息正文里写访问码
- 不要发送内部备注或内部链接

## 5) Troubleshooting parent login / 家长登录问题排查
EN
If a parent cannot sign in:
1) Confirm they’re using the correct **portal link** (MMC tenant).
2) Confirm they’re using the same **email** you linked.
3) Ask them to try again after a few minutes if they see “Too many attempts” (cooldown).
4) If still blocked, **reset access code** and share the new code securely.
5) If the parent sees missing students/sessions, confirm the parent is linked to the correct student and the student has scheduled sessions.

zh-CN
家长无法登录时：
1) 确认家长使用的是正确的 **家长端链接**（MMC 租户）。
2) 确认家长使用的 **邮箱** 与系统中关联的一致。
3) 如果提示尝试过多/被暂时锁定，让家长 **稍等几分钟**后再试。
4) 仍无法登录时，**重置访问码**并通过安全方式发送新访问码。
5) 如果家长看不到孩子/课程，确认家长已正确关联孩子，且孩子确实有排课。

Escalation / 升级处理
- If issues persist, record: parent email, student name, screenshot of error (no codes), and report to internal support/dev.  
  如仍有问题，请记录：家长邮箱、孩子姓名、报错截图（不要包含访问码），并提交给内部支持/开发。
