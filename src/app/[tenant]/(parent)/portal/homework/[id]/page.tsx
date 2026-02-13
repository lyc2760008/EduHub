/**
 * @state.route /[tenant]/portal/homework/[id]
 * @state.area parent
 * @state.capabilities view:detail, create:homework_file
 * @state.notes Step 23.2 parent homework detail page.
 */
// Parent homework detail page forwards route params to the portal homework detail client.
import ParentHomeworkDetailClient from "@/components/parent/homework/ParentHomeworkDetailClient";

type ParentHomeworkDetailPageProps = {
  params: Promise<{ tenant: string; id: string }>;
};

export default async function ParentHomeworkDetailPage({
  params,
}: ParentHomeworkDetailPageProps) {
  const { tenant, id } = await params;
  return <ParentHomeworkDetailClient tenant={tenant} homeworkItemId={id} />;
}
