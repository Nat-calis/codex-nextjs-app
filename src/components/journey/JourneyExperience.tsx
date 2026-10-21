"use client";

import { useEffect, useRef, useState } from "react";
import { chapters, finaleSubline } from "./content";
import { Experience } from "./engine/Experience";
import { AmbientSynth } from "./engine/SoundBus";
import styles from "./journey.module.css";

declare global {
  interface Window {
    __journey?: {
      ready: Promise<void>;
      advance: (dt: number) => void;
      setStory: (position: number | null) => void;
    };
  }
}

function webglAvailable() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2"));
  } catch {
    return false;
  }
}

export default function JourneyExperience() {
  const rootRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const chapterRefs = useRef<(HTMLElement | null)[]>([]);
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<SVGCircleElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const loaderRef = useRef<HTMLDivElement>(null);
  const countRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const hudIndexRef = useRef<HTMLSpanElement>(null);
  const hudBarRef = useRef<HTMLDivElement>(null);
  const synthRef = useRef<AmbientSynth | null>(null);

  const [mode, setMode] = useState<"webgl" | "static">("webgl");
  const [sound, setSound] = useState(false);

  useEffect(() => {
    const capture = new URLSearchParams(window.location.search).has("capture");
    // WebGL failure is reported by the platform, so swap to the static story asynchronously.
    const fallback = () => queueMicrotask(() => setMode("static"));
    if (!webglAvailable()) {
      fallback();
      return;
    }
    let experience: Experience;
    try {
      experience = new Experience(
        {
          root: rootRef.current!,
          host: hostRef.current!,
          chapters: chapterRefs.current.filter((el): el is HTMLElement => el !== null),
          cursor: {
            dot: dotRef.current!,
            ring: ringRef.current!,
            progress: progressRef.current!,
            label: labelRef.current!
          },
          loader: { root: loaderRef.current!, count: countRef.current!, bar: barRef.current! },
          hud: { root: hudRef.current!, index: hudIndexRef.current!, bar: hudBarRef.current! }
        },
        { capture, coarsePointer: window.matchMedia("(pointer: coarse)").matches }
      );
    } catch {
      fallback();
      return;
    }
    synthRef.current = new AmbientSynth(experience.sound);
    if (capture) {
      window.__journey = {
        ready: experience.ready,
        advance: (dt) => experience.advance(dt),
        setStory: (position) => experience.setStoryPosition(position)
      };
    }
    return () => {
      experience.dispose();
      synthRef.current?.dispose();
      synthRef.current = null;
      delete window.__journey;
    };
  }, []);

  const toggleSound = async () => {
    const synth = synthRef.current;
    if (!synth) return;
    if (sound) {
      setSound(false);
      await synth.disable();
    } else {
      setSound(await synth.enable());
    }
  };

  if (mode === "static") {
    return (
      <main className={styles.static}>
        {chapters.map((ch, i) => (
          <section className={styles.staticChapter} key={i}>
            <p className={styles.kicker}>Nº {String(i + 1).padStart(2, "0")}</p>
            <h2 className={`${styles.headline} ${ch.variant ? styles[ch.variant] : ""}`}>
              {ch.lines.map((line) => (
                <span className={styles.line} key={line}>
                  {line}
                </span>
              ))}
            </h2>
            {ch.variant === "finale" && <p className={styles.sub}>{finaleSubline.join("  ·  ")}</p>}
          </section>
        ))}
      </main>
    );
  }

  return (
    <div className={styles.root} ref={rootRef} data-layout="wide">
      <div className={styles.canvasHost} ref={hostRef} />
      <div className={styles.vignette} aria-hidden="true" />
      <div className={styles.grain} aria-hidden="true" />

      <main className={styles.story}>
        {chapters.map((ch, i) => {
          const Heading = i === 0 ? "h1" : "h2";
          return (
            <section
              className={styles.chapter}
              data-align={ch.align}
              data-variant={ch.variant}
              key={i}
              ref={(el) => {
                chapterRefs.current[i] = el;
              }}
              style={{ visibility: i === 0 ? "visible" : "hidden" }}
            >
              <div className={styles.chapterInner}>
                <p className={styles.kicker} data-line>
                  {ch.variant === "hero" ? "A story told in particles" : `Nº ${String(i + 1).padStart(2, "0")}`}
                </p>
                <Heading className={`${styles.headline} ${ch.variant ? styles[ch.variant] : ""}`} data-headline>
                  {ch.lines.map((line) => (
                    <span className={styles.line} data-line key={line}>
                      {line}
                    </span>
                  ))}
                </Heading>
                {ch.variant === "finale" && (
                  <p className={styles.sub}>
                    {finaleSubline.map((line) => (
                      <span data-line key={line}>
                        {line}
                      </span>
                    ))}
                  </p>
                )}
                {ch.variant === "hero" && (
                  <p className={styles.hint} data-line>
                    <span className={styles.hintRule} />
                    Scroll to begin
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </main>

      <div className={styles.hud} ref={hudRef} style={{ opacity: 0 }}>
        <div className={styles.brand}>
          <span className={styles.brandMark} />
          Keep Going
        </div>
        <button className={styles.sound} onClick={toggleSound} type="button" aria-pressed={sound}>
          <span className={styles.soundBars} data-on={sound}>
            <i />
            <i />
            <i />
          </span>
          Sound {sound ? "on" : "off"}
        </button>
        <div className={styles.meter} aria-hidden="true">
          <span ref={hudIndexRef}>01</span>
          <div className={styles.meterTrack}>
            <div className={styles.meterBar} ref={hudBarRef} />
          </div>
          <span>{String(chapters.length).padStart(2, "0")}</span>
        </div>
        <div className={styles.controls}>Move · Swipe · Hold &amp; release</div>
      </div>

      <div className={styles.loader} ref={loaderRef}>
        <p className={styles.kicker}>Gathering particles</p>
        <span className={styles.loaderCount} ref={countRef}>
          000
        </span>
        <div className={styles.loaderTrack}>
          <div className={styles.loaderBar} ref={barRef} />
        </div>
      </div>

      <div className={styles.cursorDot} ref={dotRef} aria-hidden="true" />
      <div className={styles.cursorRing} ref={ringRef} aria-hidden="true">
        <svg viewBox="0 0 48 48">
          <circle className={styles.cursorTrack} cx="24" cy="24" r="21" />
          <circle className={styles.cursorProgress} cx="24" cy="24" r="21" ref={progressRef} />
        </svg>
      </div>
      <div className={styles.cursorLabel} ref={labelRef} aria-hidden="true">
        hold
      </div>

      <div className={styles.scrollSpace} style={{ height: `${chapters.length * 100}vh` }} />
    </div>
  );
}
