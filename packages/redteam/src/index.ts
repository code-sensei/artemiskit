/**
 * @artemiskit/redteam
 * Red-team testing module for Artemis Agent Reliability Toolkit
 */

// ==========================================
// Core Mutations & OWASP Mutations
// ==========================================
export * from './mutations';

// ==========================================
// Attack Configuration
// ==========================================
export {
  parseAttackConfig,
  loadAttackConfig,
  createMutationsFromConfig,
  getEnabledMutationNames,
  getConfigDefaults,
  filterMutationsBySeverity,
  applyOwaspFilters,
  generateExampleAttackConfig,
  AttackConfigSchema,
  type AttackConfig,
  type AttackConfigDefaults,
  type CreateMutationsOptions,
  type BadLikertJudgeConfig,
  type CrescendoConfig,
  type DeceptiveDelightConfig,
  type OutputInjectionConfig,
  type ExcessiveAgencyConfig,
  type SystemExtractionConfig,
  type HallucinationTrapConfig,
  type EncodingConfig,
  type MultiTurnConfig,
  type ToolAbuseConfig,
  type AgentConfusionConfig,
  type MemoryPoisoningConfig,
  type ChainManipulationConfig,
} from './attack-config';

// ==========================================
// Generator & Detector
// ==========================================
export { RedTeamGenerator, type GeneratedPrompt } from './generator';
export { UnsafeResponseDetector, type DetectionResult } from './detector';

// ==========================================
// Severity & CVSS Scoring
// ==========================================
export {
  SeverityMapper,
  CvssCalculator,
  MUTATION_CVSS_SCORES,
  DETECTION_CVSS_SCORES,
  type Severity,
  type SeverityInfo,
  type CvssScore,
} from './severity';

// ==========================================
// Custom Attacks
// ==========================================
export {
  CustomMutation,
  loadCustomAttacks,
  parseCustomAttacks,
  generateExampleCustomAttacksYaml,
  type CustomAttackDefinition,
  type CustomAttacksFile,
} from './custom-attacks';

// ==========================================
// OWASP Utilities
// ==========================================
export {
  OWASP_CATEGORIES,
  getMutationsForCategory,
  getAllOwaspMutationNames,
} from './mutations';
