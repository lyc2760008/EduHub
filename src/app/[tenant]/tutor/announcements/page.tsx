/**
 * @state.route /[tenant]/tutor/announcements
 * @state.area tutor
 * @state.capabilities view:list
 * @state.notes Step 22.8 tutor announcements feed page.
 */
// Tutor announcements page forwards tenant params into the tutor feed client.
import TutorAnnouncementsFeedClient from "@/components/tutor/TutorAnnouncementsFeedClient";

type TutorAnnouncementsPageProps = {
  params: Promise<{ tenant: string }>;
};

export default async function TutorAnnouncementsPage({
  params,
}: TutorAnnouncementsPageProps) {
  const { tenant } = await params;
  return <TutorAnnouncementsFeedClient tenant={tenant} />;
}
