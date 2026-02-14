// Client-side event bus keeps unread badge counts in sync across nav and inbox interactions.
"use client";

const UNREAD_COUNT_EVENT = "notifications:unread-count";

type UnreadCountEventDetail = {
  count?: number;
  refresh?: boolean;
};

function toCustomEvent(detail: UnreadCountEventDetail) {
  return new CustomEvent<UnreadCountEventDetail>(UNREAD_COUNT_EVENT, {
    detail,
  });
}

// Broadcast a known unread count so nav badges can update immediately after inbox actions.
export function publishUnreadCount(count: number) {
  // Include a refresh hint so type-specific badges can reload alongside the optimistic total.
  window.dispatchEvent(toCustomEvent({ count, refresh: true }));
}

// Broadcast a refresh hint when the exact count is unknown but should be reloaded from the API.
export function requestUnreadCountRefresh() {
  window.dispatchEvent(toCustomEvent({ refresh: true }));
}

export function subscribeUnreadCount(
  listener: (detail: UnreadCountEventDetail) => void,
) {
  const wrapped = (event: Event) => {
    const detail =
      event instanceof CustomEvent ? event.detail : {};
    listener(detail ?? {});
  };
  window.addEventListener(UNREAD_COUNT_EVENT, wrapped);
  return () => window.removeEventListener(UNREAD_COUNT_EVENT, wrapped);
}
