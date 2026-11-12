"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CashFlowEngine, GameSnapshot, QuarterReport } from "./engine";

const money = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(Math.round(n)).toLocaleString()}`;

function tipFor(r: QuarterReport): string {
  if (r.capex > 0 && r.fcf < 0)
    return "Negative FCF from investing isn't automatically bad: that CapEx raises every future quarter's revenue. Investing only hurts when the payback never arrives.";
  if (r.arEnd > r.collections && r.arEnd > 30)
    return "Your receivables are piling up. Invoices count as revenue, but they aren't cash until customers pay. Growing AR quietly drains operating cash flow.";
  if (r.opex > r.cashSales)
    return "OpEx ate more than your cash sales. Cutting operating costs is the fastest way to lift operating cash flow.";
  if (r.capex === 0 && r.fcf > 0)
    return "Strong FCF with zero CapEx. Good, but a business that never reinvests eventually stops growing. Teal gates are growth investments.";
  return "FCF = Operating Cash Flow − Capital Expenditures. It's the cash left over for owners after the business pays to keep running and growing.";
}

function grade(total: number, bankrupt: boolean) {
  if (bankrupt) return { letter: "D", label: "Chapter 11" };
  if (total > 900) return { letter: "S", label: "Cash Machine" };
  if (total > 600) return { letter: "A", label: "Compounder" };
  if (total > 350) return { letter: "B", label: "Steady Operator" };
  if (total > 150) return { letter: "C", label: "Break-Even Hustler" };
  return { letter: "C-", label: "Cash Strapped" };
}

function FcfChart({ reports, total }: { reports: QuarterReport[]; total: number }) {
  const max = Math.max(40, ...reports.map((r) => Math.abs(r.fcf)));
  return (
    <div className="riso-chart" aria-label="Free cash flow by quarter">
      {Array.from({ length: total }, (_, i) => {
        const r = reports[i];
        const h = r ? (Math.abs(r.fcf) / max) * 100 : 0;
        return (
          <div className="riso-chart-col" key={i}>
            <div className="riso-chart-half">
              {r && r.fcf >= 0 && <div className="riso-bar riso-bar-pos" style={{ height: `${h}%` }} />}
            </div>
            <div className="riso-chart-half riso-chart-neg">
              {r && r.fcf < 0 && <div className="riso-bar riso-bar-neg" style={{ height: `${h}%` }} />}
            </div>
            <span className="riso-chart-label">Q{i + 1}</span>
            {r && <span className="riso-chart-value">{money(r.fcf)}</span>}
          </div>
        );
      })}
    </div>
  );
}

function Statement({ r }: { r: QuarterReport }) {
  const rows: [string, number, string?][] = [
    ["Cash sales (coins)", r.cashSales],
    ["+ Collections (last Q's AR)", r.collections],
    ["− Operating expenses", -r.opex],
    ["− Cash taxes (20%)", -r.taxes]
  ];
  return (
    <table className="riso-table">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <td>{k}</td>
            <td>{money(v)}</td>
          </tr>
        ))}
        <tr className="riso-sum">
          <td>= Operating cash flow</td>
          <td>{money(r.ocf)}</td>
        </tr>
        <tr>
          <td>− Capital expenditures</td>
          <td>{money(-r.capex)}</td>
        </tr>
        <tr className="riso-total">
          <td>= FREE CASH FLOW</td>
          <td>{money(r.fcf)}</td>
        </tr>
        <tr className="riso-note">
          <td>Invoices still owed to you (AR)</td>
          <td>{money(r.arEnd)}</td>
        </tr>
      </tbody>
    </table>
  );
}

export default function CashFlowGame() {
  const mountRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<CashFlowEngine | null>(null);
  const [snap, setSnap] = useState<GameSnapshot | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let disposed = false;
    let engine: CashFlowEngine | null = null;
    import("./engine")
      .then(({ CashFlowEngine }) => {
        if (disposed || !mountRef.current) return;
        try {
          engine = new CashFlowEngine(mountRef.current, setSnap);
          engineRef.current = engine;
        } catch {
          setFailed(true);
        }
      })
      .catch(() => setFailed(true));
    return () => {
      disposed = true;
      engine?.dispose();
      engineRef.current = null;
    };
  }, []);

  const primary = useCallback(() => {
    const e = engineRef.current;
    if (!e || !snap) return;
    if (snap.phase === "ready") e.start();
    else if (snap.phase === "report") e.nextQuarter();
    else if (snap.phase === "over") e.restart();
  }, [snap]);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const e = engineRef.current;
      if (!e) return;
      const k = ev.key.toLowerCase();
      if (k === "arrowleft" || k === "a") e.move(-1);
      else if (k === "arrowright" || k === "d") e.move(1);
      else if (k === "arrowup" || k === "w" || k === " ") {
        if (snap?.phase === "playing") e.jump();
        else primary();
      } else if (k === "enter") primary();
      else return;
      ev.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [primary, snap?.phase]);

  // swipe controls
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (ev: React.TouchEvent) => {
    const t = ev.touches[0];
    touch.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (ev: React.TouchEvent) => {
    const start = touch.current;
    const e = engineRef.current;
    touch.current = null;
    if (!start || !e) return;
    const t = ev.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    if (Math.abs(dx) > Math.abs(dy)) e.move(dx > 0 ? 1 : -1);
    else if (dy < 0) e.jump();
  };

  const s = snap;
  const last = s?.reports[s.reports.length - 1];
  const timePct = s ? (s.timeLeft / s.quarterLength) * 100 : 100;

  return (
    <div className="riso-root" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div ref={mountRef} className="riso-canvas" />
      <div className="riso-halftone" aria-hidden />
      <div className="riso-grain" aria-hidden />

      {failed && (
        <div className="riso-overlay">
          <div className="riso-card">
            <h2 className="riso-title-sm">WebGL unavailable</h2>
            <p>Your browser couldn&apos;t start the 3D renderer. Try a recent Chrome, Firefox or Safari.</p>
          </div>
        </div>
      )}

      {s && s.phase !== "ready" && (
        <header className="riso-hud">
          <div className="riso-chip riso-chip-ink">
            Q{s.quarter}
            <span className="opacity-60">/{s.totalQuarters}</span>
          </div>
          <div className="riso-chip">
            <span className="riso-k">Cash</span>
            <span className={s.cash < 30 ? "riso-v text-[#ff4fa3]" : "riso-v"}>{money(s.cash)}</span>
          </div>
          <div className="riso-chip riso-eq">
            <span className="riso-k">OCF</span>
            <span className="riso-v">{money(s.ocf)}</span>
            <span className="riso-op">−</span>
            <span className="riso-k">CapEx</span>
            <span className="riso-v">{money(s.capex)}</span>
            <span className="riso-op">=</span>
            <span className="riso-k">FCF</span>
            <span className={`riso-v ${s.fcf < 0 ? "text-[#ff4fa3]" : "text-[#0b8a52]"}`}>{money(s.fcf)}</span>
          </div>
          <div className="riso-chip">
            <span className="riso-k">AR</span>
            <span className="riso-v text-[#3b5bdb]">{money(s.receivables)}</span>
          </div>
          <div className="riso-chip">
            <span className="riso-k">Rev</span>
            <span className="riso-v text-[#00a19b]">×{s.revenueMult.toFixed(1)}</span>
          </div>
          {s.streak >= 10 && <div className="riso-chip riso-chip-yellow">2× STREAK</div>}
          <div className="riso-timer">
            <div className="riso-timer-fill" style={{ width: `${timePct}%` }} />
          </div>
        </header>
      )}

      {s?.phase === "ready" && (
        <div className="riso-overlay">
          <div className="riso-card riso-card-wide">
            <p className="riso-kicker">A 3D runner in six quarters</p>
            <h1 className="riso-title">
              FREE
              <br />
              CASH FLOW
            </h1>
            <p className="riso-formula">FCF = Operating Cash Flow − CapEx</p>
            <ul className="riso-legend">
              <li>
                <i className="riso-swatch bg-[#ffd23f]" /> <b>Coins</b> cash sales, straight into the bank
              </li>
              <li>
                <i className="riso-swatch bg-[#3b5bdb]" /> <b>Invoices (AR)</b> worth more, but the cash arrives next
                quarter
              </li>
              <li>
                <i className="riso-swatch bg-[#ff4fa3]" /> <b>OpEx walls</b> drain cash. Jump over them
              </li>
              <li>
                <i className="riso-swatch bg-[#00a19b]" /> <b>CapEx gates</b> cost cash now, +30% revenue forever
              </li>
            </ul>
            <p className="riso-small">
              Taxes settle at quarter close. Cash below $0 means bankruptcy. Score = total FCF over 6 quarters.
            </p>
            <button className="riso-btn" onClick={primary}>
              Open the books ▸
            </button>
            <p className="riso-small mt-3">← → / A D to switch lanes · ↑ / Space to jump · swipe on mobile</p>
          </div>
        </div>
      )}

      {s?.phase === "report" && last && (
        <div className="riso-overlay">
          <div className="riso-card riso-card-wide">
            <p className="riso-kicker">Quarter {last.quarter} closed</p>
            <h2 className="riso-title-sm">Cash Flow Statement</h2>
            <Statement r={last} />
            <FcfChart reports={s.reports} total={s.totalQuarters} />
            <p className="riso-tip">{tipFor(last)}</p>
            <button className="riso-btn" onClick={primary} autoFocus>
              Start Q{last.quarter + 1} ▸
            </button>
          </div>
        </div>
      )}

      {s?.phase === "over" && (
        <div className="riso-overlay">
          <div className="riso-card riso-card-wide">
            {(() => {
              const g = grade(s.totalFcf, s.endReason === "bankrupt");
              return (
                <>
                  <p className="riso-kicker">
                    {s.endReason === "bankrupt" ? `Ran out of cash in Q${s.quarter}` : "Fiscal year complete"}
                  </p>
                  <div className="riso-grade">
                    <span className="riso-grade-letter">{g.letter}</span>
                    <span>
                      <span className="riso-title-sm block">{g.label}</span>
                      <span className="riso-small">
                        Total FCF <b>{money(s.totalFcf)}</b> · Ending cash <b>{money(s.cash)}</b> · Revenue ×
                        {s.revenueMult.toFixed(1)}
                      </span>
                    </span>
                  </div>
                </>
              );
            })()}
            <FcfChart reports={s.reports} total={s.totalQuarters} />
            <p className="riso-tip">
              {s.endReason === "bankrupt"
                ? "Profitable companies still go bust when cash runs dry. Watch the cash balance, not just revenue: keep a buffer before you invest."
                : "Great businesses invest early when payback is long, then harvest free cash flow. Did your CapEx pay for itself?"}
            </p>
            <div className="flex flex-wrap gap-3">
              <button className="riso-btn" onClick={primary} autoFocus>
                Play again ▸
              </button>
              <Link className="riso-btn riso-btn-ghost" href="/">
                Home
              </Link>
            </div>
          </div>
        </div>
      )}

      {s?.phase === "playing" && (
        <div className="riso-pad" aria-label="Touch controls">
          <button aria-label="Move left" onClick={() => engineRef.current?.move(-1)}>
            ◀
          </button>
          <button aria-label="Jump" onClick={() => engineRef.current?.jump()}>
            ▲
          </button>
          <button aria-label="Move right" onClick={() => engineRef.current?.move(1)}>
            ▶
          </button>
        </div>
      )}
    </div>
  );
}
