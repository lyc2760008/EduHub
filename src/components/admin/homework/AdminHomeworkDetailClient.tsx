"use client";

// Admin wrapper renders the shared staff homework detail component in admin mode.
import StaffHomeworkDetailClient from "@/components/homework/StaffHomeworkDetailClient";

type AdminHomeworkDetailClientProps = {
  tenant: string;
  homeworkItemId: string;
};

export default function AdminHomeworkDetailClient({
  tenant,
  homeworkItemId,
}: AdminHomeworkDetailClientProps) {
  return (
    <StaffHomeworkDetailClient
      tenant={tenant}
      mode="admin"
      homeworkItemId={homeworkItemId}
    />
  );
}
