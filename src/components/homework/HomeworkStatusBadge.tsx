"use client";

// Shared status badge keeps homework status styling consistent across parent, tutor, and admin pages.
import { useTranslations } from "next-intl";

import {
  type HomeworkDisplayStatus,
  getHomeworkStatusBadgeClassName,
  getHomeworkStatusKey,
} from "@/components/homework/homeworkClient";

type HomeworkStatusBadgeProps = {
  status: HomeworkDisplayStatus;
};

export default function HomeworkStatusBadge({ status }: HomeworkStatusBadgeProps) {
  const t = useTranslations();

  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${getHomeworkStatusBadgeClassName(status)}`}
    >
      {t(getHomeworkStatusKey(status))}
    </span>
  );
}
