"use client";

import { useEffect, useRef, useState } from "react";

type UseInViewportOptions = IntersectionObserverInit & {
  disabled?: boolean;
};

export function useInViewport<T extends Element>({
  disabled = false,
  root = null,
  rootMargin = "160px",
  threshold = 0.01,
}: UseInViewportOptions = {}) {
  const ref = useRef<T | null>(null);
  const [isInViewport, setIsInViewport] = useState(disabled);

  useEffect(() => {
    if (disabled || isInViewport) {
      return;
    }

    const target = ref.current;
    if (!target) {
      return;
    }

    if (!("IntersectionObserver" in window)) {
      const timer = globalThis.setTimeout(() => setIsInViewport(true), 0);
      return () => globalThis.clearTimeout(timer);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setIsInViewport(true);
          observer.disconnect();
        }
      },
      { root, rootMargin, threshold },
    );

    observer.observe(target);

    return () => observer.disconnect();
  }, [disabled, isInViewport, root, rootMargin, threshold]);

  return { ref, isInViewport };
}
