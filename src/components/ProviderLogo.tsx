interface ProviderLogoProps {
  logo?: string;
  size?: number;
  className?: string;
}

export function ProviderLogo({ logo, size = 16, className = "" }: ProviderLogoProps) {
  if (!logo) return null;
  return (
    <img
      src={logo}
      alt=""
      width={size}
      height={size}
      className={`provider-logo-img ${className}`.trim()}
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).style.display = "none";
      }}
    />
  );
}
