"use client";

// Tutor wrapper renders the shared staff homework queue component with tutor-scoped API paths.
import StaffHomeworkQueueClient from "@/components/homework/StaffHomeworkQueueClient";

type TutorHomeworkQueueClientProps = {
  tenant: string;
};

export default function TutorHomeworkQueueClient({ tenant }: TutorHomeworkQueueClientProps) {
  return <StaffHomeworkQueueClient tenant={tenant} mode="tutor" />;
}
