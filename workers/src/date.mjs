// Later announcements take precedence when multiple files cover the same date.
export function createDateLookup(data) {
  const dates = new Map();
  for (const year of Object.keys(data).sort((a, b) => Number(a) - Number(b))) {
    for (const day of data[year].days) dates.set(day.date, { day, year: Number(year) });
  }
  return (date) => {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const parsed = new Date(`${date}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return null;
    const weekday = parsed.getUTCDay();
    const isWeekend = weekday === 0 || weekday === 6;
    const record = dates.get(date);
    const covered = Boolean(record || data[date.slice(0, 4)]?.papers.length);
    const isOffDay = covered ? (record ? record.day.isOffDay : isWeekend) : null;
    return {
      date,
      weekday,
      isWeekend,
      dataAvailable: covered,
      isHoliday: covered ? Boolean(record?.day.isOffDay) : null,
      isOffDay,
      isWorkday: covered ? !isOffDay : null,
      isAdjustedWorkday: covered ? Boolean(record && !record.day.isOffDay) : null,
      name: record?.day.name ?? null,
      sourceYear: record?.year ?? null,
    };
  };
}
