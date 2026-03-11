import { SofascoreService } from './services/sofascore.service.js';

export const SofascoreRepository = {
  /**
   * Obtiene todos los partidos (fixtures) para un deporte y fecha específicos.
   * Por defecto es global, pero se puede filtrar por país.
   */
  async getFixtures(sport: string, date: string, country?: string) {
    return SofascoreService.getFixtures(sport, date, country);
  },

  /**
   * Obtiene la información completa de un evento (Alineaciones, Odds, Info General)
   */
  async getEventFullData(sport: string, eventId: string) {
    const [event, odds, lineups] = await Promise.all([
      SofascoreService.getEvent(eventId),
      SofascoreService.getOdds(eventId),
      SofascoreService.getLineups(eventId)
    ]);

    return {
      event,
      odds,
      lineups
    };
  },

  /**
   * Obtiene alineaciones específicas
   */
  async getLineups(eventId: string) {
    return SofascoreService.getLineups(eventId);
  },

  /**
   * Obtiene cuotas (odds) específicas
   */
  async getOdds(eventId: string) {
    return SofascoreService.getOdds(eventId);
  },

  /**
   * Obtiene cuotas en bloque para todos los partidos de un deporte/fecha
   */
  async getBulkOdds(sport: string, date: string) {
    return SofascoreService.getBulkOdds(sport, date);
  },

  /**
   * Obtiene la lista de torneos/ligas configurados para un país
   */
  async getLeagues(country: string, sport: string) {
    return SofascoreService.getLeagues(country, sport);
  }
};

export { SofascoreService };
