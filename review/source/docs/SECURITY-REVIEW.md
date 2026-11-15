# PI review scope and release gates

## What is implemented

The custom modules implement per-acquisition exit rates, newest-first lot consumption, fresh receipt age, fixed project tax rates, a bounded reward ledger, actual-receipt WBNB budgets, native/WBNB claims, permissionless treasury processing, terminal-price-aware graduation, and locked canonical LP. Rewards are normalized over funded assets. The same ledger survives graduation.

## What the tests establish

The executed report records each case and selected gas measurements. Tests use actual BNB-chain WBNB and PancakeSwap V2 bytecode at the stated fork block. They cover fresh purchase clocks long after launch; top-ups; transfer age; all daily rate checkpoints; mixed-age quotes; normalized rewards; empty eligibility; dormant accrual; BNB rejection; reentrancy; preservation of debt on failure; bucket isolation; real taxed DEX swaps; real conversion and burn; LP custody; oracle gating; price displacement; unsolicited quote donation; cohort limits; and randomized ledger invariants.

Tests are examples and invariants under a local model. They are not formal verification, a proof of worst-case gas or a substitute for independent review. Local fork outcomes do not prove production OpenFour integration.

## External integration boundary

The supplied public OpenFour repository contains interfaces and sample modules, not sufficient full production Core/Registry/FeeRouter source to certify their composed behavior here. `CoreHarness` is intentionally labelled local test infrastructure. In particular, the bonding token-fee exemption assumes the bound Core calls `transferFrom(trader, vault, amount)` while Trading, after obtaining the trader-specific quote. A forwarded caller, Permit2 collection leg or different quote/transfer ordering requires explicit reconciliation. Do not approve the preset based only on this harness.

Production admission must bind the intended token, vault, curve, trade, migrate and token-module implementations. Registry and beacon upgrade control remains a platform dependency even though this source has no fee setter. The validator's module-ID bindings must be established by the actual registry, not inferred from parameter bytes alone.

## Economic and execution review

- One-day cohort rounding may delay a threshold by less than a day. Expose exact timestamps in a future live wallet dashboard.
- Rewards belong to the eligible set at allocation time. Accumulated, unallocated revenue can be shared by later qualifying holders. Test capture strategies around delayed rounds.
- A large holder can recover part of their own fee via the holder pot. Taxes alone cannot establish persistent external demand or positive returns.
- Unknown pools, custody wrappers and centralized exchange beneficial ownership are not transparent to ERC-20 transfer hooks. The canonical pool is the guaranteed route. Personal LP actions have no special exemption.
- A 30-minute TWAP, 5% deviation/output bounds and 0.5% reserve batch cap reduce execution risk. Thin-pool manipulation and sandwich costs still require review.
- Pre-registered canonical PI prevents an initial PI seed before migration. An unsolicited WBNB donation can raise the opening price. Tests show migration does not become stuck in that donation case; they do not cover every adversarial market condition.
- LP is sent to the dead address. Buyback burns reduce totalSupply; unused launch inventory sent to the dead address remains in totalSupply. Indexers should distinguish the two.
- No generic asset rescue function exists. Unsupported assets or direct reward-ledger donations may remain inaccessible. Only treasury-received canonical WBNB is allocated into budgets.
- Processing gas policy is off-chain and paid by the caller. Operations has a fixed 5% budget, not unlimited reimbursement. Contract code cannot constrain how a recipient spends funds after withdrawal.

## Before any public deployment

Resolve independent composed-contract findings, reproduce integration tests against the real platform, confirm current cap and fees, validate migration return encoding and phase updates, approve final price/sale configuration and operations recipient, verify implementation bytecode and upgrade governance, test all supported UI/router paths, and publish the exact deployed addresses only after receipts are verified.

The provided source is concrete review material. No public deployment, funded execution, contact with the BNB team, official OpenFour submission or security certification has occurred.
