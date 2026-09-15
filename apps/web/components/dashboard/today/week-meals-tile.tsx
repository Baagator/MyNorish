"use client";

import { useRouter } from "next/navigation";
import { MealIcon } from "@/lib/meal-icon";
import { PlusIcon } from "@heroicons/react/16/solid";
import { Button, Card } from "@heroui/react";
import { useLocale, useTranslations } from "next-intl";

import type { PlannedItemFromQuery } from "@norish/shared/contracts";
import { dateKey } from "@norish/shared/lib/helpers";

import { getPlannedItemTitle } from "./todays-meals-helpers";

type WeekMealsTileProps = {
  weekDays: Date[];
  plannedItemsByDate: Record<string, PlannedItemFromQuery[]>;
  /** Opens the recipe picker for the given day (lunch slot, no slot choice). */
  onAddItem: (date: Date) => void;
};

const SLOT_ORDER: Record<PlannedItemFromQuery["slot"], number> = {
  Breakfast: 0,
  Lunch: 1,
  Snack: 2,
  Dinner: 3,
};

function sortDayItems(items: PlannedItemFromQuery[]): PlannedItemFromQuery[] {
  return [...items].sort((a, b) => {
    const bySlot = SLOT_ORDER[a.slot] - SLOT_ORDER[b.slot];

    return bySlot !== 0 ? bySlot : a.sortOrder - b.sortOrder;
  });
}

/**
 * The week-view counterpart to the four day slot cards: a single tile
 * listing every planned item across the current week, one row per day.
 */
export default function WeekMealsTile({
  weekDays,
  plannedItemsByDate,
  onAddItem,
}: WeekMealsTileProps) {
  const router = useRouter();
  const locale = useLocale();
  const tCalendar = useTranslations("calendar.timeline");
  const tPanel = useTranslations("calendar.panel");

  const weekdayFormatter = new Intl.DateTimeFormat(locale, { weekday: "short" });
  const dayLabelFormatter = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const todayKey = dateKey(new Date());

  const handleItemClick = (item: PlannedItemFromQuery) => {
    if (item.itemType === "recipe" && item.recipeId) {
      router.push(`/recipes/${item.recipeId}`);

      return;
    }

    router.push("/calendar");
  };

  return (
    <Card className="w-full overflow-hidden rounded-2xl p-0">
      <Card.Content className="divide-border flex flex-col divide-y p-0">
        {weekDays.map((day) => {
          const key = dateKey(day);
          const items = sortDayItems(plannedItemsByDate[key] ?? []);
          const isToday = key === todayKey;

          return (
            <div key={key} className="flex items-start gap-3 px-4 py-3">
              <button
                aria-label={dayLabelFormatter.format(day)}
                className="hover:bg-surface-secondary flex w-12 shrink-0 flex-col items-center rounded-lg py-1 text-center transition-colors"
                type="button"
                onClick={() => router.push("/calendar")}
              >
                <span className="text-muted text-[10px] font-semibold tracking-wide uppercase">
                  {weekdayFormatter.format(day)}
                </span>
                <span
                  className={`text-sm font-semibold ${isToday ? "text-primary" : "text-foreground"}`}
                >
                  {day.getDate()}
                </span>
              </button>

              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 pt-1.5">
                {items.length === 0 ? (
                  <button
                    className="text-muted hover:text-foreground text-sm transition-colors"
                    type="button"
                    onClick={() => onAddItem(day)}
                  >
                    {tCalendar("noItems")}
                  </button>
                ) : (
                  items.map((item) => (
                    <button
                      key={item.id}
                      className="bg-surface-secondary hover:bg-surface-tertiary text-foreground inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors"
                      type="button"
                      onClick={() => handleItemClick(item)}
                    >
                      <MealIcon className="h-3 w-3 shrink-0" slot={item.slot} />
                      <span className="min-w-0 truncate">
                        {getPlannedItemTitle(item, tCalendar("untitled"))}
                      </span>
                    </button>
                  ))
                )}
              </div>

              <Button
                isIconOnly
                aria-label={tPanel("addRecipe")}
                className="text-muted hover:text-accent h-7 w-7 shrink-0 self-start rounded-full"
                size="sm"
                variant="tertiary"
                onPress={() => onAddItem(day)}
              >
                <PlusIcon className="h-4 w-4" />
              </Button>
            </div>
          );
        })}
      </Card.Content>
    </Card>
  );
}
