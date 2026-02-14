/**
 * @state.route /[tenant]/tutor/notifications
 * @state.area tutor
 * @state.capabilities view:list
 * @state.notes Step 23.3 tutor notifications inbox page.
 */
// Tutor notifications page renders the shared inbox client with tutor surface styling.
import NotificationsInboxClient from "@/components/notifications/NotificationsInboxClient";

type TutorNotificationsPageProps = {
  params: Promise<{ tenant: string }>;
};

export default async function TutorNotificationsPage({
  params,
}: TutorNotificationsPageProps) {
  const { tenant } = await params;
  return <NotificationsInboxClient tenant={tenant} surface="tutor" />;
}
