/**
 * @file Evaluate content models across all configured filter rules.
 */

const { Logger } = require('../observability/logger');

const { AiLabelRule } = require('./rules/ai-label-rule');
const { PhraseRule } = require('./rules/phrase-rule');
const { SuggestedFollowRule } = require('./rules/suggested-follow-rule');
const { TrendingRule } = require('./rules/trending-rule');
const { UsernameRule } = require('./rules/username-rule');
const { VerifiedRule } = require('./rules/verified-rule');

/**
 * Run rule pipeline and aggregate reasons into one final decision.
 */
class FilterRuleEngine {
  /**
   * Initialize rule list and logger dependency.
   *
   * @param {{
   *   rules?: Array<{ evaluate: Function }>,
   *   logger?: Logger
   * }} [options] - Engine options.
   */
  constructor(options = {}) {
    const { rules = null, logger = new Logger({ namespace: 'rule-engine', level: 'warn' }) } =
      options;
    this.logger = logger;
    this.rules =
      Array.isArray(rules) && rules.length > 0
        ? rules
        : [
            new UsernameRule(),
            new VerifiedRule(),
            new AiLabelRule(),
            new SuggestedFollowRule(),
            new TrendingRule(),
            new PhraseRule({ logger }),
          ];
  }

  /**
   * Evaluate one content model against all active rules with error isolation.
   *
   * @param {import('../core/content-model').ContentModel} contentModel - Canonical content model.
   * @param {object} settings - Normalized settings.
   * @returns {{
   *   blocked: boolean,
   *   reasons: string[],
   *   matches: Array<{ kind: string, mode: string, pattern: string }>
   * }}
   */
  evaluate(contentModel, settings) {
    if (!settings || !settings.filters || settings.filters.enabled === false) {
      return { blocked: false, reasons: [], matches: [] };
    }

    const reasons = [];
    const matches = [];
    for (const rule of this.rules) {
      try {
        const result = rule.evaluate(contentModel, settings);
        if (result && result.blocked && Array.isArray(result.reasons)) {
          reasons.push(...result.reasons);
        }
        if (result && Array.isArray(result.matches)) {
          matches.push(...result.matches);
        }
      } catch (error) {
        this.logger.error('Rule evaluation failed.', {
          rule: rule && rule.constructor ? rule.constructor.name : 'UnknownRule',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      blocked: reasons.length > 0,
      reasons,
      matches,
    };
  }
}

module.exports = {
  FilterRuleEngine,
};
