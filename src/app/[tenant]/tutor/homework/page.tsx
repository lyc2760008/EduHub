/**
 * @state.route /[tenant]/tutor/homework
 * @state.area tutor
 * @state.capabilities view:list, update:bulk_mark_reviewed, create:homework_file
 * @state.notes Step 23.2 tutor homework queue page.
 */
// Tutor homework queue page forwards tenant params to the shared tutor queue client.
import TutorHomeworkQueueClient from "@/components/tutor/homework/TutorHomeworkQueueClient";

type TutorHomeworkQueuePageProps = {
  params: Promise<{ tenant: string }>;
};

export default async function TutorHomeworkQueuePage({
  params,
}: TutorHomeworkQueuePageProps) {
  const { tenant } = await params;
  return <TutorHomeworkQueueClient tenant={tenant} />;
}
