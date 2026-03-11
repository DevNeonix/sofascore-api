import type { Request, Response } from 'express';
import { SofascoreService } from '../services/sofascore.service.js';

export class FixturesController {
  static async getFixtures(req: Request, res: Response) {
    const { sport, date } = req.params;
    console.log(`[CONTROLLER] Received request for fixtures: ${sport} - ${date}`);

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      console.warn(`[CONTROLLER] Warning: Invalid date format: ${date}`);
      return res.status(400).json({ error: 'Invalid date format. Expected YYYY-MM-DD' });
    }

    try {
      // Fetch fixtures and bulk odds in parallel on the backend
      const [fixturesData, oddsData] = await Promise.all([
        SofascoreService.getFixtures(sport, date),
        SofascoreService.getBulkOdds(sport, date)
      ]);

      const events = fixturesData.events || [];
      const allOdds = oddsData.odds || {};

      // Enrich events with their corresponding odds
      const enrichedEvents = events.map((event: any) => ({
        ...event,
        odds: allOdds[event.id] || null
      }));

      console.log(`[CONTROLLER] Successfully returning ${enrichedEvents.length} enriched fixtures for ${sport} - ${date}`);
      res.json({ events: enrichedEvents });
    } catch (error: any) {
      console.error(`[CONTROLLER] Error: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  }

  static async getLineups(req: Request, res: Response) {
    const { eventId } = req.params;
    console.log(`[CONTROLLER] Received request for lineups: eventId ${eventId}`);

    try {
      const lineups = await SofascoreService.getLineups(eventId);
      console.log(`[CONTROLLER] Successfully returning lineups for eventId ${eventId}`);
      res.json(lineups);
    } catch (error: any) {
      console.error(`[CONTROLLER] Error: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  }

  static async getOdds(req: Request, res: Response) {
    const { eventId } = req.params;
    console.log(`[CONTROLLER] Received request for odds: eventId ${eventId}`);

    try {
      const odds = await SofascoreService.getOdds(eventId);
      console.log(`[CONTROLLER] Successfully returning odds for eventId ${eventId}`);
      res.json(odds);
    } catch (error: any) {
      console.error(`[CONTROLLER] Error: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  }

  static async getEventDetails(req: Request, res: Response) {
    const { eventId } = req.params;
    console.log(`[CONTROLLER] Received request for full event details: eventId ${eventId}`);

    try {
      // Fetch everything in parallel on the backend
      const [lineups, odds] = await Promise.all([
        SofascoreService.getLineups(eventId),
        SofascoreService.getOdds(eventId)
      ]);

      console.log(`[CONTROLLER] Successfully returning unified details for eventId ${eventId}`);
      res.json({ lineups, odds });
    } catch (error: any) {
      console.error(`[CONTROLLER] Error fetching event details: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  }

  static async getFullEventData(req: Request, res: Response) {
    const { eventId } = req.params;
    console.log(`[CONTROLLER] Received request for ALL match data: eventId ${eventId}`);

    try {
      // Fetch General Info, All Odds, and Lineups in parallel
      const [generalInfo, odds, lineups] = await Promise.all([
        SofascoreService.getEvent(eventId),
        SofascoreService.getOdds(eventId),
        SofascoreService.getLineups(eventId).catch(() => ({ error: 'Lineups not available' }))
      ]);

      console.log(`[CONTROLLER] Successfully returning full data package for eventId ${eventId}`);
      res.json({
        event: generalInfo,
        odds: odds,
        lineups: lineups
      });
    } catch (error: any) {
      console.error(`[CONTROLLER] Error fetching full event data: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  }

  static async getBulkOdds(req: Request, res: Response) {
    const { sport, date } = req.params;
    console.log(`[CONTROLLER] Received request for bulk odds: ${sport} - ${date}`);

    try {
      const odds = await SofascoreService.getBulkOdds(sport, date);
      res.json(odds);
    } catch (error: any) {
      console.error(`[CONTROLLER] Error: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  }
}
