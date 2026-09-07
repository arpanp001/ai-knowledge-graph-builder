import confetti from "canvas-confetti";

/**
 * A small, tasteful confetti burst - used sparingly, only for genuinely
 * positive milestones (document finished processing, project created).
 * Kept brief and low-intensity so it reads as a nice touch, not a gimmick.
 */
export function celebrate() {
    confetti({
        particleCount: 60,
        spread: 65,
        startVelocity: 35,
        origin: { y: 0.7 },
        colors: ["#7c3aed", "#a78bfa", "#34d399", "#60a5fa"],
        disableForReducedMotion: true,
    });
}