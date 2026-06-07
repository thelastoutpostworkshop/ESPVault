import { describe, expect, it } from "vitest";
import {
  shouldShowSupportReminder,
  type SupportReminderState
} from "./supportReminder";

describe("support reminder", () => {
  const now = new Date("2026-06-07T12:00:00.000Z");

  it("does not show before enough meaningful use events", () => {
    expect(
      shouldShowSupportReminder(
        createState({ meaningfulUseCount: 5 }),
        "meaningful-use",
        now
      )
    ).toBe(false);
  });

  it("shows after enough meaningful use events", () => {
    expect(
      shouldShowSupportReminder(
        createState({ meaningfulUseCount: 6 }),
        "meaningful-use",
        now
      )
    ).toBe(true);
  });

  it("can show after a successful scan", () => {
    expect(
      shouldShowSupportReminder(createState(), "successful-scan", now)
    ).toBe(true);
  });

  it("respects the monthly cooldown and opt-out state", () => {
    expect(
      shouldShowSupportReminder(
        createState({ lastShownAt: "2026-05-20T12:00:00.000Z" }),
        "successful-scan",
        now
      )
    ).toBe(false);

    expect(
      shouldShowSupportReminder(
        createState({ disabled: true, meaningfulUseCount: 6 }),
        "meaningful-use",
        now
      )
    ).toBe(false);
  });

  it("respects remind-later deferrals", () => {
    expect(
      shouldShowSupportReminder(
        createState({
          deferredUntil: "2026-06-20T12:00:00.000Z",
          meaningfulUseCount: 6
        }),
        "meaningful-use",
        now
      )
    ).toBe(false);
  });
});

function createState(
  state: Partial<SupportReminderState> = {}
): SupportReminderState {
  return {
    firstSeenAt: "2026-06-01T12:00:00.000Z",
    meaningfulUseCount: 0,
    ...state
  };
}
