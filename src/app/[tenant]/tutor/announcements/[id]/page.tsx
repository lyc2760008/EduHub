/**
 * @state.route /[tenant]/tutor/announcements/[id]
 * @state.area tutor
 * @state.capabilities view:detail
 * @state.notes Step 22.8 tutor announcement detail page.
 */
// Tutor announcement detail page resolves route params and renders the shared tutor detail client.
import TutorAnnouncementDetailClient from "@/components/tutor/TutorAnnouncementDetailClient";

type TutorAnnouncementDetailPageProps = {
  params: Promise<{ tenant: string; id: string }>;
};

export default async function TutorAnnouncementDetailPage({
  params,
}: TutorAnnouncementDetailPageProps) {
  const { tenant, id } = await params;
  return <TutorAnnouncementDetailClient tenant={tenant} announcementId={id} />;
}
