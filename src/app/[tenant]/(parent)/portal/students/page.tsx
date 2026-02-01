"use client";

// Parent portal students list with read-only cards and empty states.
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";

import Card from "@/components/parent/Card";
import PageHeader from "@/components/parent/PageHeader";
import PortalEmptyState from "@/components/parent/portal/PortalEmptyState";
import PortalSkeletonBlock from "@/components/parent/portal/PortalSkeletonBlock";
import StudentCard from "@/components/parent/portal/StudentCard";
import { fetchJson } from "@/lib/api/fetchJson";

type PortalStudent = {
  id: string;
  firstName: string;
  lastName: string;
  level: { id: string; name: string } | null;
  isActive: boolean;
};

type PortalStudentsResponse = {
  items: PortalStudent[];
  total: number;
};

function buildPortalApiUrl(tenant: string, path: string, params?: URLSearchParams) {
  const base = tenant ? `/t/${tenant}/api/portal${path}` : `/api/portal${path}`;
  if (!params) return base;
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

export default function PortalStudentsPage() {
  const t = useTranslations();
  const params = useParams<{ tenant?: string }>();
  const tenant = typeof params.tenant === "string" ? params.tenant : "";

  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [students, setStudents] = useState<PortalStudent[]>([]);

  const loadStudents = useCallback(async () => {
    if (!tenant) return;
    setIsLoading(true);
    setHasError(false);

    const query = new URLSearchParams({ take: "100", skip: "0" });
    const result = await fetchJson<PortalStudentsResponse>(
      buildPortalApiUrl(tenant, "/students", query),
    );

    if (!result.ok) {
      setHasError(true);
      setIsLoading(false);
      return;
    }

    setStudents(result.data.items);
    setIsLoading(false);
  }, [tenant]);

  useEffect(() => {
    // Defer load to avoid setState during render.
    const handle = setTimeout(() => {
      void loadStudents();
    }, 0);
    return () => clearTimeout(handle);
  }, [loadStudents]);

  if (isLoading) {
    return (
      <div className="space-y-6" data-testid="portal-students-loading">
        <PortalSkeletonBlock className="h-8 w-40" />
        <PortalSkeletonBlock className="h-4 w-72" />
        <div className="grid gap-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <PortalSkeletonBlock key={index} className="h-20" />
          ))}
        </div>
      </div>
    );
  }

  if (hasError) {
    return (
      <Card>
        <div className="space-y-3 text-center" data-testid="portal-students-error">
          <h2 className="text-base font-semibold text-[var(--text)]">
            {t("portal.error.students.title")}
          </h2>
          <p className="text-sm text-[var(--muted)]">
            {t("portal.error.students.body")}
          </p>
          <button
            type="button"
            onClick={() => void loadStudents()}
            className="inline-flex h-11 items-center rounded-xl bg-[var(--primary)] px-4 text-sm font-semibold text-[var(--primary-foreground)]"
          >
            {t("portal.common.tryAgain")}
          </button>
        </div>
      </Card>
    );
  }

  if (students.length === 0) {
    return (
      <PortalEmptyState
        variant="noStudents"
        hintKey="portal.empty.noStudents.hint"
        actionLabelKey="portal.empty.noStudents.cta"
        actionHref={tenant ? `/${tenant}/portal/students` : "/portal/students"}
      />
    );
  }

  return (
    <div className="space-y-6" data-testid="portal-students-page">
      <PageHeader
        titleKey="portal.students.title"
        subtitleKey="portal.students.helper"
      />
      <div className="grid gap-3" data-testid="portal-students-list">
        {students.map((student) => (
          <StudentCard
            key={student.id}
            student={student}
            href={tenant ? `/${tenant}/portal/students/${student.id}` : `/portal/students/${student.id}`}
          />
        ))}
      </div>
    </div>
  );
}


