/**
 * Strict helper for audit_log.original_decision_id.
 *
 * The field stores the integer audit_log.id of the source case that produced
 * a derived ban row. Older rows may carry the same integer in a decimal form
 * such as "5.0". Only an exact integer (optionally followed by ".0+") is
 * accepted; dirty strings, negative values, exponents, fractional values and
 * non-numeric identifiers must never be coerced into a case reference.
 */
export function normalizeCaseReference(value) {
	if (typeof value === 'number') {
		return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
	}
	if (typeof value !== 'string') return null;
	const match = /^([1-9]\d*)(?:\.0+)?$/.exec(value);
	if (!match) return null;
	return match[1];
}

export function isPenaltyLinkedToCase(banRow, caseId) {
	if (!banRow) return false;
	if (Number(banRow.id) === Number(caseId)) return true;
	const reference = banRow.originalDecisionId ?? banRow.original_decision_id;
	return normalizeCaseReference(reference) === String(caseId);
}

export default { normalizeCaseReference, isPenaltyLinkedToCase };
