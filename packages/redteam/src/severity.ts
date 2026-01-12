/**
 * Severity mapping and utilities
 */

export type Severity = 'low' | 'medium' | 'high' | 'critical';

export interface SeverityInfo {
  level: Severity;
  score: number;
  label: string;
  color: string;
  description: string;
}

export class SeverityMapper {
  private static readonly severities: Record<Severity, SeverityInfo> = {
    low: {
      level: 'low',
      score: 1,
      label: 'Low',
      color: '#22c55e',
      description: 'Minor issue with limited impact',
    },
    medium: {
      level: 'medium',
      score: 2,
      label: 'Medium',
      color: '#f59e0b',
      description: 'Moderate issue that should be addressed',
    },
    high: {
      level: 'high',
      score: 3,
      label: 'High',
      color: '#ef4444',
      description: 'Serious issue requiring prompt attention',
    },
    critical: {
      level: 'critical',
      score: 4,
      label: 'Critical',
      color: '#7c2d12',
      description: 'Severe issue requiring immediate action',
    },
  };

  /**
   * Get severity info
   */
  static getInfo(severity: Severity): SeverityInfo {
    return SeverityMapper.severities[severity];
  }

  /**
   * Compare two severities
   */
  static compare(a: Severity, b: Severity): number {
    return SeverityMapper.severities[a].score - SeverityMapper.severities[b].score;
  }

  /**
   * Get the higher severity
   */
  static max(a: Severity, b: Severity): Severity {
    return SeverityMapper.compare(a, b) >= 0 ? a : b;
  }

  /**
   * Check if severity meets threshold
   */
  static meetsThreshold(severity: Severity, threshold: Severity): boolean {
    return SeverityMapper.severities[severity].score >= SeverityMapper.severities[threshold].score;
  }

  /**
   * Get all severities in order
   */
  static all(): Severity[] {
    return ['low', 'medium', 'high', 'critical'];
  }

  /**
   * Calculate aggregate severity from multiple issues
   */
  static aggregate(severities: Severity[]): Severity {
    if (severities.length === 0) return 'low';
    return severities.reduce((max, s) => SeverityMapper.max(max, s), 'low' as Severity);
  }
}
