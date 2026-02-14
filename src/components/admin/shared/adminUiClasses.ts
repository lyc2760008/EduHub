// Shared admin UI class names to keep focus-visible and hover behavior consistent.
// Disabled form controls stay readable on macOS by using surface/border changes instead of opacity fades.
export const inputBase =
  "rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-100 disabled:bg-muted/40 disabled:text-slate-800 disabled:[-webkit-text-fill-color:#1f2937]";

// Primary button styles keep CTAs consistent across Sessions UI.
export const primaryButton =
  "inline-flex items-center justify-center rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60";

// Secondary button styles match existing admin buttons with clearer focus/hover states.
export const secondaryButton =
  "inline-flex items-center justify-center rounded border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60";
