import { repositories } from "../repositories";

const SUPPORT_REMINDER_SETTING_KEY = "supportReminder";
const COFFEE_URL = "https://buymeacoffee.com/thelastoutpostworkshop";
const MIN_DAYS_BETWEEN_REMINDERS = 30;
const MIN_MEANINGFUL_USE_EVENTS = 6;

export type SupportReminderTrigger = "meaningful-use" | "successful-scan";

export interface SupportReminderState {
  firstSeenAt: string;
  meaningfulUseCount: number;
  lastShownAt?: string;
  deferredUntil?: string;
  disabled?: boolean;
}

export interface SupportReminderPrompt {
  message: string;
  url: string;
  state: SupportReminderState;
}

export async function recordSupportReminderEvent(
  trigger: SupportReminderTrigger,
  now = new Date()
): Promise<SupportReminderPrompt | null> {
  const currentState = await loadSupportReminderState(now);
  const nextState: SupportReminderState = {
    ...currentState,
    meaningfulUseCount:
      currentState.meaningfulUseCount + (trigger === "meaningful-use" ? 1 : 0)
  };

  if (!shouldShowSupportReminder(nextState, trigger, now)) {
    await saveSupportReminderState(nextState);
    return null;
  }

  const shownState: SupportReminderState = {
    ...nextState,
    lastShownAt: now.toISOString(),
    deferredUntil: undefined
  };

  await saveSupportReminderState(shownState);

  return {
    message:
      "ESP Board Vault is free and local-first. If it saves you time at the bench, you can support ongoing development.",
    url: COFFEE_URL,
    state: shownState
  };
}

export async function deferSupportReminder(now = new Date()): Promise<void> {
  const state = await loadSupportReminderState(now);
  const deferredUntil = addDays(now, MIN_DAYS_BETWEEN_REMINDERS).toISOString();

  await saveSupportReminderState({
    ...state,
    deferredUntil
  });
}

export async function disableSupportReminder(now = new Date()): Promise<void> {
  const state = await loadSupportReminderState(now);

  await saveSupportReminderState({
    ...state,
    disabled: true
  });
}

export async function loadSupportReminderState(
  now = new Date()
): Promise<SupportReminderState> {
  const setting = await repositories.appSettings.get(SUPPORT_REMINDER_SETTING_KEY);

  if (isSupportReminderState(setting?.value)) {
    return setting.value;
  }

  return {
    firstSeenAt: now.toISOString(),
    meaningfulUseCount: 0
  };
}

export function shouldShowSupportReminder(
  state: SupportReminderState,
  trigger: SupportReminderTrigger,
  now = new Date()
): boolean {
  if (state.disabled) {
    return false;
  }

  if (isFutureTimestamp(state.deferredUntil, now)) {
    return false;
  }

  if (isRecentTimestamp(state.lastShownAt, now, MIN_DAYS_BETWEEN_REMINDERS)) {
    return false;
  }

  if (trigger === "successful-scan") {
    return true;
  }

  return state.meaningfulUseCount >= MIN_MEANINGFUL_USE_EVENTS;
}

async function saveSupportReminderState(
  state: SupportReminderState
): Promise<void> {
  await repositories.appSettings.set(SUPPORT_REMINDER_SETTING_KEY, state);
}

function isSupportReminderState(value: unknown): value is SupportReminderState {
  if (!value || typeof value !== "object") {
    return false;
  }

  const state = value as Partial<SupportReminderState>;

  return (
    typeof state.firstSeenAt === "string" &&
    typeof state.meaningfulUseCount === "number" &&
    (state.lastShownAt === undefined || typeof state.lastShownAt === "string") &&
    (state.deferredUntil === undefined ||
      typeof state.deferredUntil === "string") &&
    (state.disabled === undefined || typeof state.disabled === "boolean")
  );
}

function isFutureTimestamp(value: string | undefined, now: Date): boolean {
  if (!value) {
    return false;
  }

  const timestamp = Date.parse(value);

  return Number.isFinite(timestamp) && timestamp > now.getTime();
}

function isRecentTimestamp(
  value: string | undefined,
  now: Date,
  dayCount: number
): boolean {
  if (!value) {
    return false;
  }

  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    return false;
  }

  return now.getTime() - timestamp < dayCount * 24 * 60 * 60 * 1000;
}

function addDays(value: Date, dayCount: number): Date {
  return new Date(value.getTime() + dayCount * 24 * 60 * 60 * 1000);
}
