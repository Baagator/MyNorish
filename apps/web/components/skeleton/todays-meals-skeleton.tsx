"use client";

import { TODAY_MEAL_SLOTS } from "@/components/dashboard/today/todays-meals-constants";
import { Card, Skeleton } from "@heroui/react";

function TodayMealSlotSkeleton() {
  return (
    <Card className="h-[184px] w-[144px] shrink-0 overflow-hidden rounded-2xl p-0 sm:w-[152px]">
      <div className="relative h-[132px] w-full">
        <Skeleton className="h-full w-full" />
        <Skeleton className="absolute top-2 left-2 h-6 w-20 rounded-full" />
      </div>
      <Card.Content className="flex h-[52px] flex-col justify-center gap-1 px-2.5 py-1.5">
        <Skeleton className="h-3.5 w-4/5 rounded-md" />
        <Skeleton className="h-2.5 w-2/3 rounded-md" />
      </Card.Content>
    </Card>
  );
}

export default function TodaysMealsSkeleton() {
  return (
    <div className="flex gap-3">
      {TODAY_MEAL_SLOTS.map((slot) => (
        <TodayMealSlotSkeleton key={slot} />
      ))}
    </div>
  );
}

function WeekMealsRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex w-12 shrink-0 flex-col items-center gap-1">
        <Skeleton className="h-2.5 w-6 rounded-md" />
        <Skeleton className="h-4 w-4 rounded-md" />
      </div>
      <Skeleton className="h-6 w-2/3 rounded-full" />
    </div>
  );
}

export function WeekMealsSkeleton() {
  return (
    <Card className="w-full overflow-hidden rounded-2xl p-0">
      <Card.Content className="divide-border flex flex-col divide-y p-0">
        {Array.from({ length: 7 }).map((_, index) => (
          <WeekMealsRowSkeleton key={index} />
        ))}
      </Card.Content>
    </Card>
  );
}
