export interface Tournament {
  id: number;
  name: string;
  slug: string;
  category: Category;
  uniqueTournament?: UniqueTournament;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  sport: Sport;
}

export interface Sport {
  id: number;
  name: string;
  slug: string;
}

export interface UniqueTournament {
  id: number;
  name: string;
  slug: string;
  category: Category;
}

export interface Team {
  id: number;
  name: string;
  slug: string;
  shortName: string;
  nameCode: string;
  type: number;
}

export interface Status {
  code: number;
  description: string;
  type: string;
}

export interface Event {
  id: number;
  slug: string;
  name: string;
  status: Status;
  homeTeam: Team;
  awayTeam: Team;
  homeScore?: Score;
  awayScore?: Score;
  startTimestamp: number;
  tournament: Tournament;
  [key: string]: any;
}

export interface Score {
  current?: number;
  display?: number;
  period1?: number;
  period2?: number;
  normaltime?: number;
}

export interface Choice {
  name: string;
  description?: string;
  fractionalValue: string;
  sourceId: number;
  value: number;
  decimalValue?: number;
}

export interface Market {
  id: number;
  name: string;
  isMain: boolean;
  choices: Choice[];
}

export interface Odds {
  markets: Market[];
  [key: string]: any;
}

export interface PlayerDetails {
  id: number;
  name: string;
  slug: string;
  shortName: string;
  position: string;
  jerseyNumber: string;
  userCount?: number;
  marketValueCurrency?: string;
  dateOfBirthTimestamp?: number;
  fieldTranslations?: any;
}

export interface Player extends PlayerDetails {
  starter?: boolean;
  substitute?: boolean;
  statistics?: any;
  [key: string]: any;
}

export interface SofascorePlayerResponse {
  player: PlayerDetails;
  position: string;
  jerseyNumber: string;
  starter?: boolean;
  substitute?: boolean;
  statistics?: any;
  [key: string]: any;
}

export interface LineupSide {
  players: Player[];
  substitutes: Player[];
  missingPlayers: Player[];
  formation?: string;
  captain?: Player;
}

export interface Lineups {
  home: LineupSide;
  away: LineupSide;
  confirmed?: boolean;
}

export interface LeaguesData {
  uniqueTournaments: UniqueTournament[];
  [key: string]: any;
}

export interface FixturesResponse {
  events: Event[];
}

export interface FullEventData {
  event: Event | null;
  odds: Odds;
  lineups: Lineups | null;
}

export interface PartialEventDetails {
  lineups: Lineups | null;
  odds: Odds;
}

export interface BulkOddsResponse {
  odds: { [eventId: string]: Market };
  [key: string]: any;
}
