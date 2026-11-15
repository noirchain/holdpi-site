const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const {
  loadFixture,
  time,
} = require("@nomicfoundation/hardhat-network-helpers");
const fs = require("node:fs"),
  path = require("node:path");
const {
  E,
  DAY,
  WBNB,
  ROUTER,
  DEAD,
  gas,
  deploy,
  base,
  buy,
  fund,
  graduated,
  oracle,
  dexBuy,
  dexSell,
} = require("./fixtures.cjs");

describe("PI BNB review contracts on a local mainnet fork", function () {
  it("keeps deployed bytecode within the EVM limit and binds the original supply", async () => {
    const c = await loadFixture(base);
    expect(await c.token.totalSupply()).to.equal(E("1000000000"));
    expect(await c.router.WETH()).to.equal(WBNB);
    expect(await c.token.balanceOf(await c.vault.getAddress())).to.equal(
      E("1000000000"),
    );
    for (const a of [...c.implementations, c.rewardsImpl, c.treasuryImpl])
      expect(
        ((await ethers.provider.getCode(await a.getAddress())).length - 2) / 2,
      ).to.be.lessThan(24576);
    await expect(
      c.token.setMigratedPool(c.carol.address, true),
    ).to.be.revertedWith("Token: only migrate");
  });
  it("charges 5 percent buys and 10 percent fresh exits on launch day, day 20 and day 365 without double tax", async () => {
    const c = await loadFixture(base),
      start = await time.latest();
    for (const d of [0, 20, 365]) {
      if (d) await time.increaseTo(start + d * DAY);
      const [q, tax] = await c.core.preview(
        await c.token.getAddress(),
        c.alice.address,
        E("100"),
        true,
      );
      expect(tax).to.equal((q * 5n) / 100n);
      await buy(c, c.alice, "100");
      expect(await c.token.exitFeeBps(c.alice.address, E("100"))).to.equal(
        1000,
      );
      const before = await c.token.balanceOf(await c.treasury.getAddress());
      await c.core.connect(c.alice).sell(await c.token.getAddress(), E("100"));
      expect(await c.token.balanceOf(c.alice.address)).to.equal(0);
      expect(await c.token.balanceOf(await c.treasury.getAddress())).to.equal(
        before,
      );
    }
  });
  it("keeps mature acquisitions on top-up and consumes fresh PI first", async () => {
    const c = await loadFixture(base);
    await buy(c, c.alice, "100");
    await time.increase(31 * DAY);
    expect(await c.token.exitFeeBps(c.alice.address, E("100"))).to.equal(100);
    await buy(c, c.alice, "100");
    expect(await c.token.exitFeeBps(c.alice.address, E("100"))).to.equal(1000);
    expect(await c.token.exitFeeBps(c.alice.address, E("150"))).to.equal(700);
    await c.core.connect(c.alice).sell(await c.token.getAddress(), E("100"));
    expect(await c.token.exitFeeBps(c.alice.address, E("100"))).to.equal(100);
  });
  it("taxes wallet moves, resets recipient age and preserves self/zero transfers", async () => {
    const c = await loadFixture(base);
    await buy(c, c.alice, "100");
    await time.increase(31 * DAY);
    await c.token.connect(c.alice).transfer(c.alice.address, E("100"));
    await c.token.connect(c.alice).transfer(c.bob.address, 0);
    expect(await c.token.exitFeeBps(c.alice.address, E("100"))).to.equal(100);
    await c.token.connect(c.alice).transfer(c.bob.address, E("50"));
    expect(await c.token.balanceOf(c.bob.address)).to.equal(E("49.5"));
    expect(await c.token.exitFeeBps(c.bob.address, E("49.5"))).to.equal(1000);
  });
  it("never grants a lower fee or eligibility early across midnight", async () => {
    const c = await loadFixture(base);
    const boundary = (Math.floor((await time.latest()) / DAY) + 1) * DAY;
    await time.setNextBlockTimestamp(boundary - 1);
    await buy(c, c.alice, "100");
    await time.increaseTo(boundary + DAY - 2);
    expect(await c.token.exitFeeBps(c.alice.address, E("100"))).to.equal(1000);
    expect(await c.rewards.totalWeight()).to.equal(0);
    await time.increaseTo(boundary + DAY);
    expect(await c.token.exitFeeBps(c.alice.address, E("100"))).to.equal(800);
  });
  it("divides a finite pot 2:1 between equal mature and newly qualified holdings", async () => {
    const c = await loadFixture(base);
    await buy(c, c.alice, "100");
    await time.increase(29 * DAY);
    await buy(c, c.bob, "100");
    await time.increase(2 * DAY);
    const amount = await fund(c, "3");
    await c.rewards.distribute();
    const a = await c.rewards.claimable(c.alice.address),
      b = await c.rewards.claimable(c.bob.address);
    expect(a + b).to.be.at.most(amount);
    expect(a - 2n * b).to.be.within(-2n, 2n);
  });
  it("normalizes mature weights and creates no liability from elapsed time", async () => {
    const c = await loadFixture(base);
    await buy(c, c.alice, "100");
    await buy(c, c.bob, "100");
    await time.increase(31 * DAY);
    const amount = await fund(c);
    await c.rewards.distribute();
    const a = await c.rewards.claimable(c.alice.address),
      b = await c.rewards.claimable(c.bob.address);
    expect(a).to.equal(b);
    expect(amount - a - b).to.be.at.most(2n);
    await time.increase(365 * DAY);
    expect(await c.rewards.claimable(c.alice.address)).to.equal(a);
  });
  it("reserves the entire empty-holder bucket and denies retrospective rewards to later acquisitions", async () => {
    const c = await loadFixture(base);
    const amount = await fund(c);
    await c.rewards.distribute();
    expect(await c.rewards.pending()).to.equal(amount);
    await buy(c, c.alice, "100");
    expect(await c.rewards.claimable(c.alice.address)).to.equal(0);
    await time.increase(2 * DAY);
    await c.rewards.distribute();
    expect(await c.rewards.claimable(c.alice.address)).to.be.closeTo(
      amount,
      1n,
    );
    await buy(c, c.bob, "100");
    await time.increase(31 * DAY);
    expect(await c.rewards.claimable(c.bob.address)).to.equal(0);
  });
  it("preserves earned BNB after exit and falls back to WBNB for rejecting recipients", async () => {
    const c = await loadFixture(base);
    await buy(c, c.alice, "100");
    await time.increase(31 * DAY);
    await fund(c);
    await c.rewards.distribute();
    const amount = await c.rewards.claimable(c.alice.address);
    await c.core.connect(c.alice).sell(await c.token.getAddress(), E("100"));
    expect(await c.rewards.claimable(c.alice.address)).to.equal(amount);
    const reject = await deploy("RejectBNB");
    await c.rewards.connect(c.alice).claim(await reject.getAddress(), true);
    expect(await c.quote.balanceOf(await reject.getAddress())).to.equal(amount);
  });
  it("blocks claim reentrancy and preserves unpaid debt when native withdrawal fails", async () => {
    const c = await loadFixture(base);
    await buy(c, c.alice, "100");
    await time.increase(31 * DAY);
    await fund(c);
    await c.rewards.distribute();
    const receiver = await deploy("ClaimsReentry");
    await receiver.setRewards(await c.rewards.getAddress());
    await c.rewards.connect(c.alice).claim(await receiver.getAddress(), true);
    expect(await receiver.attempted()).to.equal(true);
    await time.increase(901);
    await fund(c);
    await c.rewards.distribute();
    const before = await c.rewards.claimable(c.alice.address);
    await network.provider.send("hardhat_setBalance", [WBNB, "0x0"]);
    await expect(c.rewards.connect(c.alice).claim(c.alice.address, true)).to.be
      .reverted;
    expect(await c.rewards.claimable(c.alice.address)).to.equal(before);
  });
  it("conserves cumulative 70/15/10/5 budgets and rejects unauthorized or cross-bucket spending", async () => {
    const c = await loadFixture(base);
    await c.quote.transfer(await c.treasury.getAddress(), 101);
    await c.treasury.sync();
    for (const [i, n] of [70, 15, 10, 5].entries())
      expect(await c.treasury.allocated(i)).to.equal(n);
    await expect(c.treasury.withdrawOperations(1)).to.be.revertedWith(
      "PI: operations only",
    );
    await c.treasury.connect(c.ops).withdrawOperations(5);
    await expect(
      c.treasury.connect(c.ops).withdrawOperations(1),
    ).to.be.revertedWith("PI: operations budget");
    await expect(c.treasury.fundHolders(71)).to.be.revertedWith(
      "PI: holder budget",
    );
    await expect(c.rewards.credit(c.alice.address, 1)).to.be.revertedWith(
      "PI: token only",
    );
    await expect(c.rewards.fund(1)).to.be.revertedWith("PI: treasury only");
  });
  it("seeds real PancakeSwap liquidity at the terminal curve ratio and preserves holding ages", async () => {
    const c = await loadFixture(base);
    await buy(c, c.alice, "1000000");
    await time.increase(31 * DAY);
    await expect(c.core.migrate(await c.token.getAddress())).to.be.revertedWith(
      "Harness: not ready",
    );
    await buy(c, c.bob, "799000000");
    const price = await c.curve.getLastPrice(
      await c.token.getAddress(),
      0,
      await c.vault.totalRaised(),
    );
    await c.core.migrate(await c.token.getAddress());
    expect(await c.token.tokenPhase()).to.equal(3);
    const [r0, r1] = await c.pair.getReserves();
    const [rp, rq] =
      (await c.pair.token0()).toLowerCase() ===
      (await c.token.getAddress()).toLowerCase()
        ? [r0, r1]
        : [r1, r0];
    expect((rq * E("1")) / rp).to.be.closeTo(price, 2n);
    expect(await c.pair.balanceOf(DEAD)).to.be.greaterThan(0);
    expect(await c.token.balanceOf(await c.vault.getAddress())).to.equal(0);
    expect(await c.token.exitFeeBps(c.alice.address, E("1000000"))).to.equal(
      100,
    );
    expect(await c.rewards.balanceOf(await c.pair.getAddress())).to.equal(0);
  });
  it("charges real DEX buys 5 percent and fresh sells 10 percent", async () => {
    const c = await loadFixture(graduated);
    const p = await c.token.balanceOf(await c.pair.getAddress()),
      f = await c.token.balanceOf(await c.treasury.getAddress());
    gas.dexBuy = (await (await dexBuy(c, c.carol)).wait()).gasUsed.toString();
    const gross = p - (await c.token.balanceOf(await c.pair.getAddress()));
    expect(await c.token.balanceOf(c.carol.address)).to.equal(
      gross - gross / 20n,
    );
    expect(
      (await c.token.balanceOf(await c.treasury.getAddress())) - f,
    ).to.equal(gross / 20n);
    const amount = (await c.token.balanceOf(c.carol.address)) / 2n,
      fee = await c.token.balanceOf(await c.treasury.getAddress());
    gas.dexFreshSell = (
      await (await dexSell(c, c.carol, amount)).wait()
    ).gasUsed.toString();
    expect(
      (await c.token.balanceOf(await c.treasury.getAddress())) - fee,
    ).to.equal(amount / 10n);
  });
  it("reaches the 1 percent DEX floor after a month", async () => {
    const c = await loadFixture(graduated);
    await time.increase(31 * DAY);
    const f = await c.token.balanceOf(await c.treasury.getAddress());
    await dexSell(c, c.alice, E("100"));
    expect(
      (await c.token.balanceOf(await c.treasury.getAddress())) - f,
    ).to.equal(E("1"));
  });
  it("leaves exits live when treasury processing has no current oracle", async () => {
    const c = await loadFixture(graduated);
    await dexBuy(c, c.carol);
    await expect(
      c.treasury.convertTax(E("1"), (await time.latest()) + 300),
    ).to.be.revertedWith("PI: stale oracle");
    await dexSell(c, c.carol, E("1"));
    await oracle(c);
    await time.increase(7201);
    await expect(
      c.treasury.convertTax(E("1"), (await time.latest()) + 300),
    ).to.be.revertedWith("PI: stale oracle");
    await dexSell(c, c.carol, E("1"));
  });
  it("executes real fee conversion, buyback/burn and locked liquidity with segregated budgets", async () => {
    const c = await loadFixture(graduated);
    await dexBuy(c, c.carol, "0.1");
    await oracle(c);
    const before = await c.quote.balanceOf(await c.treasury.getAddress());
    gas.conversion = (
      await (
        await c.treasury.convertTax(E("10"), (await time.latest()) + 300)
      ).wait()
    ).gasUsed.toString();
    expect(
      await c.quote.balanceOf(await c.treasury.getAddress()),
    ).to.be.greaterThan(before);
    const supply = await c.token.totalSupply();
    gas.buyback = (
      await (
        await c.treasury.buyback(E("0.01"), (await time.latest()) + 300)
      ).wait()
    ).gasUsed.toString();
    expect(await c.token.totalSupply()).to.be.lessThan(supply);
    expect(await c.treasury.spent(1)).to.equal(E("0.01"));
    const lp = await c.pair.balanceOf(DEAD);
    gas.addLiquidity = (
      await (
        await c.treasury.addLiquidity(E("0.01"), (await time.latest()) + 300)
      ).wait()
    ).gasUsed.toString();
    expect(await c.pair.balanceOf(DEAD)).to.be.greaterThan(lp);
    expect(await c.treasury.spent(2)).to.be.at.most(E("0.01"));
    expect(await c.treasury.accountedBalance()).to.equal(
      await c.quote.balanceOf(await c.treasury.getAddress()),
    );
  });
  it("rejects premature oracle updates and oversized treasury swaps", async () => {
    const c = await loadFixture(graduated);
    await c.treasury.observe();
    await expect(c.treasury.observe()).to.be.revertedWith(
      "PI: observation early",
    );
    await time.increase(1801);
    await c.treasury.observe();
    await expect(
      c.treasury.buyback(E("2.5"), (await time.latest()) + 300),
    ).to.be.revertedWith("PI: batch too large");
  });
  it("bounds cohort storage and measures a crowded transfer and distribution", async () => {
    const c = await loadFixture(base);
    for (let i = 0; i < 35; i++) {
      await buy(c, c.alice, "100");
      await time.increase(DAY);
    }
    expect((await c.rewards.lotsOf(c.alice.address)).length).to.be.at.most(31);
    const r = await (
      await c.token.connect(c.alice).transfer(c.bob.address, E("1000"))
    ).wait();
    gas.crowdedTransfer = r.gasUsed.toString();
    expect(r.gasUsed).to.be.lessThan(5_000_000n);
    await fund(c);
    const d = await (await c.rewards.distribute()).wait();
    gas.crowdedDistribution = d.gasUsed.toString();
    expect(d.gasUsed).to.be.lessThan(5_000_000n);
  });
  it("validates LP inventory and component bindings", async () => {
    const c = await loadFixture(base),
      v = await deploy(
        "PiPresetValidator",
        await c.core.getAddress(),
        WBNB,
        ROUTER,
        await c.rewardsImpl.getAddress(),
        await c.treasuryImpl.getAddress(),
        1,
      );
    const p = {
      name: "Passive Income",
      symbol: "PI",
      tokenUri: "",
      maxSupply: c.create.maxSupply,
      saleAmount: c.create.saleAmount,
      raiseAmount: c.create.raiseAmount,
      quoteAsset: WBNB,
      tokenSalt: ethers.ZeroHash,
      tokenParams: c.config,
      vaultParams: "0x",
      curveParams: c.curveParams,
      tradeParams: "0x",
      migrateParams: "0x",
      customDataParams: "0x",
    };
    await v.validate(1, p);
    await expect(
      v.validate(1, { ...p, saleAmount: p.maxSupply }),
    ).to.be.revertedWith("PI: positive LP reserve");
    await expect(
      v.validate(1, { ...p, quoteAsset: c.alice.address }),
    ).to.be.revertedWith("PI: quote");
  });
  it("preserves ledger balances, supply and backing across 160 randomized EVM actions", async () => {
    const c = await loadFixture(base),
      users = [c.alice, c.bob, c.carol];
    let seed = 271828;
    const random = (n) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed % n;
    };
    for (let i = 0; i < 160; i++) {
      const u = users[random(3)],
        other = users[random(3)],
        a = random(6),
        balance = await c.token.balanceOf(u.address);
      if (a === 0) await buy(c, u, String(random(1000) + 1));
      else if (a === 1 && balance > 0n)
        await c.core
          .connect(u)
          .sell(await c.token.getAddress(), balance / 2n || 1n);
      else if (a === 2 && balance > 0n)
        await c.token.connect(u).transfer(other.address, balance / 3n || 1n);
      else if (a === 3) {
        await fund(c, "0.01");
        if (BigInt(await time.latest()) >= (await c.rewards.lastRound()) + 900n)
          await c.rewards.distribute();
      } else if (a === 4) await c.rewards.connect(u).claim(u.address, false);
      else await time.increase(random(3 * DAY) + 1);
      for (const u of users)
        expect(await c.rewards.balanceOf(u.address)).to.equal(
          await c.token.balanceOf(u.address),
        );
      expect((await c.rewards.funded()) - (await c.rewards.paid())).to.equal(
        await c.quote.balanceOf(await c.rewards.getAddress()),
      );
      let sum = 0n;
      for (const a of [
        ...users.map((u) => u.address),
        await c.vault.getAddress(),
        await c.treasury.getAddress(),
        await c.pair.getAddress(),
        DEAD,
      ])
        sum += await c.token.balanceOf(a);
      expect(sum).to.equal(await c.token.totalSupply());
      for (let j = 0; j < 4; j++)
        expect(await c.treasury.spent(j)).to.be.at.most(
          await c.treasury.allocated(j),
        );
    }
  });

  it("matches every daily rate and weight in the independently specified frontend model", async () => {
    const c = await loadFixture(base);
    await buy(c, c.alice, "100");
    const model = require("../../website/economics.js");
    const [lot] = await c.rewards.lotsOf(c.alice.address);
    for (let d = 0; d <= 35; d++) {
      await time.increaseTo(Number(lot.born) * DAY + d * DAY);
      expect(await c.token.exitFeeBps(c.alice.address, E("100"))).to.equal(
        model.sellBps(d),
      );
      expect(await c.rewards.totalWeight()).to.equal(
        E("100") * BigInt(model.weight(d) * 2),
      );
    }
  });
  it("settles dormant cohort history identically to active claims across two years", async () => {
    const c = await loadFixture(base);
    await buy(c, c.alice, "100");
    await buy(c, c.bob, "100");
    const before = await c.quote.balanceOf(c.bob.address);
    for (const days of [2, 30, 730]) {
      await time.increase(days * DAY);
      await fund(c);
      await c.rewards.distribute();
      await c.rewards.connect(c.bob).claim(c.bob.address, false);
    }
    const alice = await c.rewards.claimable(c.alice.address),
      bob = (await c.quote.balanceOf(c.bob.address)) - before;
    expect(alice - bob).to.be.within(-3n, 3n);
    await c.rewards.connect(c.alice).claim(c.alice.address, false);
    expect((await c.rewards.funded()) - (await c.rewards.paid())).to.equal(
      await c.quote.balanceOf(await c.rewards.getAddress()),
    );
  });
  it("rejects treasury execution after a large spot-price displacement", async () => {
    const c = await loadFixture(graduated);
    await oracle(c);
    await dexBuy(c, c.carol, "20");
    await expect(
      c.treasury.buyback(E("0.01"), (await time.latest()) + 300),
    ).to.be.revertedWith("PI: price deviation");
    await expect(dexSell(c, c.carol, E("10"))).not.to.be.reverted;
  });
  it("graduates with an unsolicited quote donation without a stuck migration", async () => {
    const c = await loadFixture(base);
    await c.quote.transfer(await c.pair.getAddress(), E("1"));
    await buy(c, c.alice, "800000000");
    await c.core.migrate(await c.token.getAddress());
    expect(await c.quote.balanceOf(await c.pair.getAddress())).to.equal(
      E("401"),
    );
    expect(await c.token.balanceOf(await c.pair.getAddress())).to.equal(
      E("160000000"),
    );
    expect(await c.pair.balanceOf(DEAD)).to.be.greaterThan(0);
  });
  after(async function () {
    const m = await network.provider.send("hardhat_metadata");
    fs.writeFileSync(
      path.join(__dirname, "../../outputs/contract-verification.json"),
      JSON.stringify(
        {
          scope:
            "Actual WBNB and PancakeSwap V2 on a local BNB fork. OpenFour settlement uses the labelled CoreHarness.",
          fork: m.forkedNetwork,
          compiler: "0.8.24",
          gasUnits: gas,
          tests: this.test.parent.tests.map((t) => ({
            title: t.title,
            status: t.state || "unknown",
          })),
          limits: [
            "No public transaction or deployed PI address.",
            "Production OpenFour Core/FeeRouter/Registry integration and independent security audit remain required.",
            "Measured gas cases are not a proof of global worst-case gas.",
          ],
        },
        null,
        2,
      ) + "\n",
    );
  });
});
