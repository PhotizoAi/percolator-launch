// Import necessary modules

// Assuming our main function and other necessary imports are above

// The modified functions with updated fee_credits logic

fn settle_maintenance_fee(...) {
    // ... other logic
    fee_credits = fee_credits.saturating_add(u128_to_i128_clamped(pay));
    // ... other logic
}

fn settle_maintenance_fee_best_effort_for_crank(...) {
    // ... other logic
    fee_credits = fee_credits.saturating_add(u128_to_i128_clamped(pay));
    // ... other logic
}

fn pay_fee_debt_from_capital(...) {
    // ... other logic
    fee_credits = fee_credits.saturating_add(u128_to_i128_clamped(pay));
    // ... other logic
}

fn deposit(...) {
    // ... other logic
    fee_credits = fee_credits.saturating_add(u128_to_i128_clamped(pay));
    // ... other logic
}
