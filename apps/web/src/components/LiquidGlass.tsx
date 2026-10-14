import { useEffect, useRef, type ComponentPropsWithoutRef, type ElementType, type ReactNode } from 'react';
import { registerLightSurface } from '../design-system/light-controller';

export type LiquidGlassVariant = 'regular' | 'clear';

type LiquidGlassProps<T extends ElementType> = {
  as?: T;
  variant?: LiquidGlassVariant;
  className?: string;
  children?: ReactNode;
} & Omit<ComponentPropsWithoutRef<T>, 'as' | 'className' | 'children'>;

/**
 * Browser approximation of Apple's functional Liquid Glass layer.
 * It keeps the platform implementation honest: the browser cannot call
 * SwiftUI's native renderer, and falls back to a stable CSS material if SVG
 * backdrop reference filters are unavailable.
 */
export function LiquidGlass<T extends ElementType = 'div'>({
  as,
  variant = 'regular',
  className,
  children,
  ...props
}: LiquidGlassProps<T>) {
  const Component = (as ?? 'div') as ElementType;
  const surfaceRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const surface = surfaceRef.current;
    if (surface) return registerLightSurface(surface);
  }, [as]);

  return <Component
    {...props}
    ref={surfaceRef}
    className={['liquid-glass-surface', `liquid-glass-surface--${variant}`, className].filter(Boolean).join(' ')}
    data-liquid-glass={variant}
  >
    <span className="liquid-glass-optics" aria-hidden="true" />
    {children}
  </Component>;
}

/** Shared lightweight SVG lens filter. It distorts only each small glass surface. */
export function LiquidGlassFilters() {
  return <svg className="liquid-glass-filter-defs" aria-hidden="true" focusable="false">
    <filter id="jx-liquid-glass-refract" x="-12%" y="-12%" width="124%" height="124%" colorInterpolationFilters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="0.018 0.026" numOctaves="1" seed="8" result="liquid-map" />
      <feGaussianBlur in="liquid-map" stdDeviation="2.4" result="soft-liquid-map" />
      <feDisplacementMap in="SourceGraphic" in2="soft-liquid-map" scale="7" xChannelSelector="R" yChannelSelector="G" />
    </filter>
  </svg>;
}
