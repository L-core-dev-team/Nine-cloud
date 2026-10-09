export type ReviewBytePins = Readonly<{
  bundleMatches: boolean | null;
  pluginSourceMatches: boolean | null;
}>;

export type ReviewSemanticGateResult =
  | { readonly status: 'semantic_mismatch'; readonly error: string }
  | {
    readonly status: 'approved';
    readonly diagnostic: 'P1_REVIEW_RULE_BYTE_PINS_MATCH';
  }
  | {
    readonly status: 'approved_with_byte_drift';
    readonly diagnostic: 'P1_REVIEW_RULE_BYTE_DRIFT_SEMANTICS_MATCH';
  }
  | {
    readonly status: 'approved_byte_diagnostic_unavailable';
    readonly diagnostic: 'P1_REVIEW_RULE_BYTE_DIAGNOSTIC_UNAVAILABLE_SEMANTICS_MATCH';
  };

/** Byte pins describe history; only a semantic mismatch blocks this review-only candidate. */
export function evaluateP1ReviewSemanticGate(
  expectedSemanticDigest: string,
  actualSemanticDigest: string,
  bytePins: ReviewBytePins,
): ReviewSemanticGateResult {
  if (actualSemanticDigest !== expectedSemanticDigest) {
    return {
      status: 'semantic_mismatch',
      error: `P1_REVIEW_RULE_SEMANTIC_MISMATCH expected=${expectedSemanticDigest} actual=${actualSemanticDigest}`,
    };
  }
  if (bytePins.bundleMatches === null || bytePins.pluginSourceMatches === null) {
    return { status: 'approved_byte_diagnostic_unavailable', diagnostic: 'P1_REVIEW_RULE_BYTE_DIAGNOSTIC_UNAVAILABLE_SEMANTICS_MATCH' };
  }
  if (bytePins.bundleMatches && bytePins.pluginSourceMatches) {
    return { status: 'approved', diagnostic: 'P1_REVIEW_RULE_BYTE_PINS_MATCH' };
  }
  return { status: 'approved_with_byte_drift', diagnostic: 'P1_REVIEW_RULE_BYTE_DRIFT_SEMANTICS_MATCH' };
}
