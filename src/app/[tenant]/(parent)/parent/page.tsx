import { getTranslations } from "next-intl/server";

import Card from "@/components/parent/Card";
import EmptyState from "@/components/parent/EmptyState";
import PageHeader from "@/components/parent/PageHeader";
import SectionHeader from "@/components/parent/SectionHeader";
import SessionListItem from "@/components/parent/SessionListItem";
import StatTile from "@/components/parent/StatTile";

export default async function ParentDashboardPage() {
  const t = await getTranslations();
  const upcomingTitle = t("parent.sections.upcoming");

  // Demo data stays translation-safe while parent APIs are still in progress.
  const sessions = [
    { title: upcomingTitle, datetimeText: "2026-01-29 18:00", status: "upcoming" },
    { title: upcomingTitle, datetimeText: "2026-02-02 17:30", status: "upcoming" },
  ] as const;

  return (
    <div className="space-y-6">
      <PageHeader titleKey="parent.nav.dashboard" />

      <div className="space-y-6 md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] md:gap-6 md:space-y-0">
        <div className="space-y-6">
          <section>
            <SectionHeader
              titleKey="parent.sections.upcoming"
              actionLabelKey="generic.viewAll"
              href="#"
            />
            <Card>
              <div className="space-y-2">
                {sessions.map((session) => (
                  <SessionListItem
                    key={session.datetimeText}
                    title={session.title}
                    datetimeText={session.datetimeText}
                    status={session.status}
                  />
                ))}
              </div>
            </Card>
          </section>

          <section>
            <SectionHeader
              titleKey="parent.sections.notes"
              actionLabelKey="generic.viewAll"
              href="#"
            />
            <Card>
              <EmptyState
                titleKey="parent.empty.notes.title"
                bodyKey="parent.empty.notes.body"
              />
            </Card>
          </section>
        </div>

        <div className="space-y-6">
          <section>
            <SectionHeader titleKey="parent.sections.attendance" />
            <Card>
              <div className="grid grid-cols-2 gap-3">
                <StatTile labelKey="parent.sections.attendance" value={4} />
                <StatTile labelKey="parent.sections.upcoming" value={t("generic.dash")} />
              </div>
            </Card>
          </section>
        </div>
      </div>
    </div>
  );
}
