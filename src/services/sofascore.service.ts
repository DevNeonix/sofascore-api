import axios from 'axios';
import { fractionToDecimal } from '../utils/odds.utils.js';
import type {
  FixturesResponse,
  LeaguesData,
  Lineups,
  Event,
  Odds,
  BulkOddsResponse,
  Market,
  Category,
  UniqueTournament,
  SofascorePlayerResponse,
  Player,
  TeamStreaks,
  GoalDistributionResponse,
  EventGoalDistributions,
  StandingsResponse,
  StatisticsResponse,
  FullEventData
} from '../types/index.js';

const SOFASCORE_API_URL = 'https://api.sofascore.com/api/v1';

export class SofascoreService {
  private static headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Origin': 'https://www.sofascore.com',
    'Referer': 'https://www.sofascore.com/',
  };

  private static transformOddsMarkets(markets: any[]): Market[] {
    if (!markets) return [];
    return markets.map(market => ({
      ...market,
      choices: (market.choices || []).map((choice: any) => ({
        ...choice,
        decimalValue: fractionToDecimal(choice.fractionalValue, choice.value)
      }))
    }));
  }

  static async getFixtures(sport: string, date: string, country?: string): Promise<FixturesResponse> {
    const sportMap: { [key: string]: string } = {
      'football': 'football',
      'basket': 'basketball',
      'tenis': 'tennis'
    };
    const ssSport = sportMap[sport.toLowerCase()] || sport.toLowerCase();

    if (country && country.toUpperCase() !== 'ALL') {
      console.log(`[SERVICE] Fetching country-specific fixtures for sport: ${sport}, date: ${date}, country config: ${country}`);
      try {
        // 1. Get unique tournaments for the country
        const leaguesData: LeaguesData = await this.getLeagues(country, ssSport);
        const uniqueTournaments = leaguesData.uniqueTournaments || [];

        console.log(`[SERVICE] Found ${uniqueTournaments.length} unique tournaments in ${country}. Fetching events...`);

        const promises = uniqueTournaments.map(async (tournament: UniqueTournament) => {
          try {
            const response = await axios.get(`${SOFASCORE_API_URL}/unique-tournament/${tournament.id}/scheduled-events/${date}`, {
              headers: this.headers
            });
            return response.data.events || [];
          } catch (err: any) {
            if (err.response && err.response.status === 404) return [];
            console.warn(`[SERVICE] Warning: Could not fetch events for tournament ${tournament.id}: ${err.message}`);
            return [];
          }
        });

        const resultsArray = await Promise.all(promises);
        const allEvents: Event[] = [];
        resultsArray.forEach(events => allEvents.push(...events));
        return { events: allEvents };
      } catch (error: any) {
        console.error(`[SERVICE] Error: Could not fetch country-specific fixtures: ${error.message}`);
        throw new Error(`Could not fetch fixtures: ${error.message}`);
      }
    }

    // GLOBAL FETCH: Use the sport-wide scheduled-events endpoint for maximum efficiency
    console.log(`[SERVICE] Fetching GLOBAL fixtures for sport: ${sport}, date: ${date}`);
    try {
      const response = await axios.get(`${SOFASCORE_API_URL}/sport/${ssSport}/scheduled-events/${date}`, {
        headers: this.headers
      });

      const allEvents: Event[] = response.data.events || [];
      console.log(`[SERVICE] Success: Fetched total ${allEvents.length} events globally for ${sport} on ${date}`);
      return { events: allEvents };
    } catch (error: any) {
      console.error(`[SERVICE] Error: Could not fetch global fixtures for ${sport} on ${date}. Reason: ${error.message}`);
      throw new Error(`Could not fetch global fixtures: ${error.message}`);
    }
  }

  static async getLeagues(country: string, sport: string): Promise<LeaguesData> {
    console.log(`[SERVICE] Fetching leagues for country: ${country}, sport: ${sport}`);
    try {
      const sportMap: { [key: string]: string } = {
        'football': 'football',
        'basket': 'basketball',
        'tenis': 'tennis'
      };

      const ssSport = sportMap[sport.toLowerCase()] || sport.toLowerCase();
      const code = country.toUpperCase();
      
      const response = await axios.get(`${SOFASCORE_API_URL}/config/default-unique-tournaments/${code}/${ssSport}`, {
        headers: this.headers
      });

      console.log(`[SERVICE] Success: Fetched leagues for ${country} / ${sport}`);
      return response.data;
    } catch (error: any) {
      console.error(`[SERVICE] Error: Could not fetch leagues for ${country} / ${sport}. Reason: ${error.message}`);
      throw new Error(`Could not fetch leagues: ${error.message}`);
    }
  }

  private static flattenPlayer(playerObj: SofascorePlayerResponse | (Player & { player?: never })): Player {
    if (!playerObj || !('player' in playerObj)) return playerObj as Player;
    const { player, ...rest } = playerObj;
    return { ...player, ...rest } as Player;
  }

  private static transformLineups(lineups: any): Lineups {
    if (!lineups) return lineups;
    const sides: (keyof Lineups)[] = ['home', 'away'];
    const transformed = { ...lineups };

    sides.forEach(side => {
      if (transformed[side]) {
        // Flatten all players first
        const allPlayers = (transformed[side].players || []).map(this.flattenPlayer);
        const subsArray = (transformed[side].substitutes || []).map(this.flattenPlayer);

        // If substitutes array is empty, it might be because they are mixed in allPlayers
        // In football they often use 'substitute: true'
        // In basketball they often use 'starter: true'
        if (subsArray.length === 0 && allPlayers.length > 0) {
          const hasStarterInfo = allPlayers.some((p: any) => p.starter !== undefined);
          const hasSubstituteInfo = allPlayers.some((p: any) => p.substitute !== undefined);

          if (hasStarterInfo) {
            transformed[side].players = allPlayers.filter((p: any) => p.starter);
            transformed[side].substitutes = allPlayers.filter((p: any) => !p.starter);
          } else if (hasSubstituteInfo) {
            transformed[side].players = allPlayers.filter((p: any) => !p.substitute);
            transformed[side].substitutes = allPlayers.filter((p: any) => p.substitute);
          } else {
            // Fallback: everyone is a player (probably just a list)
            transformed[side].players = allPlayers;
            transformed[side].substitutes = [];
          }
        } else {
          transformed[side].players = allPlayers;
          transformed[side].substitutes = subsArray;
        }

        transformed[side].missingPlayers = (transformed[side].missingPlayers || []).map(this.flattenPlayer);
      }
    });

    return transformed as Lineups;
  }

  static async getLineups(eventId: string): Promise<Lineups> {
    console.log(`[SERVICE] Fetching lineups for eventId: ${eventId}`);
    try {
      const response = await axios.get(`${SOFASCORE_API_URL}/event/${eventId}/lineups`, {
        headers: this.headers
      });
      console.log(`[SERVICE] Success: Fetched and flattened lineups for eventId: ${eventId}`);
      return this.transformLineups(response.data);
    } catch (error: any) {
      console.error(`[SERVICE] Error: Could not fetch lineups for event ${eventId}. Reason: ${error.message}`);
      throw new Error(`Could not fetch lineups: ${error.message}`);
    }
  }

  static async getEvent(eventId: string): Promise<Event | null> {
    console.log(`[SERVICE] Fetching general info for eventId: ${eventId}`);
    try {
      const response = await axios.get(`${SOFASCORE_API_URL}/event/${eventId}`, {
        headers: this.headers
      });
      console.log(`[SERVICE] Success: Fetched general info for eventId: ${eventId}`);
      return response.data.event || response.data;
    } catch (error: any) {
      console.error(`[SERVICE] Error: Could not fetch event info for ${eventId}. Reason: ${error.message}`);
      return null;
    }
  }

  static async getOdds(eventId: string): Promise<Odds> {
    console.log(`[SERVICE] Fetching odds for eventId: ${eventId}`);
    try {
      const response = await axios.get(`${SOFASCORE_API_URL}/event/${eventId}/odds/1/all`, {
        headers: this.headers
      });
      
      const transformedMarkets = this.transformOddsMarkets(response.data.markets);
      console.log(`[SERVICE] Success: Fetched and transformed odds for eventId: ${eventId}`);
      return { ...response.data, markets: transformedMarkets };
    } catch (error: any) {
      if (error.response && error.response.status === 404) {
        console.log(`[SERVICE] Info: No odds available (404) for eventId: ${eventId}`);
        return { markets: [] };
      }
      console.error(`[SERVICE] Error: Could not fetch odds for event ${eventId}. Reason: ${error.message}`);
      return { markets: [] };
    }
  }

  static async getGoalDistributions(teamId: number, tournamentId: number, seasonId: number): Promise<GoalDistributionResponse> {
    console.log(`[SERVICE] Fetching goal distributions for team ${teamId}, tournament ${tournamentId}, season ${seasonId}`);
    try {
      const response = await axios.get(
        `${SOFASCORE_API_URL}/team/${teamId}/unique-tournament/${tournamentId}/season/${seasonId}/goal-distributions`,
        { headers: this.headers }
      );
      console.log(`[SERVICE] Success: Fetched goal distributions for team ${teamId}`);
      return response.data;
    } catch (error: any) {
      console.error(`[SERVICE] Error: Could not fetch goal distributions for team ${teamId}. Reason: ${error.message}`);
      throw new Error(`Could not fetch goal distributions: ${error.message}`);
    }
  }

  static async getEventGoalDistributions(eventId: string): Promise<EventGoalDistributions> {
    console.log(`[SERVICE] Fetching goal distributions for eventId: ${eventId}`);
    const event = await this.getEvent(eventId);
    if (!event) throw new Error(`Event ${eventId} not found`);

    const tournamentId = event.tournament?.uniqueTournament?.id as number;
    const seasonId = event.season?.id as number;
    const homeTeamId = event.homeTeam?.id as number;
    const awayTeamId = event.awayTeam?.id as number;

    if (!tournamentId || !seasonId) throw new Error('Missing tournament or season data in event');

    const [home, away] = await Promise.all([
      this.getGoalDistributions(homeTeamId, tournamentId, seasonId),
      this.getGoalDistributions(awayTeamId, tournamentId, seasonId)
    ]);

    return { home, away };
  }

  static async getStandings(tournamentId: number, seasonId: number): Promise<StandingsResponse> {
    console.log(`[SERVICE] Fetching standings for tournament ${tournamentId}, season ${seasonId}`);
    try {
      const response = await axios.get(
        `${SOFASCORE_API_URL}/tournament/${tournamentId}/season/${seasonId}/standings/total`,
        { headers: this.headers }
      );
      console.log(`[SERVICE] Success: Fetched standings for tournament ${tournamentId}`);
      return response.data;
    } catch (error: any) {
      console.error(`[SERVICE] Error: Could not fetch standings. Reason: ${error.message}`);
      throw new Error(`Could not fetch standings: ${error.message}`);
    }
  }

  static async getEventStandings(eventId: string): Promise<StandingsResponse> {
    const event = await this.getEvent(eventId);
    if (!event) throw new Error(`Event ${eventId} not found`);

    const tournamentId = event.tournament?.id as number;
    const seasonId = event.season?.id as number;

    if (!tournamentId || !seasonId) throw new Error('Missing tournament or season data in event');

    return this.getStandings(tournamentId, seasonId);
  }

  static async getStatistics(eventId: string): Promise<StatisticsResponse> {
    console.log(`[SERVICE] Fetching statistics for eventId: ${eventId}`);
    try {
      const response = await axios.get(`${SOFASCORE_API_URL}/event/${eventId}/statistics`, {
        headers: this.headers
      });
      console.log(`[SERVICE] Success: Fetched statistics for eventId: ${eventId}`);
      return response.data;
    } catch (error: any) {
      console.error(`[SERVICE] Error: Could not fetch statistics for event ${eventId}. Reason: ${error.message}`);
      throw new Error(`Could not fetch statistics: ${error.message}`);
    }
  }

  static async getTeamStreaks(eventId: string): Promise<TeamStreaks> {
    console.log(`[SERVICE] Fetching team streaks for eventId: ${eventId}`);
    try {
      const response = await axios.get(`${SOFASCORE_API_URL}/event/${eventId}/team-streaks`, {
        headers: this.headers
      });
      console.log(`[SERVICE] Success: Fetched team streaks for eventId: ${eventId}`);
      return response.data;
    } catch (error: any) {
      console.error(`[SERVICE] Error: Could not fetch team streaks for event ${eventId}. Reason: ${error.message}`);
      throw new Error(`Could not fetch team streaks: ${error.message}`);
    }
  }

  static async getBulkOdds(sport: string, date: string): Promise<BulkOddsResponse> {
    console.log(`[SERVICE] Fetching bulk odds for sport: ${sport}, date: ${date}`);
    try {
      const sportMap: { [key: string]: string } = {
        'football': 'football',
        'basket': 'basketball',
        'tenis': 'tennis'
      };
      const ssSport = sportMap[sport.toLowerCase()] || sport.toLowerCase();

      const response = await axios.get(`${SOFASCORE_API_URL}/sport/${ssSport}/odds/1/${date}`, {
        headers: this.headers
      });

      // Transform bulk odds object
      const allOdds = response.data.odds || {};
      const transformedBulkOdds: { [key: string]: Market } = {};

      for (const eventId in allOdds) {
        const market = allOdds[eventId];
        if (market && typeof market === 'object') {
          transformedBulkOdds[eventId] = {
            ...market,
            choices: (market.choices || []).map((choice: any) => ({
              ...choice,
              decimalValue: fractionToDecimal(choice.fractionalValue, choice.value)
            }))
          };
        }
      }

      console.log(`[SERVICE] Success: Fetched and transformed bulk odds for ${sport} on ${date}`);
      return { ...response.data, odds: transformedBulkOdds };
    } catch (error: any) {
      console.error(`[SERVICE] Error: Could not fetch bulk odds. Reason: ${error.message}`);
      return { odds: {} };
    }
  }

  static async getFullEventData(eventId: string): Promise<FullEventData> {
    console.log(`[SERVICE] Fetching full event data for eventId: ${eventId}`);
    const [event, odds, lineups, teamStreaks, goalDistributions, standings, statistics] = await Promise.all([
      this.getEvent(eventId),
      this.getOdds(eventId),
      this.getLineups(eventId).catch(() => null),
      this.getTeamStreaks(eventId).catch(() => null),
      this.getEventGoalDistributions(eventId).catch(() => null),
      this.getEventStandings(eventId).catch(() => null),
      this.getStatistics(eventId).catch(() => null)
    ]);
    console.log(`[SERVICE] Success: Fetched full event data for eventId: ${eventId}`);
    return { event, odds, lineups, teamStreaks, goalDistributions, standings, statistics };
  }
}


