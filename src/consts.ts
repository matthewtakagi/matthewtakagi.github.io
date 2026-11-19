import type { SvgComponent } from "astro/types"
import Email from "@/assets/icons/email.svg"
import GitHub from "@/assets/icons/github.svg"
import RSS from "@/assets/icons/rss.svg"

export const SITE = {
  title: "Matt Takagi",
  description: "Projects, writing, photos, and travel.",
  locale: "en-US",
  dir: "ltr",
  defaultPageImage: "/static/opengraph-image.png",
  defaultPostImage: "/static/1200x630.png",
} as const

export const NAVIGATION = [
  { href: "/projects", label: "Projects" },
  { href: "/blog", label: "Blog" },
  { href: "/travel", label: "Travel" },
  { href: "/gallery", label: "Gallery" },
]

export const SOCIALS: { href: string; label: string; icon: SvgComponent }[] = [
  { href: "https://github.com/matthewtakagi", label: "GitHub", icon: GitHub },
  { href: "mailto:mattaka@berkeley.edu", label: "Email", icon: Email },
  { href: "/rss.xml", label: "RSS", icon: RSS },
]
