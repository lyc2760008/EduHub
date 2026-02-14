/**
 * @state.route /[tenant]/portal/notifications
 * @state.area parent
 * @state.capabilities view:list
 * @state.notes Step 23.3 parent notifications inbox page.
 */
// Parent notifications page renders the shared inbox client with portal styling.
import NotificationsInboxClient from "@/components/notifications/NotificationsInboxClient";

type ParentNotificationsPageProps = {
  params: Promise<{ tenant: string }>;
};

export default async function ParentNotificationsPage({
  params,
}: ParentNotificationsPageProps) {
  const { tenant } = await params;
  return <NotificationsInboxClient tenant={tenant} surface="portal" />;
}
