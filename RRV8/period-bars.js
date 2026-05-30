/*
 * RRV8 — shared period bar-chart selector
 *
 * Single source of truth for the V8 period picker. Sits in the page
 * header (or anywhere the page wants) and replaces the period pill
 * on period-scoped pages.
 *
 * Usage:
 *
 *   const bars = RRV8.mountPeriodBars({
 *     host:          '#js-period-bars',  // selector or element
 *     data:          [{period: '2016-08-27', value: 13203.53}, ...],
 *     currentPeriod: '2016-08-27',
 *     labelFor:      (period) => 'Aug 27, 2016',
 *     fmtValue:      (v) => '13,203.53',
 *     onSwitch:      (period) => { ... page handles ... },
 *     labelText:     'Out of Bal by Period',  // optional, default shown
 *   });
 *
 *   // Later — when filters change, or the user picks a new period:
 *   bars.setData(nextHistory);
 *   bars.setCurrentPeriod('2016-07-30');
 *
 * Bars are dimmed by default; the current period paints accent
 * orange with a drop-shadow ring. Hover shows a tooltip with the
 * period date and the value (formatted by the caller's fmtValue).
 * Click switches; Enter/Space on a focused bar does the same.
 */
(function (global) {
  'use strict';

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, m =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])
    );
  }

  function resolveHost(host) {
    if (!host) return null;
    if (typeof host === 'string') return document.querySelector(host);
    return host;
  }

  /**
   * Mount the period bar-chart selector inside `host`.
   * @returns {{ setData, setCurrentPeriod, render, destroy }}
   */
  function mountPeriodBars(opts) {
    opts = opts || {};
    const host = resolveHost(opts.host);
    if (!host) {
      console.warn('[period-bars] No host element');
      return null;
    }

    // Mutable internal state — caller mutates via setData / setCurrentPeriod.
    const state = {
      data:          Array.isArray(opts.data) ? opts.data.slice() : [],
      currentPeriod: opts.currentPeriod || null,
      labelFor:      typeof opts.labelFor === 'function' ? opts.labelFor : (p => String(p)),
      fmtValue:      typeof opts.fmtValue === 'function' ? opts.fmtValue : (v => String(v)),
      onSwitch:      typeof opts.onSwitch === 'function' ? opts.onSwitch : () => {},
      labelText:     opts.labelText || 'Out of Bal by Period',
    };

    function render() {
      if (!state.data.length) { host.innerHTML = ''; return; }

      // Larger viewBox so the chart looks right when stretched into
      // the page-header's right-side space. preserveAspectRatio="none"
      // lets the SVG scale to whatever the container gives it.
      const W = 400, H = 100, padX = 4, padY = 6;
      const innerW = W - padX * 2;
      const innerH = H - padY * 2;
      const zeroY  = padY + innerH / 2;
      const maxAbs = Math.max.apply(null, state.data.map(p => Math.abs(p.value)).concat([1]));
      const n      = state.data.length;
      const barGap = 6;
      const barW   = Math.max(8, (innerW - barGap * (n - 1)) / n);

      const bars = state.data.map((p, i) => {
        const x = padX + i * (barW + barGap);
        const isCurrent = p.period === state.currentPeriod;
        const isNeg     = p.value < 0;
        const half      = (Math.abs(p.value) / maxAbs) * (innerH / 2);
        const y         = isNeg ? zeroY : zeroY - half;
        const h         = Math.max(1, half);
        const cls       = ['period-bar'];
        if (isCurrent) cls.push('is-current');
        if (isNeg)     cls.push('is-negative');
        // Hit area: full chart height, tiled across the column so a
        // 0-dollar period (visible bar collapses to 1px) still has a
        // usable hover/click target. Tiles edge-to-edge by absorbing
        // half the gap on each side and clamping at the chart edges.
        const hitLeft  = i === 0     ? 0 : x - barGap / 2;
        const hitRight = i === n - 1 ? W : x + barW + barGap / 2;
        const hitW     = hitRight - hitLeft;
        return '<g class="period-bar-group">' +
          '<rect class="' + cls.join(' ') + '"' +
            ' x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '"' +
            ' width="' + barW.toFixed(1) + '" height="' + h.toFixed(1) + '"' +
            ' rx="3"/>' +
          '<rect class="period-bar-hit"' +
            ' x="' + hitLeft.toFixed(1) + '" y="0"' +
            ' width="' + hitW.toFixed(1) + '" height="' + H + '"' +
            ' data-period="' + escapeHtml(p.period) + '"' +
            ' data-value="' + p.value + '"' +
            ' role="button" tabindex="0"' +
            ' aria-label="' + escapeHtml(state.labelFor(p.period) + ': ' + state.fmtValue(p.value)) + '"/>' +
          '</g>';
      }).join('');

      // "You are here" cue in the top-right — the selected period
       // label, sourced from the caller's labelFor() so format matches
       // the page (e.g. "Aug 27, 2016").
      const currentLabel = state.currentPeriod
        ? state.labelFor(state.currentPeriod)
        : '';

      host.classList.add('period-bars');
      host.innerHTML =
        '<div class="period-bars-head">' +
          '<div class="period-bars-label">' + escapeHtml(state.labelText) + '</div>' +
          '<div class="period-bars-current">' + escapeHtml(currentLabel) + '</div>' +
        '</div>' +
        '<div class="period-bars-svg-wrap">' +
          '<svg class="period-bars-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true">' +
            '<line class="period-bars-zero" x1="' + padX + '" y1="' + zeroY.toFixed(1) + '"' +
              ' x2="' + (W - padX) + '" y2="' + zeroY.toFixed(1) + '"/>' +
            bars +
          '</svg>' +
        '</div>' +
        '<div class="period-bars-tip">' +
          '<div class="period-bars-tip-date"></div>' +
          '<div class="period-bars-tip-value"></div>' +
        '</div>';

      if (!host._periodBarsWired) {
        wire();
        host._periodBarsWired = true;
      }
    }

    function wire() {
      // Re-query the tip on every event — the host's innerHTML is
      // replaced on each render, which detaches whatever element we
      // would have captured at wire time. Listeners stay attached to
      // the host, so they keep firing.
      const getTip = () => host.querySelector('.period-bars-tip');

      host.addEventListener('click', (e) => {
        const bar = e.target.closest('.period-bar-hit');
        if (!bar) return;
        state.onSwitch(bar.dataset.period);
      });
      host.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const bar = e.target.closest('.period-bar-hit');
        if (!bar) return;
        e.preventDefault();
        state.onSwitch(bar.dataset.period);
      });

      const showTip = (bar) => {
        const tip = getTip();
        if (!tip) return;
        const period = bar.dataset.period;
        const value  = Number(bar.dataset.value);
        tip.querySelector('.period-bars-tip-date').textContent  = state.labelFor(period);
        const valEl = tip.querySelector('.period-bars-tip-value');
        valEl.textContent = state.fmtValue(value);
        valEl.classList.toggle('is-neg', value < 0);
        valEl.classList.toggle('is-pos', value > 0);
        // Center above the hovered bar; clamp inside the host.
        const barRect = bar.getBoundingClientRect();
        const cRect   = host.getBoundingClientRect();
        const center  = barRect.left + barRect.width / 2 - cRect.left;
        const tipW = tip.offsetWidth || 120;
        const clampedCenter = Math.max(tipW / 2 + 4, Math.min(cRect.width - tipW / 2 - 4, center));
        tip.style.left = clampedCenter + 'px';
        tip.style.transform = 'translateX(-50%)';
        tip.classList.add('is-visible');
      };
      const hideTip = () => {
        const tip = getTip();
        if (tip) tip.classList.remove('is-visible');
      };

      host.addEventListener('mouseover', (e) => {
        const bar = e.target.closest('.period-bar-hit');
        if (bar) showTip(bar);
      });
      host.addEventListener('mouseleave', hideTip);
      host.addEventListener('focusin', (e) => {
        const bar = e.target.closest('.period-bar-hit');
        if (bar) showTip(bar);
      });
      host.addEventListener('focusout', hideTip);
    }

    function setData(data) {
      state.data = Array.isArray(data) ? data.slice() : [];
      render();
    }
    function setCurrentPeriod(period) {
      if (state.currentPeriod === period) return;
      state.currentPeriod = period;
      render();
    }
    function destroy() {
      host.innerHTML = '';
      host.classList.remove('period-bars');
      host._periodBarsWired = false;
    }

    render();
    return { setData, setCurrentPeriod, render, destroy };
  }

  global.RRV8 = global.RRV8 || {};
  global.RRV8.mountPeriodBars = mountPeriodBars;
})(window);
