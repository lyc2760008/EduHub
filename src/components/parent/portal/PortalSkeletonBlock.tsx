"use client";

// Simple skeleton block for parent portal loading states.
import type { HTMLAttributes } from "react";

type PortalSkeletonBlockProps = HTMLAttributes<HTMLDivElement>;

export default function PortalSkeletonBlock({
  className = "",
  ...props
}: PortalSkeletonBlockProps) {
  return (
    <div
      className={`animate-pulse rounded-xl bg-[var(--surface-2)] ${className}`}
      {...props}
    />
  );
}

