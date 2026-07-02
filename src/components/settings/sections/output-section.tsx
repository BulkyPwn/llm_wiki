import { useTranslation } from "react-i18next"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import type { SettingsDraft, DraftSetter } from "../settings-types"
import { OUTPUT_LANGUAGE_OPTIONS as LANGUAGE_OPTIONS } from "@/lib/output-language-options"
import type { IngestTimeSlot } from "@/stores/wiki-store"

interface Props {
  draft: SettingsDraft
  setDraft: DraftSetter
}

const HISTORY_OPTIONS = [2, 4, 6, 8, 10, 20]

/** Generate a simple short id for a new time slot. */
function newSlotId(): string {
  return `slot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

/** Default empty slot template. */
function emptySlot(): IngestTimeSlot {
  return {
    id: newSlotId(),
    label: "",
    startHour: 9,
    endHour: 17,
    concurrency: 5,
  }
}

export function OutputSection({ draft, setDraft }: Props) {
  const { t } = useTranslation()

  const scheduleEnabled = draft.ingestConcurrencyScheduleEnabled
  const slots = draft.ingestConcurrencySchedule

  function toggleEnabled() {
    setDraft("ingestConcurrencyScheduleEnabled", !scheduleEnabled)
  }

  function addSlot() {
    setDraft("ingestConcurrencySchedule", [...slots, emptySlot()])
  }

  function removeSlot(id: string) {
    setDraft("ingestConcurrencySchedule", slots.filter((s) => s.id !== id))
  }

  function updateSlot(id: string, patch: Partial<IngestTimeSlot>) {
    setDraft(
      "ingestConcurrencySchedule",
      slots.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    )
  }

  /** Check whether any two slots overlap (including cross-midnight). */
  function overlaps(a: IngestTimeSlot, b: IngestTimeSlot): boolean {
    if (a === b) return false
    const aEnd = a.endHour <= a.startHour ? a.endHour + 24 : a.endHour
    const bEnd = b.endHour <= b.startHour ? b.endHour + 24 : b.endHour
    const aStart = a.startHour
    const bStart = b.startHour
    return aStart < bEnd && bStart < aEnd
  }

  const overlapMap = new Map<string, boolean>()
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      if (overlaps(slots[i], slots[j])) {
        overlapMap.set(slots[i].id, true)
        overlapMap.set(slots[j].id, true)
      }
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">{t("settings.sections.output.title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("settings.sections.output.description")}
        </p>
      </div>

      <div className="space-y-2">
        <Label>{t("settings.sections.output.aiLanguage")}</Label>
        <p className="text-xs text-muted-foreground">
          {t("settings.sections.output.aiLanguageHint")}
        </p>
        <select
          value={draft.outputLanguage}
          onChange={(e) => setDraft("outputLanguage", e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {LANGUAGE_OPTIONS.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label>{t("settings.sections.output.historyLength")}</Label>
        <p className="text-xs text-muted-foreground">
          {t("settings.sections.output.historyHint")}
        </p>
        <div className="flex flex-wrap gap-2">
          {HISTORY_OPTIONS.map((n) => {
            const active = draft.maxHistoryMessages === n
            return (
              <button
                key={n}
                type="button"
                onClick={() => setDraft("maxHistoryMessages", n)}
                className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:bg-accent"
                }`}
              >
                {n}
              </button>
            )
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          {t("settings.sections.output.historyCurrent", {
            count: draft.maxHistoryMessages,
            turns: draft.maxHistoryMessages / 2,
          })}
        </p>
      </div>

      {/* ── Ingest concurrency (flat) ── */}
      <div className="space-y-2 rounded-md border p-3">
        <Label>{t("settings.sections.output.ingestConcurrency")}</Label>
        <Input
          type="number"
          min={1}
          max={100}
          step={1}
          value={draft.ingestConcurrency}
          onChange={(e) => {
            const n = Number(e.target.value)
            setDraft("ingestConcurrency", Number.isFinite(n) && n >= 1 ? n : 5)
          }}
          className="w-24"
        />
        <p className="text-xs text-muted-foreground">
          {t("settings.sections.output.ingestConcurrencyHint")}
        </p>
      </div>

      {/* ── Time-based concurrency schedule ── */}
      <div
        className={`rounded-md border-2 p-3 transition-colors ${
          scheduleEnabled ? "border-primary/40 bg-primary/5" : "border-border bg-background"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">
              {t("settings.sections.output.scheduleEnableLabel", "Time-based concurrency")}
            </div>
            <div className="text-xs text-muted-foreground">
              {t(
                "settings.sections.output.scheduleEnableHint",
                "Set different concurrency limits for different times of day. Useful when your LLM API has time-based rate limits or costs.",
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={toggleEnabled}
            role="switch"
            aria-checked={scheduleEnabled}
            aria-label={t("settings.sections.output.scheduleEnableLabel", "Time-based concurrency")}
            className="ml-3 flex shrink-0 items-center gap-2"
          >
            <span
              className={`text-xs font-semibold ${
                scheduleEnabled ? "text-primary" : "text-muted-foreground"
              }`}
            >
              {scheduleEnabled ? t("settings.sections.output.stateOn", "ON") : t("settings.sections.output.stateOff", "OFF")}
            </span>
            <span
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                scheduleEnabled ? "bg-primary" : "bg-muted"
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                  scheduleEnabled ? "translate-x-4.5" : "translate-x-0.5"
                }`}
              />
            </span>
          </button>
        </div>

        {scheduleEnabled && (
          <div className="mt-4 space-y-3">
            <div className="text-xs text-muted-foreground">
              {t(
                "settings.sections.output.scheduleHint",
                "Define time ranges (inclusive start, exclusive end). Cross-midnight ranges (e.g. 22:00-06:00) are supported. Hours not covered by any slot use the default concurrency above.",
              )}
            </div>

            {slots.length === 0 && (
              <p className="text-xs text-muted-foreground italic">
                {t("settings.sections.output.scheduleEmpty", "No time slots defined. Add one below.")}
              </p>
            )}

            {slots.map((slot) => {
              const hasOverlap = overlapMap.get(slot.id) ?? false
              return (
                <div
                  key={slot.id}
                  className={`flex flex-wrap items-end gap-2 rounded-md border p-2 ${
                    hasOverlap ? "border-red-400 bg-red-50 dark:bg-red-950/20" : "border-border"
                  }`}
                >
                  <div className="flex-1 min-w-[100px]">
                    <Label className="text-xs">
                      {t("settings.sections.output.slotLabel", "Label")}
                    </Label>
                    <Input
                      className="h-7 text-xs"
                      placeholder={t("settings.sections.output.slotLabelPlaceholder", "e.g. Night")}
                      value={slot.label}
                      onChange={(e) => updateSlot(slot.id, { label: e.target.value })}
                    />
                  </div>

                  <div className="w-14">
                    <Label className="text-xs">
                      {t("settings.sections.output.slotStart", "Start")}
                    </Label>
                    <Input
                      type="number"
                      className="h-7 text-xs"
                      min={0}
                      max={23}
                      value={slot.startHour}
                      onChange={(e) => {
                        const v = Number(e.target.value)
                        if (Number.isFinite(v)) updateSlot(slot.id, { startHour: Math.max(0, Math.min(23, v)) })
                      }}
                    />
                  </div>

                  <span className="pb-1 text-xs text-muted-foreground">—</span>

                  <div className="w-14">
                    <Label className="text-xs">
                      {t("settings.sections.output.slotEnd", "End")}
                    </Label>
                    <Input
                      type="number"
                      className="h-7 text-xs"
                      min={0}
                      max={24}
                      value={slot.endHour}
                      onChange={(e) => {
                        const v = Number(e.target.value)
                        if (Number.isFinite(v)) updateSlot(slot.id, { endHour: Math.max(0, Math.min(24, v)) })
                      }}
                    />
                  </div>

                  <div className="w-14">
                    <Label className="text-xs">
                      {t("settings.sections.output.slotConcurrency", "Concur.")}
                    </Label>
                    <Input
                      type="number"
                      className="h-7 text-xs"
                      min={1}
                      max={100}
                      value={slot.concurrency}
                      onChange={(e) => {
                        const v = Number(e.target.value)
                        if (Number.isFinite(v)) updateSlot(slot.id, { concurrency: Math.max(1, Math.min(100, v)) })
                      }}
                    />
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-red-500 hover:text-red-700"
                    onClick={() => removeSlot(slot.id)}
                  >
                    {t("settings.sections.output.slotRemove", "Remove")}
                  </Button>

                  {hasOverlap && (
                    <div className="w-full text-xs text-red-600">
                      {t("settings.sections.output.slotOverlapWarning", "This time slot overlaps with another slot.")}
                    </div>
                  )}
                </div>
              )
            })}

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={addSlot}
            >
              {t("settings.sections.output.slotAdd", "+ Add time slot")}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
