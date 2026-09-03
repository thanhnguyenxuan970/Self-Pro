import { normalizeAnalyticsYearStars } from '../analytics/yearStars';

type RankDisplayRow = {
  isCurrentUser: boolean;
  yearStars: number | null | undefined;
};

export function displayStarsForRankRow(row: RankDisplayRow, localStars: number | null | undefined): number {
  return normalizeAnalyticsYearStars(row.isCurrentUser ? localStars : row.yearStars);
}
