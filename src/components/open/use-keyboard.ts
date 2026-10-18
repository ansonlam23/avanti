"use client";

import { useEffect, useState } from "react";

/**
 * How much of the bottom of the screen the on-screen keyboard covers, in px
 * (0 when it's closed). A fixed bottom bar sets `bottom` to this so it rides
 * up with the keyboard instead of hiding behind it (iOS Safari doesn't move it).
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const covered = Math.round(window.innerHeight - vv.height - vv.offsetTop);
      setInset(covered > 80 ? covered : 0); // smaller gaps are browser toolbars, not a keyboard
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return inset;
}
