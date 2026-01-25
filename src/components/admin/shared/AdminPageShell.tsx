// Server-side admin page shell that standardizes layout, spacing, and hierarchy.
// Keep this utilitarian for the admin console; no layout overhauls or heavy styling.
import type { ReactNode } from "react";

export type AdminPageShellProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  maxWidth?: string;
  testId?: string;
};

const DEFAULT_MAX_WIDTH = "max-w-5xl";

export default function AdminPageShell({
  title,
  subtitle,
  actions,
  children,
  maxWidth = DEFAULT_MAX_WIDTH,
  testId,
}: AdminPageShellProps) {
  const gapClass = maxWidth === "max-w-3xl" ? "gap-4" : "gap-6";

  return (
    <div
      className={`mx-auto flex min-h-screen ${maxWidth} flex-col ${gapClass} px-6 py-10`}
      data-testid={testId}
    >
      {/* Header layout keeps title hierarchy and action alignment consistent. */}
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
            {subtitle ? (
              <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          ) : null}
        </div>
      </header>
      {children}
    </div>
  );
}
