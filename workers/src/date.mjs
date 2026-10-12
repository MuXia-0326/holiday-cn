// Later announcements take precedence when multiple files cover the same date.
export function createDateLookup(data) {
  const dates = new Map();
  for (const year of Object.keys(data).sort((a, b) => Number(a) - Number(b))) {
    for (const day of data[year].days) dates.set(day.date, day);
  }
  return (date) => {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const parsed = new Date(`${date}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return null;
    const weekday = parsed.getUTCDay();
    const isWeekend = weekday === 0 || weekday === 6;
    const record = dates.get(date);
    const covered = Boolean(record || data[date.slice(0, 4)]?.papers.length);
    return {
      date,
      weekday,
      isWeekend,
      isHoliday: covered ? Boolean(record?.isOffDay) : null,
    };
  };
}
