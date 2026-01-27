"use client";

// Admin form field wrapper to standardize label/control spacing, hints, and errors.
import type { ReactNode } from "react";

export type AdminFormFieldProps = {
  label: ReactNode;
  htmlFor?: string;
  required?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
  testId?: string;
};

export default function AdminFormField({
  label,
  htmlFor,
  required = false,
  hint,
  error,
  children,
  className,
  testId,
}: AdminFormFieldProps) {
  const wrapperClassName = className
    ? `flex flex-col gap-1.5 ${className}`
    : "flex flex-col gap-1.5";
  const hintId = htmlFor ? `${htmlFor}-hint` : undefined;
  const errorId = htmlFor ? `${htmlFor}-error` : undefined;
  const labelContent = (
    <span className="flex items-center gap-1 text-sm font-medium text-slate-700">
      <span>{label}</span>
      {required ? (
        <span aria-hidden="true" className="text-red-600">
          *
        </span>
      ) : null}
    </span>
  );

  return (
    <div className={wrapperClassName} data-testid={testId}>
      {/* htmlFor keeps label association when consumers provide a matching control id. */}
      {htmlFor ? (
        <label htmlFor={htmlFor}>{labelContent}</label>
      ) : (
        <div>{labelContent}</div>
      )}
      <div className="flex flex-col gap-1.5">{children}</div>
      {hint ? (
        <p className="text-xs text-slate-500" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="text-xs text-red-600" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
