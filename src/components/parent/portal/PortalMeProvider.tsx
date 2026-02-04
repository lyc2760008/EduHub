"use client";

// Portal /me provider keeps identity data consistent across the portal UI.
import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useParams, useRouter } from "next/navigation";

import { fetchJson } from "@/lib/api/fetchJson";

export type PortalMe = {
  parent: {
    id: string;
    email: string;
    displayName?: string | null;
  };
  tenant: {
    id: string;
    slug?: string | null;
    displayName?: string | null;
    timeZone?: string | null;
  };
  students: Array<{
    id: string;
    displayName: string;
    isActive: boolean;
  }>;
  features?: Record<string, boolean>;
};

type PortalMeError = {
  status: number;
  code?: string;
};

type PortalMeState = {
  data: PortalMe | null;
  isLoading: boolean;
  error: PortalMeError | null;
  reload: () => void;
  tenantSlug: string;
};

type PortalMeProviderProps = {
  children: ReactNode;
  tenantSlug?: string;
  enabled?: boolean;
};

const PortalMeContext = createContext<PortalMeState | null>(null);

function buildPortalApiUrl(tenant: string, path: string) {
  const base = tenant ? `/t/${tenant}/api/portal${path}` : `/api/portal${path}`;
  return base;
}

function resolvePortalErrorCode(details: unknown): string | undefined {
  if (!details || typeof details !== "object") return undefined;
  const payload = details as { error?: { code?: unknown } };
  const code = payload.error?.code;
  return typeof code === "string" ? code : undefined;
}

export function PortalMeProvider({
  children,
  tenantSlug,
  enabled = true,
}: PortalMeProviderProps) {
  const params = useParams<{ tenant?: string }>();
  const router = useRouter();
  const resolvedTenant =
    tenantSlug ?? (typeof params.tenant === "string" ? params.tenant : "");
  const [data, setData] = useState<PortalMe | null>(null);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<PortalMeError | null>(null);

  const load = useCallback(async () => {
    if (!enabled || !resolvedTenant) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const result = await fetchJson<PortalMe>(
      buildPortalApiUrl(resolvedTenant, "/me"),
    );

    if (!result.ok) {
      const code = resolvePortalErrorCode(result.details);
      setError({ status: result.status, code });
      setIsLoading(false);

      if (result.status === 401 || code === "UNAUTHORIZED") {
        // Redirect to login when the parent session expires.
        const loginPath = resolvedTenant
          ? `/${resolvedTenant}/parent/login`
          : "/parent/login";
        router.replace(loginPath);
      }
      return;
    }

    setData(result.data);
    setIsLoading(false);
  }, [enabled, resolvedTenant, router]);

  useEffect(() => {
    // Defer the initial fetch to avoid synchronous setState during effect execution.
    const handle = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(handle);
  }, [load]);

  const value = useMemo(
    () => ({
      data,
      isLoading,
      error,
      reload: load,
      tenantSlug: resolvedTenant,
    }),
    [data, error, isLoading, load, resolvedTenant],
  );

  return (
    <PortalMeContext.Provider value={value}>{children}</PortalMeContext.Provider>
  );
}

export function usePortalMe() {
  const context = useContext(PortalMeContext);
  if (!context) {
    // Fallback keeps callers safe when rendered outside the portal shell.
    return {
      data: null,
      isLoading: false,
      error: null,
      reload: () => undefined,
      tenantSlug: "",
    } satisfies PortalMeState;
  }
  return context;
}
