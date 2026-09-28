"use client";

import { CSSProperties, ReactNode, useEffect, useRef } from "react";
import Logo from "@/app/components/Logo";

// The book spines on the archive shelf — same set, sizes and colours as the
// reference template.
const BOOKS: { w: number; h: number; c: string; t: string }[] = [
  { w: 22, h: 168, c: "#4a2420", t: "PHY 201" },
  { w: 26, h: 176, c: "#2c3a2a", t: "BIO 110" },
  { w: 20, h: 158, c: "#243248", t: "MAT 301" },
  { w: 28, h: 172, c: "#3d3833", t: "CHE 220" },
  { w: 24, h: 164, c: "#5c3d24", t: "ECO 101" },
  { w: 22, h: 174, c: "#3a2036", t: "HIS 205" },
  { w: 30, h: 170, c: "#1e3a3a", t: "LAW 401" },
  { w: 20, h: 156, c: "#4a3a1e", t: "ENG 210" },
  { w: 26, h: 172, c: "#4a2420", t: "PSY 150" },
  { w: 24, h: 162, c: "#2c3a2a", t: "PHI 300" },
  { w: 22, h: 178, c: "#243248", t: "MED 401" },
  { w: 28, h: 170, c: "#3d3833", t: "ART 210" },
  { w: 20, h: 160, c: "#5c3d24", t: "MUS 101" },
  { w: 26, h: 174, c: "#3a2036", t: "COM 220" },
  { w: 22, h: 166, c: "#1e3a3a", t: "GEO 120" },
  { w: 28, h: 172, c: "#4a3a1e", t: "THE 105" },
];

export type ShelfWave = "up" | "down" | null;

export default function AuthShell({
  focused = false,
  wave = null,
  waveKey = 0,
  children,
}: {
  focused?: boolean;
  wave?: ShelfWave;
  waveKey?: number; // bump to replay the wave
  children: ReactNode;
}) {
  const archiveRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  // Subtle 3D parallax — max ~3° tilt, desktop only (as in the template).
  useEffect(() => {
    const archive = archiveRef.current;
    const stage = stageRef.current;
    if (!archive || !stage) return;
    if (!window.matchMedia("(min-width: 981px)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;
    const onMove = (e: MouseEvent) => {
      const r = archive.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width - 0.5;
      const ny = (e.clientY - r.top) / r.height - 0.5;
      ty = nx * 3.5;
      tx = -ny * 2.5;
    };
    const onLeave = () => { tx = 0; ty = 0; };
    const tick = () => {
      cx += (tx - cx) * 0.055;
      cy += (ty - cy) * 0.055;
      stage.style.transform = `rotateX(${cx.toFixed(2)}deg) rotateY(${cy.toFixed(2)}deg)`;
      raf = requestAnimationFrame(tick);
    };
    archive.addEventListener("mousemove", onMove);
    archive.addEventListener("mouseleave", onLeave);
    raf = requestAnimationFrame(tick);
    return () => {
      archive.removeEventListener("mousemove", onMove);
      archive.removeEventListener("mouseleave", onLeave);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="va">
      <aside ref={archiveRef} className={`va-archive${focused ? " is-focused" : ""}`}>
        <div className="va-archive-inner">
          <header className="va-brand">
            <div className="va-brand-mark">
              <Logo size={62} animated />
            </div>
            <div className="va-brand-text">
              <span className="va-brand-name serif">Veloce</span>
              <span className="va-brand-tag">Archive of Excellence</span>
            </div>
          </header>

          <div className="va-shelf-scene">
            <div className="va-shelf-stage" ref={stageRef}>
              <div className="va-shelf-glow" />
              <div className="va-shelf">
                <div className="va-shelf-row">
                  {BOOKS.map((b, i) => (
                    <div
                      key={`${b.t}-${waveKey}`}
                      className={`va-book${wave === "up" ? " is-wave-up" : wave === "down" ? " is-wave-down" : ""}`}
                      style={{ "--w": `${b.w}px`, "--h": `${b.h}px`, "--c": b.c, "--i": i } as CSSProperties}
                    >
                      <span className="va-book-title">{b.t}</span>
                    </div>
                  ))}
                </div>
                <div className="va-shelf-plank" />
              </div>
            </div>
          </div>

          <footer className="va-archive-foot">
            <div className="va-stats">
              <div>
                <div className="va-stat-num serif">12,480</div>
                <div className="va-stat-label">Notes archived</div>
              </div>
              <div>
                <div className="va-stat-num serif">2,940</div>
                <div className="va-stat-label">Active scribes</div>
              </div>
            </div>
            <p className="va-archive-note">Every great note deserves a reader who needs it.</p>
          </footer>
        </div>
      </aside>

      <main className="va-auth">
        <div className="va-auth-inner">{children}</div>

        <div className="va-foot">
          <div className="va-links">
            <a href="/terms" target="_blank" rel="noopener noreferrer">Terms</a>
            <span className="va-dot">·</span>
            <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy</a>
            <span className="va-dot">·</span>
            <a href="mailto:velocenotes@outlook.com">Help</a>
            <span className="va-dot">·</span>
            <a href="mailto:velocenotes@outlook.com">Contact</a>
          </div>
        </div>
      </main>
    </div>
  );
}
