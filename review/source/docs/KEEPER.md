# Permissionless processing and keeper policy

The contracts expose separate processing calls. No holder loop or router execution is performed from an ordinary PI transfer. Keepers require no special contract role and receive no automatic gas refund.

1. During bonding, call `PiTreasury.sync()` to account for actual WBNB fees. After graduation, accumulate PI fee inventory and execute `convertTax(amount, deadline)` only within the on-chain price and batch guards.
2. `fundHolders(amount)` transfers only the available 70% holder budget into `PiRewards`. `distribute()` allocates pending funding to eligible balances no more often than every 900 seconds. If no balance qualifies, all funding waits.
3. Maintain two valid V2 cumulative-price observations at least 30 minutes apart. Restart after an observation older than two hours. `observe()` is permissionless.
4. After graduation, execute `buyback(amount, deadline)` and `addLiquidity(maxQuote, deadline)` from their separate budgets. Slippage/price failures leave those budgets available. No successful batch is required for an ordinary sale.
5. Estimate the gas of the actual intended calls at the current state. Multiply aggregate units by current gas price. Target processing cost no greater than 1% of the fee budget being processed, equivalent to 20% of its operations share. If the batch is too small or the oracle is unsuitable, defer it.
6. Operations withdrawals require the fixed operations account. That account may pay operating costs from its allocation. Spending after withdrawal is not constrained by the contracts.

A public keeper is not a clock guarantee. Monitor pending balances, observation age, successful allocation timestamps, gas estimates and actual receipts. A transaction submission or a running process does not prove allocation. Verify receipts and events. The review package does not include a funded executor or sign deployment/processing transactions.

User claims are separate: `claim(recipient, true)` attempts native BNB and falls back to WBNB; `claim(recipient, false)` requests WBNB directly. Credit amounts are never erased merely because a holder sold or a transfer reverted.
