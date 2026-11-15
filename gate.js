// π — access gate
// NOTE: client-side only · trivial to bypass via devtools / view-source.
// Treat this as a soft-gate (keep casual visitors out), not real auth.

(() => {
  const PASS = 'passive3.14';

  // PRE-LAUNCH: ask every page load. To make the unlock persist across
  // refreshes once we go live, restore the localStorage check here and
  // re-enable the setItem calls in the submit handler below.
  // const KEY = 'pi-gate-ok';
  // try {
  //   if (localStorage.getItem(KEY) === '1') {
  //     document.documentElement.classList.add('is-unlocked');
  //     return;
  //   }
  // } catch {}

  const buildGate = () => {
    const gate = document.createElement('div');
    gate.id = 'gate';
    // Card uses .glow-frame + .glow-ring from styles.css for the spinning
    // lime shine that wraps the contract-address card on the home page.
    gate.innerHTML = `
      <div class="gate-card glow-frame" role="dialog" aria-modal="true" aria-labelledby="gate-title">
        <span class="glow-ring glow-cw"  aria-hidden="true"></span>
        <span class="glow-ring glow-ccw" aria-hidden="true"></span>
        <div class="gate-content">
          <div class="gate-bar">
            <span><span class="gate-led" aria-hidden="true"></span>// ACCESS_RESTRICTED</span>
            <span>v0.1.0</span>
          </div>
          <div class="gate-glyph" aria-hidden="true">π</div>
          <h1 class="gate-h" id="gate-title">PASSIVE_INCOME</h1>
          <div class="gate-sub">// ENTER PASSWORD TO CONTINUE</div>
          <form class="gate-form" id="gate-form" autocomplete="off" novalidate>
            <input type="password"
                   class="gate-input"
                   id="gate-input"
                   placeholder="········"
                   autocomplete="off"
                   spellcheck="false"
                   aria-label="password" />
            <button type="submit" class="gate-btn">[ ENTER ]</button>
          </form>
          <div class="gate-err" id="gate-err" role="alert">// INVALID · TRY AGAIN</div>
          <div class="gate-foot">BNB · REVIEW_BUILD · PRE-LAUNCH</div>
        </div>
      </div>
    `;
    document.body.appendChild(gate);

    const input = gate.querySelector('#gate-input');
    const err   = gate.querySelector('#gate-err');
    const card  = gate.querySelector('.gate-card');
    const form  = gate.querySelector('#gate-form');

    requestAnimationFrame(() => input.focus());

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (input.value === PASS) {
        // PRE-LAUNCH: no persistence — every page load re-prompts.
        // try { localStorage.setItem(KEY, '1'); } catch {}
        document.documentElement.classList.add('is-unlocked');
        gate.remove();
        window.dispatchEvent(new Event('pi:unlocked'));
      } else {
        err.classList.add('is-on');
        card.classList.remove('is-shake');
        // force reflow so the animation restarts on repeat misses
        void card.offsetWidth;
        card.classList.add('is-shake');
        input.value = '';
        input.focus();
      }
    });

    input.addEventListener('input', () => err.classList.remove('is-on'));
  };

  if (document.body) buildGate();
  else document.addEventListener('DOMContentLoaded', buildGate, { once: true });
})();
