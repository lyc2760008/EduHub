"use client";

// Tutor wrapper renders the shared staff homework detail component in tutor mode.
import StaffHomeworkDetailClient from "@/components/homework/StaffHomeworkDetailClient";

type TutorHomeworkDetailClientProps = {
  tenant: string;
  homeworkItemId: string;
};

export default function TutorHomeworkDetailClient({
  tenant,
  homeworkItemId,
}: TutorHomeworkDetailClientProps) {
  return (
    <StaffHomeworkDetailClient
      tenant={tenant}
      mode="tutor"
      homeworkItemId={homeworkItemId}
    />
  );
}
