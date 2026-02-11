/**
 * @state.route /[tenant]/tutor/sessions/[id]
 * @state.area tutor
 * @state.capabilities view:detail, update:attendance
 * @state.notes Step 22.4 tutor Run Session page.
 */
// Server wrapper passes route params into the tutor Run Session client view.
import TutorRunSessionPageClient from "@/components/tutor/TutorRunSessionPageClient";

type TutorRunSessionPageProps = {
  params: Promise<{ tenant: string; id: string }>;
};

export default async function TutorRunSessionPage({
  params,
}: TutorRunSessionPageProps) {
  const { tenant, id } = await params;

  return <TutorRunSessionPageClient tenant={tenant} sessionId={id} />;
}
