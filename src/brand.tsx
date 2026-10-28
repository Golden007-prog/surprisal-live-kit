/**
 * Your brand. Set these in .env (copy .env.example) or change the defaults here. Colours and fonts are in
 * src/styles/theme.css.
 */
const env = import.meta.env

export const BRAND = {
  /** Shown in the top bars, the browser tab and the report. */
  name: (env.VITE_BRAND_NAME as string | undefined) || 'Live',
  /** A logo in public/ or a full URL. Set VITE_BRAND_LOGO to an empty value to show the name only. */
  logo: (env.VITE_BRAND_LOGO as string | undefined) ?? '/logo.svg',
  /** Where the phone's last screen links to, for example https://example.org. Empty: no link. */
  url: (env.VITE_BRAND_URL as string | undefined) || '',
  /** The address the presenter shows for phones, for example live.example.org. Empty: this site's own address. */
  joinHost: (env.VITE_JOIN_HOST as string | undefined) || '',
}

/** The logo, or nothing when none is set. */
export function BrandMark() {
  return BRAND.logo ? <img src={BRAND.logo} alt={BRAND.name} /> : null
}
