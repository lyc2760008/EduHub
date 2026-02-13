"use client";

// Admin wrapper passes report options into the shared staff homework queue implementation.
import StaffHomeworkQueueClient from "@/components/homework/StaffHomeworkQueueClient";
import type {
  AdminReportCenterOption,
  AdminReportTutorOption,
} from "@/lib/reports/adminReportOptions";

type AdminHomeworkQueueClientProps = {
  tenant: string;
  tutors: AdminReportTutorOption[];
  centers: AdminReportCenterOption[];
};

export default function AdminHomeworkQueueClient({
  tenant,
  tutors,
  centers,
}: AdminHomeworkQueueClientProps) {
  return (
    <StaffHomeworkQueueClient
      tenant={tenant}
      mode="admin"
      tutors={tutors}
      centers={centers}
    />
  );
}
