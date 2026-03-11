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
  UniqueTournament
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

    // GLOBAL FETCH: Iterate through all categories to get ALL matches in the world
    console.log(`[SERVICE] Fetching GLOBAL fixtures for sport: ${sport}, date: ${date}`);
    try {
      // 1. Get all categories for this sport
      const categoriesResponse = await axios.get(`${SOFASCORE_API_URL}/sport/${ssSport}/categories`, {
        headers: this.headers
      });
      const categories: Category[] = categoriesResponse.data.categories || [];
      console.log(`[SERVICE] Found ${categories.length} categories globally. Fetching events per category...`);

      const allEvents: Event[] = [];
      const chunkSize = 20; // Chunk size to avoid being blocked
      for (let i = 0; i < categories.length; i += chunkSize) {
        const chunk = categories.slice(i, i + chunkSize);
        console.log(`[SERVICE] Fetching global fixtures: ${Math.min(i + chunkSize, categories.length)}/${categories.length} categories processed...`);
        
        const chunkPromises = chunk.map(async (category: Category) => {
          try {
            const response = await axios.get(`${SOFASCORE_API_URL}/category/${category.id}/scheduled-events/${date}`, {
              headers: this.headers
            });
            return response.data.events || [];
          } catch (err: any) {
            if (err.response && err.response.status === 404) return [];
            console.warn(`[SERVICE] Warning: Could not fetch events for category ${category.name} (${category.id}): ${err.message}`);
            return [];
          }
        });

        const results = await Promise.all(chunkPromises);
        results.forEach(events => allEvents.push(...events));
      }

      // Remove potential duplicates
      const uniqueEventsMap = new Map<number, Event>();
      allEvents.forEach((ev: Event) => {
        if (!uniqueEventsMap.has(ev.id)) {
          uniqueEventsMap.set(ev.id, ev);
        }
      });

      const uniqueEventsArr = Array.from(uniqueEventsMap.values());
      console.log(`[SERVICE] Success: Fetched total ${uniqueEventsArr.length} events across all categories globally for ${sport}`);
      return { events: uniqueEventsArr };
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

  private static flattenPlayer(playerObj: any) {
    if (!playerObj || !playerObj.player) return playerObj;
    const { player, ...rest } = playerObj;
    return { ...player, ...rest };
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
}


