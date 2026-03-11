import axios from 'axios';
import { fractionToDecimal } from '../utils/odds.utils.js';

const SOFASCORE_API_URL = 'https://api.sofascore.com/api/v1';

export class SofascoreService {
  private static headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Origin': 'https://www.sofascore.com',
    'Referer': 'https://www.sofascore.com/',
  };

  private static transformOddsMarkets(markets: any[]) {
    if (!markets) return [];
    return markets.map(market => ({
      ...market,
      choices: (market.choices || []).map((choice: any) => ({
        ...choice,
        decimalValue: fractionToDecimal(choice.fractionalValue, choice.value)
      }))
    }));
  }

  static async getFixtures(sport: string, date: string) {
    console.log(`[SERVICE] Fetching fixtures for sport: ${sport}, date: ${date}`);
    try {
      // Map frontend sport names to Sofascore API sport names if necessary
      const sportMap: { [key: string]: string } = {
        'football': 'football',
        'basket': 'basketball',
        'tenis': 'tennis'
      };

      const ssSport = sportMap[sport.toLowerCase()] || sport.toLowerCase();
      
      const response = await axios.get(`${SOFASCORE_API_URL}/sport/${ssSport}/scheduled-events/${date}`, {
        headers: this.headers
      });

      console.log(`[SERVICE] Success: Fetched ${response.data.events?.length || 0} events for ${sport}`);
      return response.data;
    } catch (error: any) {
      console.error(`[SERVICE] Error: Could not fetch fixtures for ${sport} on ${date}. Reason: ${error.message}`);
      throw new Error(`Could not fetch fixtures: ${error.message}`);
    }
  }

  private static flattenPlayer(playerObj: any) {
    if (!playerObj || !playerObj.player) return playerObj;
    const { player, ...rest } = playerObj;
    return { ...player, ...rest };
  }

  private static transformLineups(lineups: any) {
    if (!lineups) return lineups;
    const sides = ['home', 'away'];
    const transformed = { ...lineups };

    sides.forEach(side => {
      if (transformed[side]) {
        // Flatten all players first
        const allPlayers = (transformed[side].players || []).map(this.flattenPlayer);
        const subsArray = (transformed[side].substitutes || []).map(this.flattenPlayer);

        // If substitutes array is empty, it might be because they are mixed in allPlayers with substitute: true
        if (subsArray.length === 0) {
          transformed[side].players = allPlayers.filter((p: any) => !p.substitute);
          transformed[side].substitutes = allPlayers.filter((p: any) => p.substitute);
        } else {
          transformed[side].players = allPlayers;
          transformed[side].substitutes = subsArray;
        }

        transformed[side].missingPlayers = (transformed[side].missingPlayers || []).map(this.flattenPlayer);
      }
    });

    return transformed;
  }

  static async getLineups(eventId: string) {
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

  static async getEvent(eventId: string) {
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

  static async getOdds(eventId: string) {
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

  static async getBulkOdds(sport: string, date: string) {
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
      const transformedBulkOdds: any = {};

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

