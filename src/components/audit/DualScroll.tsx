import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Área com rolagem horizontal no topo e no rodapé, sincronizadas.
 * A barra do topo só aparece quando o conteúdo é mais largo que a área.
 */
export function DualScroll({ className, children }: { className?: string; children: ReactNode }) {
  const top = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [overflow, setOverflow] = useState(false);

  useEffect(() => {
    const el = body.current;
    if (!el) return;
    const measure = () => {
      setWidth(el.scrollWidth);
      setOverflow(el.scrollWidth > el.clientWidth + 1);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, [children]);

  const sync = (from: HTMLDivElement | null, to: HTMLDivElement | null) => {
    if (from && to && to.scrollLeft !== from.scrollLeft) to.scrollLeft = from.scrollLeft;
  };

  return (
    <>
      <div
        ref={top}
        className="table-scroll-top"
        aria-hidden="true"
        hidden={!overflow}
        onScroll={() => sync(top.current, body.current)}
      >
        <div style={{ width }} />
      </div>
      <div ref={body} className={className} onScroll={() => sync(body.current, top.current)}>
        {children}
      </div>
    </>
  );
}
