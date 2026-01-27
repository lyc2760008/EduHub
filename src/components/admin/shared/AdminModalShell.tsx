"use client";

// Shared admin modal shell to keep header/body/footer spacing consistent.
import type { ReactNode } from "react";

export type AdminModalShellProps = {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  testId?: string;
};

export default function AdminModalShell({
  title,
  description,
  children,
  footer,
  testId,
}: AdminModalShellProps) {
  return (
    <div className="flex flex-col" data-testid={testId}>
      {/* Title + description stay stacked to preserve admin hierarchy. */}
      <header className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        {description ? (
          <p className="text-sm text-slate-600">{description}</p>
        ) : null}
      </header>
      {/* Body wrapper keeps consistent spacing from the header across modals. */}
      <div className="mt-4 flex flex-col gap-4">{children}</div>
      {footer ? (
        <>
          {/* Footer layout expects cancel on the left and primary actions on the right. */}
          <footer className="mt-4 flex flex-wrap items-center justify-between gap-3">
            {footer}
          </footer>
        </>
      ) : null}
    </div>
  );
}
