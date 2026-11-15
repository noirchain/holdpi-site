# HoldPI: recovered website and BNB review implementation

This repository recovers the deployed holdpi.com frontend and its assets, preserves its visual system, and updates the economics for PI on BNB Chain. The technical documentation is at `/docs`. The original website was a static HTML/CSS/JavaScript application, so that stack is preserved.

The review implementation provides a 5% buy tax; a per-acquisition sell/transfer tax declining from 10% to 1%; and a funded BNB reward ledger. Actual project-tax receipts are allocated 70% to holders, 15% to buybacks/burns, 10% to liquidity and 5% to operations. Reward weights are normalized; there is no fixed yield or reward minting.

## Contents

- `website/`: recovered and updated frontend, brandbook, documentation, local fonts and original artwork.
- `assets/original-site/`: unchanged recovered deployed HTML, CSS, JavaScript and artwork, with a retrieval manifest.
- `contracts/src/`: Solidity 0.8.24 implementation and labelled local test harness.
- `contracts/vendor/`: pinned OpenFour interfaces/base contracts and source hashes.
- `contracts/test/`: real WBNB/PancakeSwap local-fork tests, plus accounting and adversarial cases.
- `tests/`: independent economic consistency checks for the frontend.
- `docs/`: integration notes, launch configuration template and keeper guidance.
- `outputs/contract-verification.json`: executed local-fork results and measured gas.
- `scripts/`: static preview server, reproducible frontend transformation and review packaging.

## Run the website

Use Node.js 20 or 22. No frontend package installation or build step is required.

```bash
node scripts/serve.mjs
```

The server binds to loopback on port 8188 for local development. The homepage retains the original visual password gate. That gate is client-side presentation, not secure access control. Private remote review uses the server's optional `PI_REVIEW_KEY_FILE` authentication gateway behind HTTPS. Keep that key outside the repository; never ship it in an archive. No production hosting or DNS was changed.

The original design's fonts are self-hosted with their font licenses. `styles.css`, `gate.css` and `brandbook.css` preserve the recovered original styling. `bnb.css` fixes a broken text glyph and unit wrapping. `docs.css` extends the same visual system for the new documentation page.

## Compile and test contracts

```bash
cd contracts
npm ci
npm run compile
PI_FORK_URL=https://bsc-rpc.publicnode.com \
PI_FORK_BLOCK=133771470 npm test
```

The pinned block requires an archive-capable BNB RPC. Set `PI_FORK_URL` to another authorized archive endpoint if the public endpoint no longer serves that block. Do not use a funded wallet: the test suite uses ephemeral Hardhat accounts on a local fork and never submits public transactions.

Solidity: 0.8.24; optimizer: 200; viaIR enabled. OpenZeppelin: 4.9.6. Exact npm dependencies are in `contracts/package-lock.json`. Source formatting is optional with `npm run format`.

From the repository root:

```bash
node --test tests/economics.test.cjs
python3 scripts/rebuild-site.py
python3 scripts/build-review.py
```

`rebuild-site.py` reproduces the homepage, brandbook content and shared visual script from the original archive. It does not overwrite the separately authored documentation page. `build-review.py` exports source, ABIs, hashes and a clean downloadable review archive. Compile and run the full fork suite before rebuilding that archive.

## Model details

The documentation defines conservative UTC-day cohorts, daily fee interpolation, newest-first consumption, transfer tax and recipient age reset, finite reward indices, actual-receipt budgets, price guards and graduation. The 1% floor becomes available after 30 to under 31 actual days. A top-up never inherits the older PI's rate. Claims remain earned after selling.

The maximum supply of 1 billion PI is retained from the recovered concept. The test fixture uses 800 million PI for sale, virtual reserves of 1 billion PI / 100 WBNB and 400 WBNB raised at full sale. These pricing parameters are not final launch approval. Graduation seeds 160 million PI / 400 WBNB in the no-donation fixture and sends unused launch inventory to the burn address.

## Verification boundary

The fork suite executes actual WBNB and PancakeSwap V2 bytecode, including fee conversion, buyback/burn and locked liquidity. `contracts/src/test/CoreHarness.sol` represents the documented OpenFour settlement flow; it is not the production Core and must not be deployed as such. The public OpenFour snapshot does not establish the complete production Core, FeeRouter and Registry behavior.

No public PI deployment, independent security audit or OpenFour admission is claimed. Before release, verify the real settlement caller/order, fee routing, module registry/beacons, migration phase sequence, supported user routes, quote precision and upgrade controls. Complete independent composed-contract and economic review. The documentation's integration section lists the exact remaining work.

## Source provenance and rights

The unchanged deployed frontend is retained as a recovery baseline for the site owner. Vendored OpenFour files are pinned to commit `8ca5554df22ad511126d8547c212fa161ecf19ee` and retain their upstream MIT notices. New Solidity files carry MIT SPDX notices. Font license files accompany the recovered font families. No wallet private keys, account credentials, preview keys or authentication databases belong in this repository.
