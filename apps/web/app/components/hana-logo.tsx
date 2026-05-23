interface HanaLogoProps {
  alt?: string;
  className?: string;
  size?: number;
}

export function HanaLogo({ alt = "", className, size = 36 }: HanaLogoProps) {
  return (
    <img
      alt={alt}
      aria-hidden={alt === "" ? "true" : undefined}
      className={className ? `hana-logo-image ${className}` : "hana-logo-image"}
      height={size}
      src="/assets/hana-icon-head.png"
      width={size}
    />
  );
}
