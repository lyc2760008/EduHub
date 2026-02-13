/**
 * @state.route /[tenant]/portal/announcements/[id]
 * @state.area parent
 * @state.capabilities view:detail
 * @state.notes Step 22.8 parent announcement detail page.
 */
// Parent announcement detail page resolves tenant/id params and renders the read-marking detail client.
import ParentAnnouncementDetailClient from "@/components/parent/announcements/ParentAnnouncementDetailClient";

type ParentAnnouncementDetailPageProps = {
  params: Promise<{ tenant: string; id: string }>;
};

export default async function ParentAnnouncementDetailPage({
  params,
}: ParentAnnouncementDetailPageProps) {
  const { tenant, id } = await params;
  return <ParentAnnouncementDetailClient tenant={tenant} announcementId={id} />;
}
