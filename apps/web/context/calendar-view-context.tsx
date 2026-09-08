"use client";

import { createDevicePreferenceContext } from "@/context/device-preference-context";
import { calendarViewPreference } from "@/lib/calendar-view";

/**
 * Mounted in the app shell, seeded from the layout's server-side cookie
 * read so the calendar renders in the right mode on the very first frame.
 */
const { Provider: CalendarViewProvider, usePreference: useCalendarView } =
  createDevicePreferenceContext(calendarViewPreference, "CalendarView");

export { CalendarViewProvider, useCalendarView };
