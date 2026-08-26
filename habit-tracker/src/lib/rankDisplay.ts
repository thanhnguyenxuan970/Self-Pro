type RankDisplayRow = {
  isCurrentUser: boolean;
  lifetimeStars: number | null | undefined;
};

export function displayStarsForRankRow(row: RankDisplayRow, localStars: number | null | undefined): number {
  const serverStarsValue = Number(row.lifetimeStars);
  const serverStars = Number.isFinite(serverStarsValue) ? Math.max(0, serverStarsValue) : 0;
  if (!row.isCurrentUser) return serverStars;

  const homeStars = Number(localStars);
  return Number.isFinite(homeStars) ? Math.max(0, Math.floor(homeStars)) : serverStars;
}
