/**
 * Branded wait state shown inside the checkout modal while the gateway state
 * loads. Reuses the Konkani Samudai loader from the YouPI portal.
 */
export default function SamudaiPayLoader() {
  return (
    <div className="konkani-pay-loader" role="status" aria-live="polite">
      <div className="konkani-pay-loader__mark" aria-hidden="true">KS</div>
      <div className="konkani-pay-loader__copy">
        <span>Powered by</span>
        <strong>Konkani Samudai</strong>
      </div>
      <div className="konkani-pay-loader__bar" aria-hidden="true"><i /></div>
    </div>
  );
}
