import type { TodaySectionVisibility } from "@/lib/todays-meals-visibility";
import TodaysMeals from "@/components/dashboard/today/todays-meals";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PlannedItemFromQuery } from "@norish/shared/contracts";
import { addWeeks, dateKey, getWeekStart } from "@norish/shared/lib/helpers";

const pushMock = vi.fn();
const useCalendarContextMock = vi.fn();
const setVisibilityMock = vi.fn();
const goToWeekMock = vi.fn();

let visibilityMock: TodaySectionVisibility = "always";
let calendarViewMock: "day" | "week" = "day";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

vi.mock("@/context/todays-meals-visibility-context", () => ({
  useTodaySectionVisibility: () => [visibilityMock, setVisibilityMock],
}));

vi.mock("@/context/calendar-view-context", () => ({
  useCalendarView: () => [calendarViewMock, vi.fn()],
}));

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: (namespace?: string) => (key: string) => {
    const messages: Record<string, string> = {
      "calendar.mobile.today": "Today",
      "calendar.mobile.thisWeek": "This week",
      "calendar.mobile.week": "Week",
      "calendar.mobile.previousWeek": "Previous week",
      "calendar.mobile.nextWeek": "Next week",
      "calendar.page.title": "Calendar",
      "calendar.timeline.untitled": "Untitled",
      "calendar.timeline.note": "Note",
      "calendar.timeline.serving": "serving",
      "calendar.timeline.servings": "servings",
      "calendar.timeline.noItems": "No items planned",
      "calendar.panel.addRecipe": "Add Recipe",
      "common.slots.breakfast": "Breakfast",
      "common.slots.lunch": "Lunch",
      "common.slots.dinner": "Dinner",
      "common.slots.snack": "Snack",
    };

    return messages[namespace ? `${namespace}.${key}` : key] ?? key;
  },
}));

vi.mock("@/app/(app)/calendar/context", () => ({
  CalendarContextProvider: ({ children }: any) => <>{children}</>,
  useCalendarContext: () => useCalendarContextMock(),
}));

vi.mock("@/components/Panel/consumers/mini-recipes", () => ({
  default: ({ open, slot }: { open: boolean; slot?: string }) =>
    open ? <div role="dialog">Mini recipes {slot}</div> : null,
}));

vi.mock("@heroui/react", () => ({
  Button: ({ children, onPress, ...props }: any) => (
    <button type="button" onClick={onPress} {...props}>
      {children}
    </button>
  ),
  Card: Object.assign(({ children, ...props }: any) => <article {...props}>{children}</article>, {
    Content: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    Description: ({ children, ...props }: any) => <p {...props}>{children}</p>,
    Title: ({ children, ...props }: any) => <h3 {...props}>{children}</h3>,
  }),
  Chip: Object.assign(({ children, ...props }: any) => <span {...props}>{children}</span>, {
    Label: ({ children, ...props }: any) => <span {...props}>{children}</span>,
  }),
  ScrollShadow: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  Skeleton: (props: any) => <div {...props} />,
}));

function createPlannedItem(
  date: string,
  overrides: Partial<PlannedItemFromQuery> = {}
): PlannedItemFromQuery {
  return {
    id: "planned-1",
    userId: "user-1",
    date,
    slot: "Dinner",
    sortOrder: 0,
    itemType: "recipe",
    recipeId: "recipe-1",
    title: null,
    recipeName: "Pasta Night",
    recipeImage: "/recipes/pasta.jpg",
    servings: 4,
    calories: 640,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("TodaysMeals", () => {
  beforeEach(() => {
    pushMock.mockReset();
    useCalendarContextMock.mockReset();
    goToWeekMock.mockReset();
    visibilityMock = "always";
    calendarViewMock = "day";
  });

  it("renders all meal slots and today's planned recipe", () => {
    const todayKey = dateKey(new Date());

    useCalendarContextMock.mockReturnValue({
      plannedItemsByDate: {
        [todayKey]: [createPlannedItem(todayKey)],
      },
      isLoading: false,
    });

    render(<TodaysMeals />);

    expect(screen.getByRole("heading", { name: "Today" })).toBeInTheDocument();
    expect(screen.getAllByText("Breakfast")).not.toHaveLength(0);
    expect(screen.getAllByText("Lunch")).not.toHaveLength(0);
    expect(screen.getAllByText("Dinner")).not.toHaveLength(0);
    expect(screen.getAllByText("Snack")).not.toHaveLength(0);
    expect(screen.getByText("Pasta Night")).toBeInTheDocument();
    expect(screen.getByText("4 servings / 640 kcal")).toBeInTheDocument();
  });

  it("opens planned recipes directly and empty slots in mini recipes", () => {
    const todayKey = dateKey(new Date());

    useCalendarContextMock.mockReturnValue({
      plannedItemsByDate: {
        [todayKey]: [
          createPlannedItem(todayKey, { recipeId: "recipe-42", recipeName: "Pasta Night" }),
        ],
      },
      isLoading: false,
    });

    render(<TodaysMeals />);

    fireEvent.click(screen.getByRole("button", { name: "Pasta Night" }));
    expect(pushMock).toHaveBeenCalledWith("/recipes/recipe-42");

    const emptyBreakfastButton = screen.getByRole("button", { name: "Add Recipe Breakfast" });

    expect(emptyBreakfastButton).toHaveTextContent("Add Recipe");

    fireEvent.click(emptyBreakfastButton);
    expect(pushMock).not.toHaveBeenCalledWith("/calendar");
    expect(screen.getByRole("dialog")).toHaveTextContent("Mini recipes Breakfast");
  });

  it("shows only slots with planned items in planned mode", () => {
    visibilityMock = "planned";
    const todayKey = dateKey(new Date());

    useCalendarContextMock.mockReturnValue({
      plannedItemsByDate: {
        [todayKey]: [createPlannedItem(todayKey, { slot: "Dinner" })],
      },
      isLoading: false,
    });

    render(<TodaysMeals />);

    expect(screen.getByRole("heading", { name: "Today" })).toBeInTheDocument();
    expect(screen.getAllByText("Dinner")).not.toHaveLength(0);
    expect(screen.queryByText("Breakfast")).not.toBeInTheDocument();
    expect(screen.queryByText("Lunch")).not.toBeInTheDocument();
    expect(screen.queryByText("Snack")).not.toBeInTheDocument();
  });

  it("renders nothing in planned mode when nothing is planned", () => {
    visibilityMock = "planned";

    useCalendarContextMock.mockReturnValue({
      plannedItemsByDate: {},
      isLoading: false,
    });

    render(<TodaysMeals />);

    expect(screen.queryByRole("heading", { name: "Today" })).not.toBeInTheDocument();
  });

  it("renders nothing when hidden", () => {
    visibilityMock = "hidden";
    const todayKey = dateKey(new Date());

    useCalendarContextMock.mockReturnValue({
      plannedItemsByDate: {
        [todayKey]: [createPlannedItem(todayKey)],
      },
      isLoading: false,
    });

    render(<TodaysMeals />);

    expect(screen.queryByRole("heading", { name: "Today" })).not.toBeInTheDocument();
    expect(screen.queryByText("Pasta Night")).not.toBeInTheDocument();
  });
  describe("week view", () => {
    const monday = getWeekStart(new Date());

    beforeEach(() => {
      calendarViewMock = "week";
    });

    function mockWeekContext(plannedItemsByDate: Record<string, PlannedItemFromQuery[]> = {}) {
      useCalendarContextMock.mockReturnValue({
        plannedItemsByDate,
        isLoading: false,
        isRangeLoading: false,
        goToWeek: goToWeekMock,
      });
    }

    it("shows the current week with navigation arrows", () => {
      mockWeekContext();

      render(<TodaysMeals />);

      expect(screen.getByRole("heading", { name: "This week" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Previous week" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Next week" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "This week" })).not.toBeInTheDocument();
    });

    it("loads the next week when clicking the next arrow", () => {
      mockWeekContext();

      render(<TodaysMeals />);

      fireEvent.click(screen.getByRole("button", { name: "Next week" }));

      expect(goToWeekMock).toHaveBeenCalledTimes(1);
      expect(dateKey(getWeekStart(goToWeekMock.mock.calls[0]![0]))).toBe(
        dateKey(addWeeks(monday, 1))
      );
      expect(screen.getByRole("heading", { name: "Week" })).toBeInTheDocument();
    });

    it("loads the previous week when clicking the previous arrow", () => {
      mockWeekContext();

      render(<TodaysMeals />);

      fireEvent.click(screen.getByRole("button", { name: "Previous week" }));

      expect(dateKey(getWeekStart(goToWeekMock.mock.calls[0]![0]))).toBe(
        dateKey(addWeeks(monday, -1))
      );
    });

    it("shows the items of the displayed week", () => {
      const nextMonday = dateKey(addWeeks(monday, 1));

      mockWeekContext({
        [nextMonday]: [createPlannedItem(nextMonday, { recipeName: "Next Week Curry" })],
      });

      render(<TodaysMeals />);

      expect(screen.queryByText("Next Week Curry")).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Next week" }));

      expect(screen.getByText("Next Week Curry")).toBeInTheDocument();
    });

    it("returns to the current week from another week", () => {
      mockWeekContext();

      render(<TodaysMeals />);

      fireEvent.click(screen.getByRole("button", { name: "Next week" }));
      fireEvent.click(screen.getByRole("button", { name: "This week" }));

      expect(dateKey(getWeekStart(goToWeekMock.mock.calls[1]![0]))).toBe(dateKey(monday));
      expect(screen.getByRole("heading", { name: "This week" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "This week" })).not.toBeInTheDocument();
    });

    it("keeps the arrows on an empty week in planned mode", () => {
      visibilityMock = "planned";
      const todayKey = dateKey(new Date());

      mockWeekContext({ [todayKey]: [createPlannedItem(todayKey)] });

      const { rerender } = render(<TodaysMeals />);

      // Going to a week with nothing planned must not hide the section.
      useCalendarContextMock.mockReturnValue({
        plannedItemsByDate: {},
        isLoading: false,
        isRangeLoading: false,
        goToWeek: goToWeekMock,
      });
      fireEvent.click(screen.getByRole("button", { name: "Next week" }));
      rerender(<TodaysMeals />);

      expect(screen.getByRole("button", { name: "Previous week" })).toBeInTheDocument();
    });

    it("does not show week arrows in the day view", () => {
      calendarViewMock = "day";
      mockWeekContext();

      render(<TodaysMeals />);

      expect(screen.queryByRole("button", { name: "Next week" })).not.toBeInTheDocument();
    });
  });
});
