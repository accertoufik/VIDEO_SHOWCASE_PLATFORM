/** Cursor pages can overlap when new videos arrive mid-scroll; keep the first occurrence of each id. */
export const uniqueById = <T extends { id: string }>(items: T[]): T[] => {
  const seen = new Set<string>();
  return items.filter((item) =>
    seen.has(item.id) ? false : (seen.add(item.id), true),
  );
};
