import { useEffect, useState, useRef } from "react";

/**
 * Reveals text progressively, word by word, to simulate streaming - even
 * though the backend returns the full answer in one response. Purely a
 * presentation effect; the underlying text and grounding are unchanged.
 * Once fully revealed, subsequent re-renders just show the full text
 * immediately (it doesn't replay on every render).
 */
function TypewriterText({ text, enabled = true, speedMs = 18 }) {
  const words = useRef(text.split(" "));
  const [visibleCount, setVisibleCount] = useState(enabled ? 0 : words.current.length);

  useEffect(() => {
    if (!enabled) return;
    if (visibleCount >= words.current.length) return;

    const timer = setTimeout(() => {
      setVisibleCount((prev) => prev + 1);
    }, speedMs);

    return () => clearTimeout(timer);
  }, [visibleCount, enabled, speedMs]);

  const visibleText = words.current.slice(0, visibleCount).join(" ");
  const isDone = visibleCount >= words.current.length;

  return (
    <span className="whitespace-pre-wrap">
      {visibleText}
      {!isDone && <span className="inline-block w-1.5 h-3.5 bg-current opacity-60 ml-0.5 animate-pulse align-text-bottom" />}
    </span>
  );
}

export default TypewriterText;