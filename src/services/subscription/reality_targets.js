/**
 * Elahe Panel - Reality SNI Targets
 * Comprehensive list of SNI targets for VLESS+Reality protocol
 * Inspired by Marzban/3x-ui community configurations
 * Developer: EHSANKiNG
 */

const REALITY_TARGETS = [
  // ═══════════ CDN & Cloud Infrastructure ═══════════
  { target: 'www.cloudflare.com:443', sni: 'www.cloudflare.com,cloudflare.com', category: 'cdn', risk: 'low' },
  { target: 'cdn.cloudflare.com:443', sni: 'cdn.cloudflare.com', category: 'cdn', risk: 'low' },
  { target: 'www.fastly.com:443', sni: 'www.fastly.com,fastly.com', category: 'cdn', risk: 'low' },
  { target: 'www.akamai.com:443', sni: 'www.akamai.com,akamai.com', category: 'cdn', risk: 'low' },
  { target: 'aws.amazon.com:443', sni: 'aws.amazon.com', category: 'cdn', risk: 'low' },
  { target: 'cloud.google.com:443', sni: 'cloud.google.com', category: 'cdn', risk: 'low' },
  { target: 'azure.microsoft.com:443', sni: 'azure.microsoft.com', category: 'cdn', risk: 'low' },
  { target: 'www.digitalocean.com:443', sni: 'www.digitalocean.com', category: 'cdn', risk: 'low' },

  // ═══════════ Social Media ═══════════
  { target: 'www.twitter.com:443', sni: 'www.twitter.com,twitter.com,x.com', category: 'social', risk: 'medium' },
  { target: 'www.instagram.com:443', sni: 'www.instagram.com,instagram.com', category: 'social', risk: 'medium' },
  { target: 'www.facebook.com:443', sni: 'www.facebook.com,facebook.com', category: 'social', risk: 'medium' },
  { target: 'www.linkedin.com:443', sni: 'www.linkedin.com,linkedin.com', category: 'social', risk: 'low' },
  { target: 'www.reddit.com:443', sni: 'www.reddit.com,reddit.com', category: 'social', risk: 'low' },
  { target: 'www.pinterest.com:443', sni: 'www.pinterest.com,pinterest.com', category: 'social', risk: 'low' },
  { target: 'www.tumblr.com:443', sni: 'www.tumblr.com,tumblr.com', category: 'social', risk: 'low' },

  // ═══════════ Video & Streaming ═══════════
  { target: 'www.youtube.com:443', sni: 'www.youtube.com,youtube.com,m.youtube.com', category: 'video', risk: 'low' },
  { target: 'www.netflix.com:443', sni: 'www.netflix.com,netflix.com', category: 'video', risk: 'low' },
  { target: 'www.twitch.tv:443', sni: 'www.twitch.tv,twitch.tv', category: 'video', risk: 'low' },
  { target: 'www.vimeo.com:443', sni: 'www.vimeo.com,vimeo.com', category: 'video', risk: 'low' },
  { target: 'www.dailymotion.com:443', sni: 'www.dailymotion.com,dailymotion.com', category: 'video', risk: 'low' },
  { target: 'www.hulu.com:443', sni: 'www.hulu.com,hulu.com', category: 'video', risk: 'low' },
  { target: 'www.disneyplus.com:443', sni: 'www.disneyplus.com,disneyplus.com', category: 'video', risk: 'low' },

  // ═══════════ News & Media ═══════════
  { target: 'www.bbc.com:443', sni: 'www.bbc.com,bbc.com', category: 'news', risk: 'low' },
  { target: 'www.cnn.com:443', sni: 'www.cnn.com,cnn.com', category: 'news', risk: 'low' },
  { target: 'www.reuters.com:443', sni: 'www.reuters.com,reuters.com', category: 'news', risk: 'low' },
  { target: 'www.nytimes.com:443', sni: 'www.nytimes.com,nytimes.com', category: 'news', risk: 'low' },
  { target: 'www.theguardian.com:443', sni: 'www.theguardian.com,theguardian.com', category: 'news', risk: 'low' },
  { target: 'www.washingtonpost.com:443', sni: 'www.washingtonpost.com', category: 'news', risk: 'low' },

  // ═══════════ E-commerce ═══════════
  { target: 'www.amazon.com:443', sni: 'www.amazon.com,amazon.com', category: 'ecommerce', risk: 'low' },
  { target: 'www.ebay.com:443', sni: 'www.ebay.com,ebay.com', category: 'ecommerce', risk: 'low' },
  { target: 'www.alibaba.com:443', sni: 'www.alibaba.com,alibaba.com', category: 'ecommerce', risk: 'low' },
  { target: 'www.etsy.com:443', sni: 'www.etsy.com,etsy.com', category: 'ecommerce', risk: 'low' },
  { target: 'www.shopify.com:443', sni: 'www.shopify.com,shopify.com', category: 'ecommerce', risk: 'low' },

  // ═══════════ Tech Companies ═══════════
  { target: 'www.google.com:443', sni: 'www.google.com,google.com', category: 'tech', risk: 'low' },
  { target: 'www.apple.com:443', sni: 'www.apple.com,apple.com', category: 'tech', risk: 'low' },
  { target: 'www.microsoft.com:443', sni: 'www.microsoft.com,microsoft.com', category: 'tech', risk: 'low' },
  { target: 'www.github.com:443', sni: 'www.github.com,github.com', category: 'tech', risk: 'low' },
  { target: 'www.gitlab.com:443', sni: 'www.gitlab.com,gitlab.com', category: 'tech', risk: 'low' },
  { target: 'www.mozilla.org:443', sni: 'www.mozilla.org,mozilla.org', category: 'tech', risk: 'low' },
  { target: 'www.docker.com:443', sni: 'www.docker.com,docker.com', category: 'tech', risk: 'low' },
  { target: 'www.npmjs.com:443', sni: 'www.npmjs.com,npmjs.com', category: 'tech', risk: 'low' },
  { target: 'www.stackoverflow.com:443', sni: 'www.stackoverflow.com,stackoverflow.com', category: 'tech', risk: 'low' },

  // ═══════════ Communication & Productivity ═══════════
  { target: 'www.slack.com:443', sni: 'www.slack.com,slack.com', category: 'comm', risk: 'low' },
  { target: 'www.zoom.us:443', sni: 'www.zoom.us,zoom.us', category: 'comm', risk: 'low' },
  { target: 'teams.microsoft.com:443', sni: 'teams.microsoft.com', category: 'comm', risk: 'low' },
  { target: 'discord.com:443', sni: 'discord.com,www.discord.com', category: 'comm', risk: 'low' },
  { target: 'www.notion.so:443', sni: 'www.notion.so,notion.so', category: 'comm', risk: 'low' },
  { target: 'www.trello.com:443', sni: 'www.trello.com,trello.com', category: 'comm', risk: 'low' },
  { target: 'www.atlassian.com:443', sni: 'www.atlassian.com,atlassian.com', category: 'comm', risk: 'low' },

  // ═══════════ Search & General ═══════════
  { target: 'www.wikipedia.org:443', sni: 'www.wikipedia.org,wikipedia.org', category: 'general', risk: 'low' },
  { target: 'www.bing.com:443', sni: 'www.bing.com,bing.com', category: 'general', risk: 'low' },
  { target: 'www.duckduckgo.com:443', sni: 'www.duckduckgo.com,duckduckgo.com', category: 'general', risk: 'low' },
  { target: 'www.yahoo.com:443', sni: 'www.yahoo.com,yahoo.com', category: 'general', risk: 'low' },
  { target: 'www.medium.com:443', sni: 'www.medium.com,medium.com', category: 'general', risk: 'low' },
  { target: 'www.quora.com:443', sni: 'www.quora.com,quora.com', category: 'general', risk: 'low' },

  // ═══════════ Gaming ═══════════
  { target: 'store.steampowered.com:443', sni: 'store.steampowered.com,steampowered.com', category: 'gaming', risk: 'low' },
  { target: 'www.epicgames.com:443', sni: 'www.epicgames.com,epicgames.com', category: 'gaming', risk: 'low' },
  { target: 'www.roblox.com:443', sni: 'www.roblox.com,roblox.com', category: 'gaming', risk: 'low' },
  { target: 'www.ea.com:443', sni: 'www.ea.com,ea.com', category: 'gaming', risk: 'low' },

  // ═══════════ AI & Research ═══════════
  { target: 'www.openai.com:443', sni: 'www.openai.com,openai.com,chat.openai.com', category: 'ai', risk: 'low' },
  { target: 'www.anthropic.com:443', sni: 'www.anthropic.com,anthropic.com', category: 'ai', risk: 'low' },
  { target: 'huggingface.co:443', sni: 'huggingface.co,www.huggingface.co', category: 'ai', risk: 'low' },
  { target: 'arxiv.org:443', sni: 'arxiv.org,www.arxiv.org', category: 'ai', risk: 'low' },
  { target: 'scholar.google.com:443', sni: 'scholar.google.com', category: 'ai', risk: 'low' },

  // ═══════════ Finance ═══════════
  { target: 'www.paypal.com:443', sni: 'www.paypal.com,paypal.com', category: 'finance', risk: 'low' },
  { target: 'www.stripe.com:443', sni: 'www.stripe.com,stripe.com', category: 'finance', risk: 'low' },
  { target: 'www.coinbase.com:443', sni: 'www.coinbase.com,coinbase.com', category: 'finance', risk: 'low' },

  // ═══════════ Education ═══════════
  { target: 'www.coursera.org:443', sni: 'www.coursera.org,coursera.org', category: 'education', risk: 'low' },
  { target: 'www.udemy.com:443', sni: 'www.udemy.com,udemy.com', category: 'education', risk: 'low' },
  { target: 'www.edx.org:443', sni: 'www.edx.org,edx.org', category: 'education', risk: 'low' },
  { target: 'www.khanacademy.org:443', sni: 'www.khanacademy.org,khanacademy.org', category: 'education', risk: 'low' },
];

/**
 * Get a random Reality target
 * @param {string} [category] - Optional category filter
 * @param {string} [risk] - Optional risk filter (low/medium)
 * @returns {Object} target and sni
 */
function getRandomRealityTarget(category, risk) {
  let targets = [...REALITY_TARGETS];
  
  if (category) {
    targets = targets.filter(t => t.category === category);
  }
  if (risk) {
    targets = targets.filter(t => t.risk === risk);
  }
  
  if (targets.length === 0) {
    targets = [...REALITY_TARGETS];
  }
  
  const selected = targets[Math.floor(Math.random() * targets.length)];
  return {
    target: selected.target,
    sni: selected.sni.split(',')[0], // Use primary SNI
    allSni: selected.sni,
    category: selected.category,
  };
}

/**
 * Get multiple unique targets for redundancy
 * @param {number} count - Number of targets to get
 * @param {string} [category] - Optional category filter
 * @returns {Array} array of targets
 */
function getMultipleTargets(count = 3, category) {
  let targets = [...REALITY_TARGETS];
  if (category) {
    targets = targets.filter(t => t.category === category);
  }
  
  // Shuffle
  for (let i = targets.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [targets[i], targets[j]] = [targets[j], targets[i]];
  }
  
  return targets.slice(0, count).map(t => ({
    target: t.target,
    sni: t.sni.split(',')[0],
    allSni: t.sni,
    category: t.category,
  }));
}

/**
 * Get targets grouped by category
 * @returns {Object} targets grouped by category
 */
function getTargetsByCategory() {
  const grouped = {};
  for (const target of REALITY_TARGETS) {
    if (!grouped[target.category]) {
      grouped[target.category] = [];
    }
    grouped[target.category].push({
      target: target.target,
      sni: target.sni,
      risk: target.risk,
    });
  }
  return grouped;
}

/**
 * Get all low-risk targets (safest for Iran)
 */
function getSafeTargets() {
  return REALITY_TARGETS.filter(t => t.risk === 'low').map(t => ({
    target: t.target,
    sni: t.sni.split(',')[0],
    allSni: t.sni,
    category: t.category,
  }));
}

module.exports = {
  REALITY_TARGETS,
  getRandomRealityTarget,
  getMultipleTargets,
  getTargetsByCategory,
  getSafeTargets,
};
