"use client";

import type { TodaySectionVisibility } from "@/lib/todays-meals-visibility";
import { useMemo, useState } from "react";
import { useCalendarContext } from "@/app/(app)/calendar/context";
import MiniRecipes from "@/components/Panel/consumers/mini-recipes";
import TodaysMealsSkeleton, {
  WeekMealsSkeleton,
} from "@/components/skeleton/todays-meals-skeleton";
import { useCalendarView } from "@/context/calendar-view-context";
import { ScrollShadow } from "@heroui/react";
import { useLocale, useTranslations } from "next-intl";

import type { Slot } from "@norish/shared/contracts";
import { dateKey, getWeekDays } from "@norish/shared/lib/helpers";

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
  const { plannedItemsByDate, isLoading } = useCalendarContext();
  const [planningSlot, setPlanningSlot] = useState<Slot | undefined>(undefined);
  const [planningOpen, setPlanningOpen] = useState(false);
  const [calendarView] = useCalendarView();
  const isWeekView = calendarView === "week";

  const weekDays = useMemo(() => getWeekDays(todayDate), [todayDate]);

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
    setPlanningSlot(slot);
    setPlanningOpen(true);
  };

  if (!isLoading && !isWeekView && visibleSlots.length === 0) return null;
  if (!isLoading && isWeekView && visibility === "planned" && !hasWeekItems) return null;

  return (
    <section aria-labelledby="today-meals-heading" className="flex shrink-0 flex-col gap-4">
      <div className="min-w-0">
        <h2 className="text-foreground text-2xl leading-8 font-semibold" id="today-meals-heading">
          {isWeekView ? tCalendar("mobile.thisWeek") : tCalendar("mobile.today")}
        </h2>
        <p className="text-muted mt-1 text-sm">{dateLabel}</p>
      </div>

      {isWeekView ? (
        isLoading ? (
          <WeekMealsSkeleton />
        ) : (
          <WeekMealsTile plannedItemsByDate={plannedItemsByDate} weekDays={weekDays} />
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
        date={todayDate}
        open={planningOpen}
        slot={planningSlot}
        onOpenChange={setPlanningOpen}
      />
    </section>
  );
}
