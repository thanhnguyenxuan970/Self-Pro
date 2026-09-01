type RankDisplayRow = {
  isCurrentUser: boolean;
  yearStars: number | null | undefined;
};

export function displayStarsForRankRow(row: RankDisplayRow, localStars: number | null | undefined): number {
  if (row.isCurrentUser) {
    const localYearStars = Number(localStars);
    return Number.isFinite(localYearStars) ? Math.max(0, Math.floor(localYearStars)) : 0;
  }

  const serverStarsValue = row.yearStars == null ? Number.NaN : Number(row.yearStars);
  return Number.isFinite(serverStarsValue) ? Math.max(0, Math.floor(serverStarsValue)) : 0;
}
