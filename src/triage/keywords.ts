/**
 * Keyword patterns and rules for Middle East watch desk triage.
 */

export interface RulePattern {
  id: string;
  category: string;
  pattern: RegExp;
  tier: 'ALERT' | 'BATCH' | 'DROP';
  severity: '🟢' | '🟡' | '🟠' | '🔴';
  weight: number;
  description: string;
}

/**
 * P0 ALERT Rules: Critical breaking developments that NEVER batch and bypass queues immediately.
 */
export const ALERT_RULES: RulePattern[] = [
  {
    id: 'alert_strike',
    category: 'strike',
    pattern: /\b(?:air\s*strikes?|missile\s+strikes?|drone\s+strikes?|artillery\s+strikes?|bombings?|targeted\s+strikes?|struck\s+by|bombed|strike\s+reported)\b/i,
    tier: 'ALERT',
    severity: '🔴',
    weight: 1.0,
    description: 'Kinetic strike or bombing reported'
  },
  {
    id: 'alert_missile',
    category: 'missile',
    pattern: /\b(?:ballistic\s+missiles?|cruise\s+missiles?|missile\s+launch\w*|missile\s+impact\w*|missile\s+attacks?|hypersonic\s+missiles?|salvo\s+launch\w*)\b/i,
    tier: 'ALERT',
    severity: '🔴',
    weight: 1.0,
    description: 'Missile launch, impact, or attack'
  },
  {
    id: 'alert_drone_intercept',
    category: 'drone_intercept',
    pattern: /\b(?:(?:drone|shahed|uav)\w*.*(?:intercept\w*|shot\s+down|downed|hit|attack\w*)|(?:intercept\w*|shot\s+down).*(?:drone|shahed|uav)\w*)\b/i,
    tier: 'ALERT',
    severity: '🔴',
    weight: 0.95,
    description: 'Drone launch, attack, or air defense interception'
  },
  {
    id: 'alert_mobilization',
    category: 'mobilization',
    pattern: /\b(?:general\s+mobilization|reservists?\s+called\s+up|full\s+combat\s+readiness|defcon|emergency\s+mobilization|state\s+of\s+war)\b/i,
    tier: 'ALERT',
    severity: '🔴',
    weight: 0.95,
    description: 'Military mobilization or highest alert status'
  },
  {
    id: 'alert_force_movement',
    category: 'force_movement',
    pattern: /\b(?:carrier\s+strike\s+group|naval\s+flotilla|armored\s+convoy|brigade\s+deploy\w*|troop\s+surge|bombers?\s+scrambled|fighters?\s+(?:jets?\s+)?scrambled)\b/i,
    tier: 'ALERT',
    severity: '🟠',
    weight: 0.85,
    description: 'Major strategic military force movement or deployment'
  },
  {
    id: 'alert_gps_jamming',
    category: 'gps_jamming',
    pattern: /\b(?:gps\s+jamming\s+spike|gps\s+spoofing|widespread\s+gps\s+jamming|electronic\s+warfare\s+spike|navigation\s+jamming)\b/i,
    tier: 'ALERT',
    severity: '🟠',
    weight: 0.85,
    description: 'Electronic warfare or GPS jamming/spoofing spike'
  },
  {
    id: 'alert_adsb_dark',
    category: 'adsb_dark',
    pattern: /\b(?:ads-?b\s+dark\s+cluster|transponders?\s+(?:turned\s+)?off|squawk\s+7700|military\s+transponders?\s+off|dark\s+fleet)\b/i,
    tier: 'ALERT',
    severity: '🟠',
    weight: 0.85,
    description: 'Aviation/maritime ADS-B dark cluster or transponder blackout'
  },
  {
    id: 'alert_airspace_close',
    category: 'airspace_close',
    pattern: /\b(?:airspace\s+clos\w*|fir\s+clos\w*|flight\s+ban|notam\s+issued.*clos\w*|notam.*clos\w*|civil\s+aviation\s+halt|ground\s+stop)\b/i,
    tier: 'ALERT',
    severity: '🔴',
    weight: 0.95,
    description: 'Airspace closure, FIR shutdown, or ground stop'
  },
  {
    id: 'alert_kuwait_sirens',
    category: 'kuwait_sirens_ad',
    pattern: /\b(?:kuwait.*(?:air\s+defense|patriot|sirens?|interception|under\s+attack)|sirens?\s+(?:sounding|sounding\s+in|in)\s+kuwait)\b/i,
    tier: 'ALERT',
    severity: '🔴',
    weight: 1.0,
    description: 'Kuwait air defense activation, Patriot firing, or sirens sounding'
  },
  {
    id: 'alert_hormuz_tanker',
    category: 'hormuz_tanker',
    pattern: /\b(?:(?:hormuz|strait\s+of\s+hormuz).*(?:tanker|vessel|ship).*(?:board\w*|seiz\w*|hit|attack\w*|struck|sea\s+mine|limpet)|(?:tanker|vessel|ship).*(?:board\w*|seiz\w*|hit|attack\w*|struck|sea\s+mine|limpet).*(?:hormuz|strait\s+of\s+hormuz)|irgc.*(?:seiz\w*|board\w*).*(?:tanker|vessel|ship))\b/i,
    tier: 'ALERT',
    severity: '🔴',
    weight: 1.0,
    description: 'Strait of Hormuz tanker hit, boarding, or IRGC seizure'
  }
];

/**
 * P0 BATCH Rules: Significant non-immediate monitoring items grouped for cadence flush.
 */
export const BATCH_RULES: RulePattern[] = [
  {
    id: 'batch_diplomatic_warning',
    category: 'diplomatic_warning',
    pattern: /\b(?:foreign\s+ministry\s+warn\w*|travel\s+advisory\s+elevated|diplomats?\s+evacuat\w*|embassy\s+drawdown|ambassador\s+summoned)\b/i,
    tier: 'BATCH',
    severity: '🟡',
    weight: 0.7,
    description: 'Diplomatic warning, travel alert, or embassy drawdown'
  },
  {
    id: 'batch_military_exercise',
    category: 'military_exercise',
    pattern: /\b(?:military\s+drill|war\s+games|scheduled\s+exercise|live\s+fire\s+drill|joint\s+maneuvers)\b/i,
    tier: 'BATCH',
    severity: '🟡',
    weight: 0.6,
    description: 'Scheduled military exercise or routine drill'
  },
  {
    id: 'batch_official_statement',
    category: 'official_statement',
    pattern: /\b(?:official\s+statement|press\s+briefing|defense\s+spokesperson|foreign\s+minister\s+said|communique)\b/i,
    tier: 'BATCH',
    severity: '🟡',
    weight: 0.6,
    description: 'Official government or defense statement'
  },
  {
    id: 'batch_shipping_advisory',
    category: 'shipping_advisory',
    pattern: /\b(?:ukmto\s+advisory|maritime\s+security\s+notice|shipping\s+caution|ambrey\s+report|insurance\s+rate\s+hike)\b/i,
    tier: 'BATCH',
    severity: '🟡',
    weight: 0.65,
    description: 'Maritime advisory or routine security warning'
  },
  {
    id: 'batch_sanctions_policy',
    category: 'sanctions_policy',
    pattern: /\b(?:sanctions\s+announced|export\s+controls|asset\s+freeze|trade\s+embargo|oil\s+quota)\b/i,
    tier: 'BATCH',
    severity: '🟡',
    weight: 0.6,
    description: 'Economic sanctions, policy change, or trade update'
  }
];

/**
 * P0 DROP Rules: Low value chatter, pure rhetoric, historical essays, bot spam.
 */
export const DROP_RULES: RulePattern[] = [
  {
    id: 'drop_propaganda_cheerleading',
    category: 'propaganda_cheerleading',
    pattern: /\b(?:we\s+will\s+crush\s+them|death\s+to\s+\w+|cowards\s+will\s+pay|glory\s+to\s+the\s+resistance|long\s+live\s+the\s+regime|victory\s+is\s+near)\b/i,
    tier: 'DROP',
    severity: '🟢',
    weight: 0.8,
    description: 'Pure rhetorical cheerleading or slogan chanting with no new kinetic event'
  },
  {
    id: 'drop_spam_crypto',
    category: 'spam_crypto',
    pattern: /\b(?:crypto|bitcoin|btc|eth|airdrop|presale|giveaway|forex|100x|pump\s+and\s+dump|follow\s+for\s+follow|dm\s+for\s+promo)\b/i,
    tier: 'DROP',
    severity: '🟢',
    weight: 0.95,
    description: 'Commercial spam, crypto shilling, or social promotion'
  },
  {
    id: 'drop_historical_oped',
    category: 'historical_oped',
    pattern: /\b(?:in\s+my\s+opinion|thread\s+on\s+why|history\s+lesson|book\s+review|podcast\s+episode|check\s+out\s+my\s+substack|op-?ed)\b/i,
    tier: 'DROP',
    severity: '🟢',
    weight: 0.75,
    description: 'Historical commentary, personal opinion, podcast promotion, or Substack threads'
  },
  {
    id: 'drop_unrelated_lifestyle',
    category: 'unrelated_lifestyle',
    pattern: /\b(?:football\s+match|concert|weather\s+forecast|tourism\s+festival|shopping\s+mall\s+sale|recipe)\b/i,
    tier: 'DROP',
    severity: '🟢',
    weight: 0.9,
    description: 'Non-security lifestyle, sports, or entertainment chatter'
  }
];
