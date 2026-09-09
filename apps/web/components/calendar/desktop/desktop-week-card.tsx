"use client";

import type { PlannedItemDisplay } from "@/components/calendar/mobile/types";
import { memo, useMemo, useState } from "react";
import { SLOT_ORDER, SLOTS } from "@/components/calendar/mobile/types";
import { ChevronLeftIcon, PlusIcon, XMarkIcon } from "@heroicons/react/16/solid";
import { Button, Card, Separator, ToggleButton, ToggleButtonGroup } from "@heroui/react";
import { useTranslations } from "next-intl";

import type { Slot } from "@norish/shared/contracts";
import { dateKey } from "@norish/shared/lib/helpers";

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

type DayKey = (typeof DAY_KEYS)[number];

type WeekRow = {
  item: PlannedItemDisplay;
  dayKey: DayKey;
};

type AddStep = "closed" | "day" | "slot";

const CARD_HEIGHT = 400;

type DesktopWeekCardProps = {
  /** The 7 days of the week, Monday first. */
  days: Date[];
  /** Planned items keyed by `YYYY-MM-DD`. */
  itemsByDate: Record<string, PlannedItemDisplay[]>;
  isCurrentWeek: boolean;
  weekLabel: string;
  onAddItem: (dateKey: string, slot: Slot) => void;
  onNoteClick?: (item: PlannedItemDisplay) => void;
  onRecipeClick?: (item: PlannedItemDisplay) => void;
};

export const DesktopWeekCard = memo(function DesktopWeekCard({
  days,
  itemsByDate,
  isCurrentWeek,
  weekLabel,
  onAddItem,
  onNoteClick,
  onRecipeClick,
}: DesktopWeekCardProps) {
  const t = useTranslations("calendar.timeline");
  const tMobile = useTranslations("calendar.mobile");
  const tWeekdays = useTranslations("calendar.weekdays");
  const tSlots = useTranslations("common.slots");
  const tActions = useTranslations("common.actions");

  const [addStep, setAddStep] = useState<AddStep>("closed");
  const [pendingDateKey, setPendingDateKey] = useState<string | null>(null);

  const slotLabels: Record<Slot, string> = useMemo(
    () => ({
      Breakfast: tSlots("breakfast"),
      Lunch: tSlots("lunch"),
      Dinner: tSlots("dinner"),
      Snack: tSlots("snack"),
    }),
    [tSlots]
  );

  // Flatten all 7 days into a single, day-ordered, slot-ordered list.
  const rows = useMemo(() => {
    const result: WeekRow[] = [];

    days.forEach((date, index) => {
      const key = dateKey(date);
      const dayKey = DAY_KEYS[index] ?? "mon";
      const items = (itemsByDate[key] ?? [])
        .slice()
        .sort(
          (a, b) => (SLOT_ORDER[a.slot] ?? 0) - (SLOT_ORDER[b.slot] ?? 0) || a.sortOrder - b.sortOrder
        );

      for (const item of items) {
        result.push({ item, dayKey });
      }
    });

    return result;
  }, [days, itemsByDate]);

  const hasItems = rows.length > 0;

  const resetAdd = () => {
    setAddStep("closed");
    setPendingDateKey(null);
  };

  const handleDaySelect = (index: number) => {
    const date = days[index];

    if (!date) return;

    setPendingDateKey(dateKey(date));
    setAddStep("slot");
  };

  const handleSlotSelect = (slot: Slot) => {
    if (pendingDateKey) {
      onAddItem(pendingDateKey, slot);
    }
    resetAdd();
  };

  const handleItemClick = (item: PlannedItemDisplay) => {
    if (item.itemType === "note") {
      onNoteClick?.(item);
    } else {
      onRecipeClick?.(item);
    }
  };

  return (
    <Card
      className={`shadow-sm transition-all duration-200 ${isCurrentWeek ? "ring-accent/50 shadow-md ring-2" : ""}`}
      style={{ height: CARD_HEIGHT }}
    >
      <Card.Content className="flex flex-col gap-2 overflow-hidden px-4 py-3">
        {/* Week header - fixed */}
        <div className="flex shrink-0 items-start justify-between gap-3">
          <div className="flex flex-col">
            {isCurrentWeek ? (
              <>
                <span className="text-accent text-lg font-bold">{tMobile("thisWeek")}</span>
                <span className="text-muted text-sm">{weekLabel}</span>
              </>
            ) : (
              <span className="text-foreground text-base font-semibold">{weekLabel}</span>
            )}
          </div>

          {addStep === "closed" && (
            <Button
              isIconOnly
              aria-label={t("addItem")}
              className="bg-surface-secondary text-muted hover:text-accent h-8 min-w-8 rounded-full shadow-sm transition-transform active:scale-95"
              size="sm"
              variant="tertiary"
              onPress={() => setAddStep("day")}
            >
              <PlusIcon className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Step 1: pick a day */}
        {addStep === "day" && (
          <div className="bg-surface-secondary shrink-0 rounded-xl p-2">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-muted text-xs font-semibold tracking-wide uppercase">
                {t("chooseDay")}
              </span>
              <Button
                isIconOnly
                aria-label={tActions("cancel")}
                size="sm"
                variant="tertiary"
                onPress={resetAdd}
              >
                <XMarkIcon className="h-3.5 w-3.5" />
              </Button>
            </div>
            <ToggleButtonGroup
              fullWidth
              selectionMode="single"
              size="sm"
              onSelectionChange={(keys) => {
                const [key] = Array.from(keys);
                const index = typeof key === "string" ? Number(key) : Number.NaN;

                if (Number.isInteger(index)) {
                  handleDaySelect(index);
                }
              }}
            >
              {DAY_KEYS.map((dayKey, index) => (
                <ToggleButton key={dayKey} className="min-w-0 flex-1 px-1 text-xs font-medium" id={String(index)}>
                  {index > 0 && <ToggleButtonGroup.Separator />}
                  {tWeekdays(dayKey)}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </div>
        )}

        {/* Step 2: pick a meal slot */}
        {addStep === "slot" && (
          <div className="bg-surface-secondary shrink-0 rounded-xl p-2">
            <div className="mb-1.5 flex items-center justify-between">
              <Button
                isIconOnly
                aria-label={tActions("back")}
                size="sm"
                variant="tertiary"
                onPress={() => setAddStep("day")}
              >
                <ChevronLeftIcon className="h-3.5 w-3.5" />
              </Button>
              <span className="text-muted text-xs font-semibold tracking-wide uppercase">
                {tSlots("chooseSlot")}
              </span>
              <Button
                isIconOnly
                aria-label={tActions("cancel")}
                size="sm"
                variant="tertiary"
                onPress={resetAdd}
              >
                <XMarkIcon className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SLOTS.map((slot) => (
                <Button
                  key={slot}
                  className="min-w-0 flex-1 text-xs"
                  size="sm"
                  variant="secondary"
                  onPress={() => handleSlotSelect(slot)}
                >
                  {slotLabels[slot]}
                </Button>
              ))}
            </div>
          </div>
        )}

        <Separator className="shrink-0" />

        {/* Scrollable list of meals for the week */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {hasItems ? (
            <ul className="divide-border flex flex-col divide-y">
              {rows.map(({ item, dayKey }) => (
                <li key={item.id}>
                  <button
                    className="hover:bg-surface-secondary flex w-full items-center gap-2 rounded-md px-1 py-2 text-left transition-colors"
                    type="button"
                    onClick={() => handleItemClick(item)}
                  >
                    <span className="text-muted w-9 shrink-0 text-xs font-semibold uppercase">
                      {tWeekdays(dayKey)}
                    </span>
                    <span className="text-foreground truncate text-sm">
                      {item.itemType === "note" ? (item.title ?? t("untitled")) : (item.recipeName ?? t("untitled"))}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-muted py-1 text-xs italic">{t("noItems")}</span>
          )}
        </div>
      </Card.Content>
    </Card>
  );
});
