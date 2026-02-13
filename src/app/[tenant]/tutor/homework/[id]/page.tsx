/**
 * @state.route /[tenant]/tutor/homework/[id]
 * @state.area tutor
 * @state.capabilities view:detail, create:homework_file, update:bulk_mark_reviewed
 * @state.notes Step 23.2 tutor homework detail page.
 */
// Tutor homework detail page forwards route params into the shared tutor detail client.
import TutorHomeworkDetailClient from "@/components/tutor/homework/TutorHomeworkDetailClient";

type TutorHomeworkDetailPageProps = {
  params: Promise<{ tenant: string; id: string }>;
};

export default async function TutorHomeworkDetailPage({
  params,
}: TutorHomeworkDetailPageProps) {
  const { tenant, id } = await params;
  return <TutorHomeworkDetailClient tenant={tenant} homeworkItemId={id} />;
}
