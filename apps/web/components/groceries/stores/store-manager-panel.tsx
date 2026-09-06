"use client";

import { useRef, useState } from "react";
import { DynamicHeroIcon, STORE_ICON_NAMES } from "@/components/groceries/dynamic-hero-icon";
import { getStoreColorClasses, STORE_COLOR_OPTIONS } from "@/components/groceries/store-colors";
import Panel from "@/components/Panel/Panel";
import {
  ActionButton,
  ActionButtonGroup,
  IconActionButton,
} from "@/components/shared/action-button";
import { useGroceriesQuery } from "@/hooks/groceries";
import { useStoresMutations } from "@/hooks/stores";
import { Bars3Icon } from "@heroicons/react/24/solid";
import { Input, Label, TextField } from "@heroui/react";
import { Reorder, useDragControls } from "motion/react";
import { useTranslations } from "next-intl";

import type {
  SearchAddressOutcome,
  StoreColor,
  StoreDto,
  StoreSearchAddressResult,
} from "@norish/shared/contracts";
import { deriveSearchAddress } from "@norish/shared/lib/search-address";

import { DeleteStoreModal } from "./delete-store-modal";
import { storeLinkFields, StoreSearchAddressField } from "./store-search-address-field";

interface StoreManagerPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stores: StoreDto[];
}
type EditingStore = {
  id: string | null; // null = new store
  name: string;
  color: StoreColor;
  icon: string;
  /** What the user pasted: the shop's website, or a search they ran there. */
  link: string;
};
/** What the shop said when its Search Address was last tried, if it was. */
type ShopCheck = { storeName: string; result: StoreSearchAddressResult | null };

/**
 * Whether the form can be saved: a name, and a shop link that is either empty
 * or one Norish can read. A link it cannot read would be saved as no link at
 * all, silently taking the Store's website and Search Address with it.
 */
function canSave(editing: EditingStore): boolean {
  const link = editing.link.trim();

  return editing.name.trim() !== "" && (link === "" || deriveSearchAddress(link) !== null);
}

export function StoreManagerPanel({ open, onOpenChange, stores }: StoreManagerPanelProps) {
  const { createStore, updateStore, deleteStore, reorderStores, checkSearchAddress } =
    useStoresMutations();
  const { groceries } = useGroceriesQuery();
  const t = useTranslations("groceries.storeManager");
  const tActions = useTranslations("common.actions");
  const [editingStore, setEditingStore] = useState<EditingStore | null>(null);
  const [shopCheck, setShopCheck] = useState<ShopCheck | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [storeToDelete, setStoreToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const dragConstraintsRef = useRef<HTMLDivElement>(null);
  const handleStartCreate = () => {
    setEditingStore({
      id: null,
      name: "",
      color: "primary",
      icon: "ShoppingBagIcon",
      link: "",
    });
  };
  const handleStartEdit = (store: StoreDto) => {
    setEditingStore({
      id: store.id,
      name: store.name,
      color: store.color as StoreColor,
      icon: store.icon,
      link: store.searchAddress ?? store.website ?? "",
    });
  };
  const handleSave = async () => {
    if (!editingStore || !canSave(editingStore)) return;

    const { website, searchAddress, term } = storeLinkFields(editingStore.link);
    const storeName = editingStore.name.trim();
    // Re-saving a Store with the link it already had asks the shop nothing:
    // the address was checked when it was pasted, and a paste re-read from the
    // Store carries no term to check it with.
    const before = editingStore.id ? stores.find((store) => store.id === editingStore.id) : null;
    const linkChanged =
      !before ||
      (before.website ?? null) !== website ||
      (before.searchAddress ?? null) !== searchAddress;

    let savedId = editingStore.id;

    if (editingStore.id) {
      // Update existing store
      updateStore({
        id: editingStore.id,
        name: storeName,
        color: editingStore.color,
        icon: editingStore.icon,
        website,
        searchAddress,
      });
    } else {
      // Create new store
      savedId = await createStore({
        name: storeName,
        color: editingStore.color,
        icon: editingStore.icon,
        website,
        searchAddress,
      });
    }
    setEditingStore(null);
    // Verification informs, it never gates: the Store is stored by now, and
    // this only tells the user what the address it was given actually found.
    if (savedId && (website ?? searchAddress) && linkChanged) {
      setShopCheck({ storeName, result: null });
      checkSearchAddress(savedId, term, searchAddress, website)
        .then((result) => setShopCheck({ storeName, result }))
        .catch(() => setShopCheck(null));
    }
  };
  const handleCancel = () => {
    setEditingStore(null);
  };
  const handleDeleteClick = (store: StoreDto) => {
    setStoreToDelete({
      id: store.id,
      name: store.name,
    });
    setDeleteModalOpen(true);
  };
  const handleDeleteConfirm = (storeId: string, deleteGroceries: boolean) => {
    const grocerySnapshot = groceries
      .filter((grocery) => grocery.storeId === storeId)
      .map((grocery) => ({
        id: grocery.id,
        version: grocery.version,
      }));
    deleteStore(storeId, deleteGroceries, grocerySnapshot);
    setStoreToDelete(null);
  };
  const handleReorder = (newOrder: StoreDto[]) => {
    const storeIds = newOrder.map((s) => s.id);
    reorderStores(storeIds);
  };
  return (
    <>
      <Panel open={open} title={t("title")} onOpenChange={onOpenChange}>
        <Panel.Body>
          {shopCheck && <ShopCheckLine check={shopCheck} />}

          {/* Store list */}
          <div ref={dragConstraintsRef} className="min-h-0 flex-1">
            {stores.length === 0 && !editingStore && (
              <div className="text-muted py-8 text-center">
                <p>{t("noStoresYet")}</p>
                <p className="text-sm">{t("createStoreHint")}</p>
              </div>
            )}

            <Reorder.Group
              axis="y"
              className="flex flex-col gap-2"
              values={stores}
              onReorder={handleReorder}
            >
              {stores.map((store) => (
                <StoreListItem
                  key={store.id}
                  dragConstraintsRef={dragConstraintsRef}
                  isEditing={editingStore?.id === store.id}
                  store={store}
                  translations={{
                    deleteLabel: tActions("delete"),
                    editLabel: tActions("edit"),
                  }}
                  onDelete={() => handleDeleteClick(store)}
                  onEdit={() => handleStartEdit(store)}
                />
              ))}
            </Reorder.Group>

            {/* New store form inline */}
            {editingStore && editingStore.id === null && (
              <div className="mt-2">
                <StoreEditForm
                  editing={editingStore}
                  translations={{
                    t,
                    tActions,
                  }}
                  onCancel={handleCancel}
                  onChange={setEditingStore}
                  onSave={handleSave}
                />
              </div>
            )}
          </div>

          {/* Edit form when editing existing store */}
          {editingStore && editingStore.id !== null && (
            <div className="border-border border-t pt-4">
              <StoreEditForm
                editing={editingStore}
                translations={{
                  t,
                  tActions,
                }}
                onCancel={handleCancel}
                onChange={setEditingStore}
                onSave={handleSave}
              />
            </div>
          )}
        </Panel.Body>
        {!editingStore && (
          <Panel.Footer>
            <ActionButtonGroup>
              <ActionButton action="add" onPress={handleStartCreate}>
                {t("addStore")}
              </ActionButton>
            </ActionButtonGroup>
          </Panel.Footer>
        )}
      </Panel>

      <DeleteStoreModal
        isOpen={deleteModalOpen}
        storeId={storeToDelete?.id ?? null}
        storeName={storeToDelete?.name ?? ""}
        onClose={() => {
          setDeleteModalOpen(false);
          setStoreToDelete(null);
        }}
        onConfirm={handleDeleteConfirm}
      />
    </>
  );
}

/** One line of copy per thing a shop can answer, so no outcome goes unworded. */
const CHECK_MESSAGES: Record<SearchAddressOutcome, string> = {
  products: "checkFoundProducts",
  "no-products": "checkNoProducts",
  answered: "checkAnswered",
  "no-answer": "checkNoAnswer",
  "no-address": "checkNoAddress",
};

/** What the shop answered, in the user's own words rather than an error. */
function ShopCheckLine({ check }: { check: ShopCheck }) {
  const t = useTranslations("groceries.storeManager");
  const { result } = check;
  const message = result
    ? t(CHECK_MESSAGES[result.outcome], { store: check.storeName, count: result.count ?? 0 })
    : t("checkingShop", { store: check.storeName });

  return (
    <p
      className="text-muted bg-surface-secondary mb-2 rounded-lg p-3 text-sm"
      data-testid="shop-check"
    >
      {message}
    </p>
  );
}

// Store list item component
interface StoreListItemProps {
  store: StoreDto;
  isEditing: boolean;
  dragConstraintsRef: React.RefObject<HTMLDivElement | null>;
  translations: {
    deleteLabel: string;
    editLabel: string;
  };
  onEdit: () => void;
  onDelete: () => void;
}
function StoreListItem({
  store,
  isEditing,
  dragConstraintsRef,
  translations,
  onEdit,
  onDelete,
}: StoreListItemProps) {
  const controls = useDragControls();
  const colorClasses = getStoreColorClasses(store.color as StoreColor);
  if (isEditing) {
    return null; // Hide when editing (form shows below)
  }
  return (
    <Reorder.Item
      className="bg-surface flex items-center gap-3 rounded-lg p-3"
      drag="y"
      dragConstraints={dragConstraintsRef}
      dragControls={controls}
      dragElastic={0}
      dragListener={false}
      dragMomentum={false}
      style={{
        position: "relative",
      }}
      value={store}
    >
      {/* Drag handle */}
      <div
        className="text-muted shrink-0 cursor-grab touch-none active:cursor-grabbing"
        onPointerDown={(e) => controls.start(e)}
      >
        <Bars3Icon className="h-5 w-5" />
      </div>

      {/* Icon with color */}
      <div className={`shrink-0 rounded-full p-1.5 ${colorClasses.bgLight}`}>
        <DynamicHeroIcon className={`h-5 w-5 ${colorClasses.text}`} iconName={store.icon} />
      </div>

      {/* Name */}
      <span className="flex-1 truncate font-medium">{store.name}</span>

      {/* Actions */}
      <div className="flex shrink-0 gap-1">
        <IconActionButton action="edit" label={translations.editLabel} size="sm" onPress={onEdit} />
        <IconActionButton
          action="delete"
          label={translations.deleteLabel}
          size="sm"
          onPress={onDelete}
        />
      </div>
    </Reorder.Item>
  );
}

// Store edit form component
interface StoreEditFormProps {
  editing: EditingStore;
  onChange: (store: EditingStore) => void;
  onSave: () => void;
  onCancel: () => void;
  translations: {
    t: ReturnType<typeof useTranslations<"groceries.storeManager">>;
    tActions: ReturnType<typeof useTranslations<"common.actions">>;
  };
}
function StoreEditForm({ editing, onChange, onSave, onCancel, translations }: StoreEditFormProps) {
  const { t, tActions } = translations;
  return (
    <div className="bg-surface-secondary flex flex-col gap-4 rounded-lg p-4">
      {/* Name input - autoFocus is intentional UX for edit form */}
      <TextField
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        value={editing.name}
        onChange={(value) =>
          onChange({
            ...editing,
            name: value,
          })
        }
      >
        <Label>{t("storeName")}</Label>
        <Input
          variant="secondary"
          placeholder={t("storeNamePlaceholder")}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onSave();
            }
          }}
        />
      </TextField>

      {/* The shop this store stands for, from one pasted link */}
      <StoreSearchAddressField
        value={editing.link}
        onChange={(link) =>
          onChange({
            ...editing,
            link,
          })
        }
      />

      {/* Color picker */}
      <div>
        <p className="text-muted mb-2 text-sm font-medium">{t("storeColor")}</p>
        <div className="flex flex-wrap gap-2">
          {STORE_COLOR_OPTIONS.map((color) => {
            const colorClasses = getStoreColorClasses(color);
            const isSelected = editing.color === color;
            return (
              <button
                key={color}
                className={`h-8 w-8 rounded-full transition-transform ${colorClasses.bg} ${isSelected ? "scale-110 ring-2 ring-offset-2" : ""} ${colorClasses.ring}`}
                type="button"
                onClick={() =>
                  onChange({
                    ...editing,
                    color,
                  })
                }
              />
            );
          })}
        </div>
      </div>

      {/* Icon picker */}
      <div>
        <p className="text-muted mb-2 text-sm font-medium">{t("storeIcon")}</p>
        <div className="flex flex-wrap gap-2">
          {STORE_ICON_NAMES.map((iconName) => {
            const isSelected = editing.icon === iconName;
            const colorClasses = getStoreColorClasses(editing.color);
            return (
              <button
                key={iconName}
                className={`rounded-lg p-2 transition-colors ${isSelected ? `${colorClasses.bgLight} ${colorClasses.text}` : "bg-surface text-muted hover:bg-surface-tertiary"}`}
                type="button"
                onClick={() =>
                  onChange({
                    ...editing,
                    icon: iconName,
                  })
                }
              >
                <DynamicHeroIcon className="h-5 w-5" iconName={iconName} />
              </button>
            );
          })}
        </div>
      </div>

      {/* Action buttons */}
      <ActionButtonGroup>
        <ActionButton action="cancel" onPress={onCancel}>
          {tActions("cancel")}
        </ActionButton>
        <ActionButton
          action={editing.id ? "save" : "create"}
          isDisabled={!canSave(editing)}
          onPress={onSave}
        >
          {editing.id ? tActions("save") : t("create")}
        </ActionButton>
      </ActionButtonGroup>
    </div>
  );
}
