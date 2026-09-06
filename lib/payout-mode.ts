// Flip this to true once your Paystack account is upgraded to a
// Registered Business with Transfers enabled (see chat history — Starter
// Business accounts can't use the Transfer API at all). Until then,
// approving a payout just marks it accepted; an admin still has to
// actually send the money by hand and then click "Mark as paid."
//
// This is the ONLY thing that needs to change to switch modes later —
// everything scribes see (the withdraw button, the once-a-month rule,
// balance tracking) stays identical either way.
export const PAYOUTS_AUTOMATED = false;
