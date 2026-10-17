function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 0, 0, 0, 0);
}

function atNine(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 9, 0, 0, 0);
}

function addDays(value: Date, days: number): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate() + days, 0, 0, 0, 0);
}

export function computeReminderFireAt(dueAt: Date, now: Date): Date {
  const dueDay = startOfDay(dueAt);
  const today = startOfDay(now);
  const preferred = atNine(addDays(dueDay, -3));
  if (preferred.getTime() > now.getTime()) {
    return preferred;
  }
  const dueNine = atNine(dueDay);
  if (today.getTime() > dueDay.getTime()) {
    return now;
  }
  if (today.getTime() === dueDay.getTime()) {
    return dueNine.getTime() > now.getTime() ? dueNine : now;
  }
  if (dueNine.getTime() > now.getTime()) {
    return dueNine;
  }
  return now;
}
