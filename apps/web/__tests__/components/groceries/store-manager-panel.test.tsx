/**
 * The store manager: a list of Stores, and a panel of their own for the one
 * being added or edited, opened over the list the way every other editor in
 * the app is.
 */
import type { ReactNode } from "react";
import { StoreManagerPanel } from "@/components/groceries/stores/store-manager-panel";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@testing-library/jest-dom";

import type { StoreDto } from "@norish/shared/contracts";

const createStore = vi.fn(async () => "store-new");
const updateStore = vi.fn();

vi.mock("@/hooks/stores", () => ({
  useStoresMutations: () => ({
    createStore,
    updateStore,
    deleteStore: vi.fn(),
    reorderStores: vi.fn(),
    checkSearchAddress: vi.fn(async () => ({ outcome: "answered", count: null })),
  }),
}));

vi.mock("@/hooks/groceries", () => ({
  useGroceriesQuery: () => ({ groceries: [] }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key} ${Object.values(params).join(" ")}` : key,
  useLocale: () => "en",
}));

// A Panel is a region named by its title, there only while open — which is
// what "a panel of its own" means to these tests.
vi.mock("@/components/Panel/Panel", () => {
  const Panel = ({
    children,
    open,
    title,
  }: {
    children: ReactNode;
    open: boolean;
    title?: string;
  }) => (open ? <section aria-label={title}>{children}</section> : null);

  Panel.Body = ({ children }: { children: ReactNode }) => <div>{children}</div>;
  Panel.Footer = ({ children }: { children: ReactNode }) => <div>{children}</div>;

  return { default: Panel, usePanelPortalContainer: () => undefined };
});

vi.mock("@/components/shared/action-button", () => ({
  ActionButton: ({ children, onPress, isDisabled, action }: any) => (
    <button data-testid={`action-${action}`} disabled={isDisabled} type="button" onClick={onPress}>
      {children}
    </button>
  ),
  ActionButtonGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  IconActionButton: ({ label, onPress, action }: any) => (
    <button aria-label={label} data-testid={`icon-${action}`} type="button" onClick={onPress} />
  ),
}));

vi.mock("motion/react", () => ({
  Reorder: {
    Group: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    Item: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  },
  useDragControls: () => ({ start: () => undefined }),
}));

vi.mock("@/components/groceries/stores/delete-store-modal", () => ({
  DeleteStoreModal: () => null,
}));

const DIRK = {
  id: "store-dirk",
  name: "Dirk",
  color: "green",
  icon: "ShoppingBagIcon",
  sortOrder: 0,
  website: "https://www.dirk.nl",
  searchAddress: "https://www.dirk.nl/zoeken/producten/{query}",
} as unknown as StoreDto;

function nameField(): HTMLElement {
  return screen.getByTestId("store-name");
}

beforeEach(() => {
  createStore.mockClear();
  updateStore.mockClear();
});

describe("StoreManagerPanel", () => {
  it("opens a Store in a panel of its own, with what it is already", () => {
    render(<StoreManagerPanel open={true} stores={[DIRK]} onOpenChange={() => undefined} />);

    // The list is the manager; the editor is not on it until asked for.
    expect(screen.getByRole("region", { name: "title" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "editStore" })).not.toBeInTheDocument();
    expect(screen.getByText("Dirk")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("icon-edit"));

    const editor = screen.getByRole("region", { name: "editStore" });

    expect(editor).toBeInTheDocument();
    expect(nameField()).toHaveValue("Dirk");
    expect(screen.getByTestId("store-shop-link")).toHaveValue(
      "https://www.dirk.nl/zoeken/producten/{query}"
    );
    // The list stays where it was, under the editor.
    expect(screen.getByText("Dirk")).toBeInTheDocument();
  });

  it("saves an edit from the editor's own footer and closes it", () => {
    render(<StoreManagerPanel open={true} stores={[DIRK]} onOpenChange={() => undefined} />);

    fireEvent.click(screen.getByTestId("icon-edit"));
    fireEvent.change(nameField(), { target: { value: "Dirk van den Broek" } });
    fireEvent.click(screen.getByTestId("action-save"));

    expect(updateStore).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "store-dirk",
        name: "Dirk van den Broek",
        website: "https://www.dirk.nl",
        searchAddress: "https://www.dirk.nl/zoeken/producten/{query}",
      })
    );
    expect(screen.queryByRole("region", { name: "editStore" })).not.toBeInTheDocument();
  });

  it("lets go of an edit that is cancelled", () => {
    render(<StoreManagerPanel open={true} stores={[DIRK]} onOpenChange={() => undefined} />);

    fireEvent.click(screen.getByTestId("icon-edit"));
    fireEvent.change(nameField(), { target: { value: "Something else" } });
    fireEvent.click(screen.getByTestId("action-cancel"));

    expect(updateStore).not.toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: "editStore" })).not.toBeInTheDocument();
    // Opened again, the Store reads as it is, not as it was half-typed.
    fireEvent.click(screen.getByTestId("icon-edit"));
    expect(nameField()).toHaveValue("Dirk");
  });

  it("adds a Store in the same panel, once it has a name", async () => {
    render(<StoreManagerPanel open={true} stores={[DIRK]} onOpenChange={() => undefined} />);

    // The way in stays in the manager's own footer, under the list.
    fireEvent.click(screen.getByTestId("action-add"));

    expect(screen.getByRole("region", { name: "addStore" })).toBeInTheDocument();
    expect(nameField()).toHaveValue("");
    expect(screen.getByTestId("action-create")).toBeDisabled();

    fireEvent.change(nameField(), { target: { value: "Jumbo" } });
    expect(screen.getByTestId("action-create")).toBeEnabled();

    await act(async () => {
      fireEvent.click(screen.getByTestId("action-create"));
    });

    expect(createStore).toHaveBeenCalledWith({
      name: "Jumbo",
      color: "primary",
      icon: "ShoppingBagIcon",
      website: null,
      searchAddress: null,
    });
    expect(screen.queryByRole("region", { name: "addStore" })).not.toBeInTheDocument();
  });
});
