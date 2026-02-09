/**
 * Elahe Panel - Content Blocking Service
 * BitTorrent, Porn, Gambling blocking capabilities
 * Developer: EHSANKiNG
 * Version: 0.0.4
 */

const { getDb } = require('../../database');
const { createLogger } = require('../../utils/logger');

const log = createLogger('ContentBlock');

// Default block rules for each category
const CATEGORY_RULES = {
  torrent: {
    description: 'Block BitTorrent traffic and tracker sites',
    geosites: ['category-torrent'],
    protocols: ['bittorrent'],
    domains: [
      'thepiratebay.org', 'rarbg.to', '1337x.to', 'nyaa.si', 'torrentz2.eu',
      'kickasstorrents.to', 'limetorrents.cc', 'torrentgalaxy.to', 'yts.mx',
    ],
  },
  porn: {
    description: 'Block adult/pornographic content',
    geosites: ['category-porn'],
    protocols: [],
    domains: [],
  },
  gambling: {
    description: 'Block gambling and betting sites',
    geosites: ['category-gambling'],
    protocols: [],
    domains: [
      'bet365.com', 'pokerstars.com', 'draftkings.com', 'fanduel.com',
      'williamhill.com', 'paddypower.com', 'betfair.com', 'bwin.com',
    ],
  },
  ads: {
    description: 'Block advertisements and trackers',
    geosites: ['category-ads-all', 'category-ads-ir'],
    protocols: [],
    domains: [],
  },
  malware: {
    description: 'Block malware, phishing, and cryptominers',
    geosites: ['malware', 'phishing', 'cryptominers'],
    protocols: [],
    domains: [],
  },
};

class ContentBlockService {
  /**
   * List all blocked categories with status
   */
  static listCategories() {
    const db = getDb();
    const dbCategories = db.prepare('SELECT * FROM blocked_categories ORDER BY id ASC').all();
    
    // Merge with default definitions
    const allCategories = ['torrent', 'porn', 'gambling', 'ads', 'malware', 'custom'];
    const result = [];

    for (const cat of allCategories) {
      const dbCat = dbCategories.find(c => c.category === cat);
      const defaultInfo = CATEGORY_RULES[cat] || { description: 'Custom blocking rules', geosites: [], protocols: [], domains: [] };
      
      result.push({
        id: dbCat?.id || null,
        category: cat,
        enabled: dbCat?.enabled || 0,
        description: dbCat?.description || defaultInfo.description,
        ruleCount: dbCat?.rule_count || 0,
        geosites: defaultInfo.geosites || [],
        domains: defaultInfo.domains || [],
        updatedAt: dbCat?.updated_at || null,
      });
    }

    return result;
  }

  /**
   * Toggle a category
   */
  static toggleCategory(category, enabled) {
    const db = getDb();
    const defaultInfo = CATEGORY_RULES[category] || {};
    
    db.prepare(`
      INSERT INTO blocked_categories (category, enabled, description, rule_count, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(category) DO UPDATE SET enabled = ?, updated_at = CURRENT_TIMESTAMP
    `).run(
      category,
      enabled ? 1 : 0,
      defaultInfo.description || 'Custom category',
      (defaultInfo.geosites?.length || 0) + (defaultInfo.domains?.length || 0),
      enabled ? 1 : 0
    );

    log.info(`Category ${category} ${enabled ? 'enabled' : 'disabled'}`);
    return { success: true };
  }

  /**
   * Generate Xray block rules
   */
  static generateXrayBlockRules() {
    const db = getDb();
    const enabledCategories = db.prepare('SELECT * FROM blocked_categories WHERE enabled = 1').all();
    const rules = [];

    for (const cat of enabledCategories) {
      const info = CATEGORY_RULES[cat.category];
      if (!info) continue;

      // GeoSite rules
      for (const gs of (info.geosites || [])) {
        rules.push({
          outboundTag: 'block',
          domain: [`geosite:${gs}`],
        });
      }

      // Domain rules
      if (info.domains && info.domains.length > 0) {
        rules.push({
          outboundTag: 'block',
          domain: info.domains.map(d => `domain:${d}`),
        });
      }

      // Protocol rules (e.g., BitTorrent)
      for (const proto of (info.protocols || [])) {
        rules.push({
          outboundTag: 'block',
          protocol: [proto],
        });
      }
    }

    return rules;
  }

  /**
   * Generate Sing-box block rules
   */
  static generateSingboxBlockRules() {
    const db = getDb();
    const enabledCategories = db.prepare('SELECT * FROM blocked_categories WHERE enabled = 1').all();
    const rules = [];

    for (const cat of enabledCategories) {
      const info = CATEGORY_RULES[cat.category];
      if (!info) continue;

      for (const gs of (info.geosites || [])) {
        rules.push({
          outbound: 'block',
          geosite: [gs],
        });
      }

      if (info.domains && info.domains.length > 0) {
        rules.push({
          outbound: 'block',
          domain: info.domains,
        });
      }

      for (const proto of (info.protocols || [])) {
        rules.push({
          outbound: 'block',
          protocol: proto,
        });
      }
    }

    return rules;
  }

  /**
   * Get stats for dashboard
   */
  static getStats() {
    const db = getDb();
    const total = db.prepare('SELECT COUNT(*) as c FROM blocked_categories').get().c;
    const enabled = db.prepare('SELECT COUNT(*) as c FROM blocked_categories WHERE enabled = 1').get().c;
    return { total, enabled };
  }
}

module.exports = ContentBlockService;
