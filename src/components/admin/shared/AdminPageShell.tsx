// Server-side admin page shell that standardizes layout around a translated title.
// Use this inside AdminAccessGate to wrap admin page content.
import type { ReactNode } from "react";

export type AdminPageShellProps = {
  title: string;
  children: ReactNode;
  maxWidth?: string;
  testId?: string;
};

const DEFAULT_MAX_WIDTH = "max-w-5xl";

export default function AdminPageShell({
  title,
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
      <h1 className="text-2xl font-semibold">{title}</h1>
      {children}
    </div>
  );
}
