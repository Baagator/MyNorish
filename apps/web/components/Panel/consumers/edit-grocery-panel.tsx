"use client";

import { useEffect, useState } from "react";
import { RecurrenceSuggestion } from "@/app/(app)/groceries/components/recurrence-suggestion";
import { ProductPicker } from "@/components/groceries/product-picker";
import { StoreSelector } from "@/components/groceries/store-selector";
import { RecurrencePanel } from "@/components/Panel/consumers/recurrence-panel";
import Panel from "@/components/Panel/Panel";
import { ActionButton, ActionButtonGroup } from "@/components/shared/action-button";
import { useChooseProduct, useParsedGroceryName } from "@/hooks/stores";
import { useRecurrenceDetection } from "@/hooks/use-recurrence-detection";
import { Input } from "@heroui/react";
import { AnimatePresence } from "motion/react";
import { useTranslations } from "next-intl";

import type {
  GroceryDto,
  RecurringGroceryDto,
  StoreDto,
  StoreProductChoice,
} from "@norish/shared/contracts";
import type { RecurrencePattern } from "@norish/shared/contracts/recurrence";
import { useGroceryFormState } from "@norish/shared-react/hooks";

type EditGroceryPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  grocery: GroceryDto;
  recurringGrocery: RecurringGroceryDto | null;
  stores: StoreDto[];
  /** Which stage to open on: the form, or the price picker the row asked for. */
  initialStage?: "form" | "picker";
  onSave: (itemName: string, pattern: RecurrencePattern | null, storeId?: string | null) => void;
  onDelete: () => void;
};
export default function EditGroceryPanel({
  open,
  onOpenChange,
  grocery,
  recurringGrocery,
  stores,
  initialStage = "form",
  onSave,
  onDelete,
}: EditGroceryPanelProps) {
  const t = useTranslations("groceries.panel");
  const tActions = useTranslations("common.actions");
  const [recurrencePanelOpen, setRecurrencePanelOpen] = useState(false);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [hasStoreChanged, setHasStoreChanged] = useState(false);
  const [stage, setStage] = useState<"form" | "picker">(initialStage);
  const [choice, setChoice] = useState<StoreProductChoice | null>(null);
  const chooseProduct = useChooseProduct();
  const {
    itemName,
    setItemName,
    confirmedPattern,
    setConfirmedPattern,
    handleConfirmPattern,
    handleRemovePattern,
    reset,
  } = useGroceryFormState();
  const { detectedPattern } = useRecurrenceDetection({
    itemName,
    enabled: open && !recurrencePanelOpen,
  });

  // Initialize form with grocery data when opening
  useEffect(() => {
    if (open) {
      const text = [grocery.amount, grocery.unit, grocery.name].filter(Boolean).join(" ");
      setItemName(text);
      setSelectedStoreId(grocery.storeId ?? null);
      setHasStoreChanged(false);
      setStage(initialStage);
      setChoice(null);
      if (recurringGrocery) {
        setConfirmedPattern({
          rule: recurringGrocery.recurrenceRule as "day" | "week" | "month",
          interval: recurringGrocery.recurrenceInterval,
          weekday: recurringGrocery.recurrenceWeekday ?? undefined,
        });
      } else {
        setConfirmedPattern(null);
      }
    } else {
      reset();
    }
  }, [open, grocery, recurringGrocery, initialStage, setItemName, setConfirmedPattern, reset]);
  const parsedName = useParsedGroceryName(itemName);
  const selectedStore = stores.find((store) => store.id === selectedStoreId) ?? null;
  const handleStoreChange = (storeId: string | null) => {
    setSelectedStoreId(storeId);
    setHasStoreChanged(storeId !== (grocery.storeId ?? null));
  };
  const handleSubmit = () => {
    const trimmed = itemName.trim();
    if (!trimmed) return;

    // Fold the store change into the single save call so both the name/unit
    // update and the store assignment happen in one atomic mutation (avoiding
    // a version-conflict race between two separate mutations).
    onSave(trimmed, confirmedPattern, hasStoreChanged ? selectedStoreId : undefined);

    // The picker's choice is written here and nowhere else, against the name
    // the grocery is saved under — the Product Link is keyed by that name.
    if (choice && selectedStoreId && parsedName) {
      void chooseProduct(selectedStoreId, parsedName, choice);
    }

    onOpenChange(false);
  };
  const handleRecurrenceSave = (pattern: RecurrencePattern | null) => {
    setConfirmedPattern(pattern);
    setRecurrencePanelOpen(false);
  };
  const handlePanelOpenChange = (isOpen: boolean) => {
    if (!isOpen) setRecurrencePanelOpen(false);
    onOpenChange(isOpen);
  };
  return (
    <>
      <Panel
        open={open}
        title={stage === "picker" ? t("priceTitle") : t("editTitle")}
        onOpenChange={handlePanelOpenChange}
      >
        <Panel.Body>
          {stage === "picker" && selectedStore ? (
            <ProductPicker
              choice={choice}
              groceryName={parsedName}
              storeId={selectedStore.id}
              storeName={selectedStore.name}
              onBack={() => setStage("form")}
              onChoice={setChoice}
            />
          ) : (
            <div className="space-y-3">
              <Input
                className="h-12 text-base font-medium"
                variant="secondary"
                placeholder={t("editPlaceholder")}
                style={{
                  fontSize: "16px",
                }}
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
              />

              {/* Store selection */}
              <StoreSelector
                showWhenEmpty
                label={t("selectStore")}
                selectedStoreId={selectedStoreId}
                stores={stores}
                onSelectionChange={handleStoreChange}
              />

              {/* Recurrence Pills Container */}
              <AnimatePresence mode="popLayout">
                <div className="flex flex-wrap items-center gap-2">
                  {/* Suggested pill  */}
                  {detectedPattern && (
                    <RecurrenceSuggestion
                      key="detected"
                      itemName={itemName}
                      pattern={detectedPattern.pattern}
                      type="detected"
                      onReplace={() => handleConfirmPattern(detectedPattern)}
                    />
                  )}

                  {/* Active pill */}
                  {confirmedPattern && (
                    <RecurrenceSuggestion
                      key="confirmed"
                      itemName={itemName}
                      pattern={confirmedPattern}
                      type="confirmed"
                      onEdit={() => setRecurrencePanelOpen(true)}
                      onRemove={handleRemovePattern}
                    />
                  )}
                </div>
              </AnimatePresence>

              {/* Link to manual recurrence editor */}
              {!confirmedPattern && !detectedPattern && (
                <ActionButton
                  action="add"
                  className="-mt-1 min-w-16 font-medium"
                  size="sm"
                  onPress={() => setRecurrencePanelOpen(true)}
                  variant="tertiary"
                >
                  {t("addRepeat")}
                </ActionButton>
              )}

              {/* The shop this Store stands for can be asked what this costs */}
              {selectedStore?.searchAddress && parsedName && (
                <ActionButton
                  action="edit"
                  className="min-w-16 font-medium"
                  data-testid="open-price-picker"
                  size="sm"
                  variant="tertiary"
                  onPress={() => setStage("picker")}
                >
                  {t("pickPrice")}
                </ActionButton>
              )}
            </div>
          )}
        </Panel.Body>
        <Panel.Footer>
          <ActionButtonGroup>
            <ActionButton action="delete" onPress={onDelete}>
              {tActions("delete")}
            </ActionButton>
            <ActionButton action="save" isDisabled={!itemName.trim()} onPress={handleSubmit}>
              {tActions("save")}
            </ActionButton>
          </ActionButtonGroup>
        </Panel.Footer>

        <RecurrencePanel
          nested
          initialPattern={confirmedPattern}
          open={open && recurrencePanelOpen}
          returnToPreviousPanel={() => setRecurrencePanelOpen(false)}
          onOpenChange={setRecurrencePanelOpen}
          onSave={handleRecurrenceSave}
        />
      </Panel>
    </>
  );
}
