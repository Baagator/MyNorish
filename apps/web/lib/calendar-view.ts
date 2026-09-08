import { defineDevicePreference } from "@/lib/device-preferences";

/**
 * Whether the calendar timeline shows one row per day or groups days into
 * full Monday-Sunday weeks. A device preference like `recipe-page-color` —
 * purely presentational: planned items still carry a `date` and `slot`
 * either way, so flipping back and forth is instant and lossless.
 */
export const calendarViewPreference = defineDevicePreference({
  cookieName: "norish_calendar_view",
  values: ["day", "week"] as const,
  defaultValue: "day",
});

export type CalendarViewMode = (typeof calendarViewPreference.values)[number];
