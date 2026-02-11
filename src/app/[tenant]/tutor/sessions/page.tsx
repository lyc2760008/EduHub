/**
 * @state.route /[tenant]/tutor/sessions
 * @state.area tutor
 * @state.capabilities view:list
 * @state.notes Step 22.4 tutor My Sessions page.
 */
// Server wrapper passes tenant params into the tutor My Sessions client view.
import TutorSessionsPageClient from "@/components/tutor/TutorSessionsPageClient";

type TutorSessionsPageProps = {
  params: Promise<{ tenant: string }>;
};

export default async function TutorSessionsPage({
  params,
}: TutorSessionsPageProps) {
  const { tenant } = await params;

  return <TutorSessionsPageClient tenant={tenant} />;
}
