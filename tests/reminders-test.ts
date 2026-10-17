import { computeReminderFireAt } from "../convex/lib/reminders";

function at(y: number, m: number, d: number, h: number, min = 0): Date {
  return new Date(y, m - 1, d, h, min, 0, 0);
}

describe("computeReminderFireAt", () => {
  test("uses 3 days before at 09:00 when that is still future", () => {
    const due = at(2026, 10, 17, 0);
    const now = at(2026, 10, 1, 12);
    const fire = computeReminderFireAt(due, now);
    expect(fire).toEqual(at(2026, 10, 14, 9));
  });

  test("returns now when due is today", () => {
    const due = at(2026, 10, 17, 0);
    const now = at(2026, 10, 17, 10, 30);
    const fire = computeReminderFireAt(due, now);
    expect(fire.getTime()).toBe(now.getTime());
  });

  test("returns now when overdue", () => {
    const due = at(2026, 10, 17, 0);
    const now = at(2026, 10, 18, 8);
    expect(computeReminderFireAt(due, now).getTime()).toBe(now.getTime());
  });

  test("falls back to due-day 09:00 when 3-day mark is past and due is tomorrow", () => {
    const due = at(2026, 10, 17, 0);
    const now = at(2026, 10, 16, 10);
    expect(computeReminderFireAt(due, now)).toEqual(at(2026, 10, 17, 9));
  });

  test("returns now when due is tomorrow and today 09:00 and due-day 09:00 are both unusable because now is after due-day 09:00 — not applicable; if now is due morning before 09:00 use 09:00", () => {
    const due = at(2026, 10, 17, 0);
    const now = at(2026, 10, 17, 8);
    expect(computeReminderFireAt(due, now)).toEqual(at(2026, 10, 17, 9));
  });
});
