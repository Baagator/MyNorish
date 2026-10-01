"use client";

import type { TodaySectionVisibility } from "@/lib/todays-meals-visibility";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useCalendarContext } from "@/app/(app)/calendar/context";
import MiniRecipes from "@/components/Panel/consumers/mini-recipes";
import TodaysMealsSkeleton, {
  WeekMealsSkeleton,
} from "@/components/skeleton/todays-meals-skeleton";
import { useCalendarView } from "@/context/calendar-view-context";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/16/solid";
import { Button, ScrollShadow } from "@heroui/react";
import { useLocale, useTranslations } from "next-intl";

import type { Slot } from "@norish/shared/contracts";
import { addWeeks, dateKey, getWeekDays } from "@norish/shared/lib/helpers";

import TodayMealSlotCard from "./today-meal-slot-card";
import { slotTranslationKeys, TODAY_MEAL_SLOTS } from "./todays-meals-constants";
import { groupTodayItemsBySlot } from "./todays-meals-helpers";
import WeekMealsTile from "./week-meals-tile";

type TodaysMealsContentProps = {
  visibility: TodaySectionVisibility;
};

export default function TodaysMealsContent({ visibility }: TodaysMealsContentProps) {
  const locale = useLocale();
  const tCalendar = useTranslations("calendar");
  const tSlots = useTranslations("common.slots");
  const todayKey = useMemo(() => dateKey(new Date()), []);
  const todayDate = useMemo(() => new Date(`${todayKey}T00:00:00`), [todayKey]);
  const { plannedItemsByDate, isLoading, isRangeLoading, goToWeek } = useCalendarContext();
  const [planningSlot, setPlanningSlot] = useState<Slot | undefined>(undefined);
  const [planningDate, setPlanningDate] = useState<Date>(todayDate);
  const [planningOpen, setPlanningOpen] = useState(false);
  const [calendarView] = useCalendarView();
  const isWeekView = calendarView === "week";
  // Week shown in the week view, relative to the current week (0 = this week).
  const [weekOffset, setWeekOffset] = useState(0);
  const isLoadingWeek = isLoading || Boolean(isRangeLoading);

  const weekDays = useMemo(
    () => getWeekDays(addWeeks(todayDate, weekOffset)),
    [todayDate, weekOffset]
  );

  // Changing the week also moves the calendar context's loaded range, so the
  // items, mutations and realtime updates all follow the displayed week.
  const changeWeek = useCallback(
    (offset: number) => {
      setWeekOffset(offset);
      goToWeek(addWeeks(todayDate, offset));
    },
    [goToWeek, todayDate]
  );

  // The day view reads today's items, so return to the current week when leaving the week view.
  useEffect(() => {
    if (!isWeekView && weekOffset !== 0) changeWeek(0);
  }, [isWeekView, weekOffset, changeWeek]);

  const weekRangeFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }),
    [locale]
  );

  const dateLabel = useMemo(() => {
    if (isWeekView) {
      const start = weekDays[0];
      const end = weekDays[weekDays.length - 1];

      if (!start || !end) return "";

      return weekRangeFormatter.formatRange
        ? weekRangeFormatter.formatRange(start, end)
        : `${weekRangeFormatter.format(start)} - ${weekRangeFormatter.format(end)}`;
    }

    return new Intl.DateTimeFormat(locale, {
      weekday: "long",
      month: "short",
      day: "numeric",
    }).format(todayDate);
  }, [isWeekView, locale, todayDate, weekDays, weekRangeFormatter]);

  const itemsBySlot = useMemo(
    () => groupTodayItemsBySlot(plannedItemsByDate[todayKey] ?? []),
    [plannedItemsByDate, todayKey]
  );

  const visibleSlots =
    visibility === "planned"
      ? TODAY_MEAL_SLOTS.filter((slot) => itemsBySlot[slot].length > 0)
      : TODAY_MEAL_SLOTS;

  const hasWeekItems = useMemo(
    () => weekDays.some((day) => (plannedItemsByDate[dateKey(day)] ?? []).length > 0),
    [plannedItemsByDate, weekDays]
  );

  const openPlanner = (slot: Slot) => {
    setPlanningDate(todayDate);
    setPlanningSlot(slot);
    setPlanningOpen(true);
  };

  // Week view: tapping/clicking a day cell opens the recipe picker directly,
  // with no slot choice for the user — lunch is used by default.
  const openWeekPlanner = (date: Date) => {
    setPlanningDate(date);
    setPlanningSlot("Lunch");
    setPlanningOpen(true);
  };

  if (!isLoading && !isWeekView && visibleSlots.length === 0) return null;
  // When browsing other weeks, keep the section (and its arrows) visible even if the week is empty.
  if (!isLoadingWeek && isWeekView && visibility === "planned" && !hasWeekItems && weekOffset === 0)
    return null;

  return (
    <section aria-labelledby="today-meals-heading" className="flex shrink-0 flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-foreground text-2xl leading-8 font-semibold" id="today-meals-heading">
            {isWeekView
              ? weekOffset === 0
                ? tCalendar("mobile.thisWeek")
                : tCalendar("mobile.week")
              : tCalendar("mobile.today")}
          </h2>
          <p className="text-muted mt-1 text-sm">{dateLabel}</p>
        </div>
      </div>

      {isWeekView ? (
        isLoadingWeek ? (
          <WeekMealsSkeleton />
        ) : (
          <WeekMealsTile
            plannedItemsByDate={plannedItemsByDate}
            weekDays={weekDays}
            onAddItem={openWeekPlanner}
          />
        )
      ) : (
        <ScrollShadow
          hideScrollBar
          className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0"
          orientation="horizontal"
        >
          {isLoading ? (
            <TodaysMealsSkeleton />
          ) : (
            <div className="flex gap-3">
              {visibleSlots.map((slot) => (
                <TodayMealSlotCard
                  key={slot}
                  items={itemsBySlot[slot]}
                  slot={slot}
                  slotLabel={tSlots(slotTranslationKeys[slot])}
                  onPlan={openPlanner}
                />
              ))}
            </div>
          )}
        </ScrollShadow>
      )}

      <MiniRecipes
        date={planningDate}
        open={planningOpen}
        slot={planningSlot}
        onOpenChange={setPlanningOpen}
      />
    </section>
  );
}
