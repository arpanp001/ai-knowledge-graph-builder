import { useEffect, useState, useCallback } from "react";
import { X } from "lucide-react";

const STEPS = [
  {
    selector: '[data-tour="sidebar"]',
    title: "Start here",
    description: "Create a project to hold a set of documents, their knowledge graph, and their own chat history.",
  },
  {
    selector: '[data-tour="uploader"]',
    title: "Upload documents",
    description: "Drop in a PDF, TXT, or DOCX file. We'll extract entities and relationships automatically in the background.",
  },
  {
    selector: '[data-tour="graph-actions"]',
    title: "Explore the graph",
    description: "View a single document's graph, or the full project graph merging everything you've uploaded.",
  },
  {
    selector: '[data-tour="chat"]',
    title: "Chat with your documents",
    description: "Ask questions - answers are grounded strictly in your uploaded content, with sources cited.",
  },
];

const STORAGE_KEY = "onboarding_complete";

export function shouldShowOnboarding() {
  return localStorage.getItem(STORAGE_KEY) !== "true";
}

function OnboardingTour({ onFinish }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState(null);

  const locateStep = useCallback((index) => {
    const step = STEPS[index];
    if (!step) return null;
    const el = document.querySelector(step.selector);
    if (!el) return null;
    return el.getBoundingClientRect();
  }, []);

  useEffect(() => {
    // Try to find the current step's target; if it's not on screen (e.g. no
    // project selected yet, so the uploader doesn't exist), skip forward.
    const tryLocate = (index) => {
      if (index >= STEPS.length) {
        finish();
        return;
      }
      const found = locateStep(index);
      if (found) {
        setStepIndex(index);
        setRect(found);
      } else {
        tryLocate(index + 1);
      }
    };
    tryLocate(stepIndex === 0 ? 0 : stepIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleReposition = () => setRect(locateStep(stepIndex));
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [stepIndex, locateStep]);

  const finish = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    onFinish();
  };

  const goNext = () => {
    let next = stepIndex + 1;
    let found = locateStep(next);
    while (next < STEPS.length && !found) {
      next += 1;
      found = locateStep(next);
    }
    if (next >= STEPS.length || !found) {
      finish();
    } else {
      setStepIndex(next);
      setRect(found);
    }
  };

  if (!rect) return null;

  const step = STEPS[stepIndex];
  const padding = 8;
  const highlightStyle = {
    position: "fixed",
    top: rect.top - padding,
    left: rect.left - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
    borderRadius: "12px",
    boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.65)",
    zIndex: 60,
    pointerEvents: "none",
    transition: "all 0.3s ease",
  };

  // Position the tooltip below the highlighted element, or above if it
  // would run off the bottom of the screen
  const tooltipTop = rect.bottom + padding + 12 > window.innerHeight - 160
    ? rect.top - 12
    : rect.bottom + padding + 12;
  const isAbove = tooltipTop === rect.top - 12;

  return (
    <>
      <div style={highlightStyle} />
      <div
        className="card p-4 w-72 fixed z-[61] fade-in"
        style={{
          top: isAbove ? undefined : tooltipTop,
          bottom: isAbove ? window.innerHeight - rect.top + 12 : undefined,
          left: Math.min(Math.max(rect.left, 16), window.innerWidth - 300),
        }}
      >
        <div className="flex justify-between items-start mb-1.5">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-sm">{step.title}</h3>
          <button onClick={finish} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
            <X size={15} />
          </button>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{step.description}</p>
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-slate-400">
            {stepIndex + 1} / {STEPS.length}
          </span>
          <div className="flex gap-2">
            <button onClick={finish} className="btn-ghost text-xs">Skip</button>
            <button onClick={goNext} className="btn-primary text-xs px-3 py-1.5">
              {stepIndex === STEPS.length - 1 ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default OnboardingTour;