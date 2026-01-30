"use client";

import type { ReactNode } from "react";

type CardProps = {
  children: ReactNode;
  variant?: "default" | "subtle";
  padding?: "normal" | "roomy";
};

export default function Card({
  children,
  variant = "default",
  padding = "roomy",
}: CardProps) {
  const baseClassName =
    "rounded-2xl text-[var(--text)] transition-colors";
  const variantClassName =
    variant === "subtle"
      ? "bg-[var(--surface-2)]"
      : "bg-[var(--surface)] border border-[var(--border)] shadow-sm";
  const paddingClassName =
    padding === "roomy" ? "p-5 md:p-6" : "p-4 md:p-5";

  return (
    <div className={`${baseClassName} ${variantClassName} ${paddingClassName}`}>
      {/* Card keeps parent surfaces consistent without touching admin styling. */}
      {children}
    </div>
  );
}
