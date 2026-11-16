# HoldPI configurable protocol

This is a reusable OpenFour preset. PI is the default example, not a fixed identity requirement. Each token receives a separate policy during initialization. There are no policy setters in these contracts. Registry or token upgrades controlled by OpenFour remain an external trust boundary.

The builder exports `configuration.json` at the archive root. It contains the human settings, exact integer policy and derived bonding parameters. The source archive downloaded directly from the site has `configuration.example.json` instead. No private keys, RPC credentials or production deployment addresses are included.

## Implemented configuration

| Field | Contract representation | Bound |
| --- | --- | --- |
| Buy tax | `buyBps` | 0 to 1,000 bps |
| Sell decay | `sellBps[0..30]` | Non-increasing, 0 to 1,000 bps |
| Holding weights | `weightBps[0..30]` | Non-decreasing, day 0 = 0, mature weight 1x to 5x |
| Settlement interval | `roundSeconds` | 60 to 86,400 seconds |
| Minimum funded round | `minFunding` | 0 to 1,000,000 BNB, in wei |
| Treasury | `splitBps[holders,burn,liquidity,operations]` | Sum exactly 10,000 bps |
| Name and symbol | Token init fields | Name 1 to 64 UTF-8 bytes; symbol 1 to 12 |
| Supply | Token init field | Positive, at most 10^30 token base units |

Tax inputs are converted to basis points. Sell curves and reward curves are baked into daily integer tables. Array index 30 applies forever after maturity. Days are conservative completed cohort days, not the token's launch age:

`age = max(0, floor(now / 86400) - ceil(acquisition / 86400))`

A day checkpoint arrives after the stated number of full days and less than one additional day. New top-ups get a fresh cohort. Exits consume newest acquisitions first. A wallet transfer is an exit, pays its current tax and gives the recipient fresh-age tokens. Self-transfers and zero transfers do not change age. This prevents simple acquisition-age laundering, but cannot identify beneficial ownership within a custodial pool.

BNB rewards are held and accounted for in WBNB. A holder may claim native BNB or WBNB. If the native recipient rejects BNB, the claim falls back to WBNB. Settlement is permissionless, requires a positive funded pot, the minimum threshold, elapsed interval and eligible weight. Keepers must submit transactions; time itself never executes a payout.

Each settlement divides the finite funded amount by current eligible weighted balances. Fees pending before settlement are shared with whoever is eligible at settlement, not streamed retroactively second by second. New acquisitions cannot claim already-settled indices. No volume means no new fees. Zero holder allocation means no new holder rewards. Unspent buyback/LP budgets accumulate before graduation. Trading fees are not guaranteed to grow demand or price.

## Contract composition

- `HoldConfig`: shared ABI tuple and bounds.
- `HoldToken`: arbitrary name/symbol, per-token immutable policy, canonical pool and acquisition accounting.
- `HoldRewards`: bounded daily cohorts, configurable sell/weight arrays, funded BNB claims.
- `HoldTreasury`: four separately accounted budgets; inherited PI review oracle/size/slippage constraints for post-graduation processing.
- `HoldTokenModule`: creates a token and exposes the precise OpenFour encoding schema.
- `HoldTradeModule`: reads each token's buy and acquisition-weighted sell rate; ordinary trade denials return `allowed=false`.
- `HoldPresetValidator`: binds approved components, validates configuration and graduation inventory.
- `HoldVault`, `HoldCurveModule`, `HoldMigrateModule`: settlement, constant-product sale and PancakeSwap V2 migration modules derived from the PI baseline, with explicit schemas and unique registry tags.

The builder chooses 80% sale allocation, 20% liquidity reserve, virtual token reserve equal to supply and virtual BNB reserve equal to one quarter of the raise target. This satisfies the validator's terminal inventory calculation. Maximum supply is bounded below the V2 reserve limit. Different sale models require a different compatible preset.

Treasury allocations use cumulative, separately floored integer proportions. The sum never exceeds receipts; less than four wei can remain unallocated as rounding dust. Mature rewards preserve all previously earned claims. No per-holder iteration, swaps inside ordinary token transfers, arbitrary withdrawal or changeable router is introduced.

## Compile and verify locally

From the unpacked archive:

```sh
cd contracts
npm ci
npm run compile
PI_FORK_URL=YOUR_BNB_RPC PI_FORK_BLOCK=YOUR_ARCHIVE_BLOCK npx hardhat test test/protocol.test.cjs
```

Use an archive-capable RPC for an old block. Public nodes may prune state quickly. `verification.json` records the exact tests and fork block used for this release. These tests use actual WBNB and PancakeSwap V2 on a local fork with the explicitly labelled `CoreHarness` settlement adapter. They do not certify official OpenFour Core integration, admission, production registration, keeper operation or independent security audit.

`compiler-input.json` contains all compilation sources, including vendored OpenZeppelin. Contract artifacts and ABIs are included. Solidity 0.8.24, optimizer 200 runs, viaIR, EVM Paris.

## Protocol registration and token creation

Source reference: [OpenFour developer docs](https://github.com/four-meme-community/openfour-docs/tree/8ca5554df22ad511126d8547c212fa161ecf19ee/developer). Registration instructions and lifecycle were checked against this revision. Production registration belongs to OpenFour after review. This package is not an approved preset.

1. Build an isolated developer-owned fork using OpenFour's fork-deploy tooling. Do not register into the shared testnet or production Registry.
2. On a loopback chain with chainId 31337, provide a JSON with that fork's `core`, `registry` and a compatible PancakeSwap V2 `router`. Register the compiled protocol with an unused preset ID:

```sh
RPC_URL=http://127.0.0.1:8545 node contracts/protocol/register-local.cjs fork-bindings.json 6001 local-deployment.json
```

This developer-operated helper deploys implementations and registers them only when the local unlocked signer owns that Registry. It refuses remote RPC hosts and public chain IDs. It is supplied for integration work; execution against official Core remains an outstanding integration check.

3. For production, obtain the registered preset ID and verified component addresses from OpenFour. Fill `contracts/protocol/bindings.example.json`. Do not use the upstream testnet addresses as mainnet addresses. Retain the official caller, unique request ID, expiry and creation fee.
4. Prepare and verify the launch. This command reads on-chain schemas, the active preset, trusted implementations, validator, quote asset and authorized signer. It writes a creation payload without a private key or transaction:

```sh
RPC_URL=YOUR_RPC node contracts/protocol/prepare-create.cjs configuration.json bindings.json prepared-create.json
```

Module parameters are encoded as one tuple in schema order. The outer `createArgs` follows the documented Core tuple. Request `signMessageBytes` from the platform's `Core.signer()` creation service. An ordinary user wallet cannot replace that authorized signature. The public docs do not provide a production co-signing endpoint, so none is invented here.

5. Add the returned signature and the exact retained `validTimestamp` to `bindings.json`, rerun preparation, and require `simulation: passed`. The command calls `createToken.staticCall` with the caller and native value. It never broadcasts. The resulting transaction is ready for a separate wallet confirmation. This builder uses zero presale; native value therefore equals `createFee`. Other integrations must add presale quote when the quote is wrapped native.
6. After a creator-approved transaction, require a successful receipt and parse `TokenCreated` from the bound Core address. Verify the event's token against Core registry state, identity, supply, modules, quote and actual token policy hash. Do not label an address returned by a simulation as deployed.

The website deliberately keeps its production launch button unavailable until the preset registration and official signing flow are connected. Configuration, simulation math and source exports work independently of that external dependency.
