"use client";

import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";

/**
 * Fade + rise on mount. Single-shot — no scroll observer.
 * Respects prefers-reduced-motion.
 */
export function FadeIn({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  if (reduced) {
    return <div className={className}>{children}</div>;
  }
  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className={className}
      initial={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Stagger children — wraps a list and fades each child in sequence.
 * Use as the parent of <StaggerItem>.
 */
export function Stagger({
  children,
  className,
  step = 0.06,
}: {
  children: ReactNode;
  className?: string;
  step?: number;
}) {
  const reduced = useReducedMotion();
  if (reduced) {
    return <div className={className}>{children}</div>;
  }
  return (
    <motion.div
      animate="show"
      className={className}
      initial="hidden"
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: step } },
      }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();
  if (reduced) {
    return <div className={className}>{children}</div>;
  }
  return (
    <motion.div
      className={className}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      variants={{
        hidden: { opacity: 0, y: 14 },
        show: { opacity: 1, y: 0 },
      }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Hover lift wrapper — subtle scale + shadow change.
 * For interactive cards.
 */
export function LiftCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();
  if (reduced) {
    return <div className={className}>{children}</div>;
  }
  return (
    <motion.div
      className={className}
      transition={{ duration: 0.2, ease: "easeOut" }}
      whileHover={{ y: -2 }}
    >
      {children}
    </motion.div>
  );
}

/**
 * CountUp — animates from 0 to `value` when the element first enters the
 * viewport. Falls back to static number if reduced motion is preferred or
 * during SSR.
 */
export function CountUp({
  value,
  format,
  duration = 1.4,
  className,
}: {
  value: number;
  format: (n: number) => string;
  duration?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-10% 0px" });
  const motionValue = useMotionValue(0);
  const display = useTransform(motionValue, (v) => format(Math.round(v)));
  const [displayed, setDisplayed] = useState(format(0));

  useEffect(() => {
    return display.on("change", (v) => setDisplayed(v));
  }, [display]);

  useEffect(() => {
    if (reduced) {
      setDisplayed(format(value));
      return;
    }
    if (!inView) {
      return;
    }
    const controls = animate(motionValue, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
    });
    return () => controls.stop();
  }, [inView, motionValue, value, duration, reduced, format]);

  return (
    <span className={className} ref={ref}>
      {displayed}
    </span>
  );
}
