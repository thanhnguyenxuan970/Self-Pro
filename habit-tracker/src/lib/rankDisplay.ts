type RankDisplayRow = {
  isCurrentUser: boolean;
  yearStars: number | null | undefined;
};

export function displayStarsForRankRow(row: RankDisplayRow, localStars: number | null | undefined): number {
  const serverStarsValue = row.yearStars == null ? Number.NaN : Number(row.yearStars);
  if (Number.isFinite(serverStarsValue)) return Math.max(0, Math.floor(serverStarsValue));

  // Only the signed-in row may use the local value while the annual RPC is
  // loading. Applying it to a rival would display the caller's score twice.
  if (!row.isCurrentUser) return 0;
  const localYearStars = Number(localStars);
  return Number.isFinite(localYearStars) ? Math.max(0, Math.floor(localYearStars)) : 0;
}
