/**
 * @state.route /[tenant]/portal/announcements
 * @state.area parent
 * @state.capabilities view:list
 * @state.notes Step 22.8 parent announcements feed page.
 */
// Parent announcements page forwards tenant params into the parent feed client.
import ParentAnnouncementsFeedClient from "@/components/parent/announcements/ParentAnnouncementsFeedClient";

type ParentAnnouncementsPageProps = {
  params: Promise<{ tenant: string }>;
};

export default async function ParentAnnouncementsPage({
  params,
}: ParentAnnouncementsPageProps) {
  const { tenant } = await params;
  return <ParentAnnouncementsFeedClient tenant={tenant} />;
}
