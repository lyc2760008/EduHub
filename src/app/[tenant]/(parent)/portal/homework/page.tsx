/**
 * @state.route /[tenant]/portal/homework
 * @state.area parent
 * @state.capabilities view:list
 * @state.notes Step 23.2 parent homework inbox page.
 */
// Parent homework inbox page forwards tenant params into the portal homework inbox client.
import ParentHomeworkInboxClient from "@/components/parent/homework/ParentHomeworkInboxClient";

type ParentHomeworkInboxPageProps = {
  params: Promise<{ tenant: string }>;
};

export default async function ParentHomeworkInboxPage({
  params,
}: ParentHomeworkInboxPageProps) {
  const { tenant } = await params;
  return <ParentHomeworkInboxClient tenant={tenant} />;
}
