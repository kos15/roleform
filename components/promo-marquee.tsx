import { promoBanners } from "@/lib/promo/server";
import { PromoMarqueeTrack } from "@/components/promo-marquee-track";

/**
 * The festive-offer strip (F32). Renders nothing unless an admin has a code
 * that is live and marked for the banner — so on an ordinary day this is one
 * cheap query and no markup.
 *
 * Server half: the codes are read here and only the advertised ones reach the
 * browser. The client half (the track) owns motion and the dismiss.
 */
export async function PromoMarquee({ className }: { className?: string }) {
  const banners = await promoBanners();
  if (banners.length === 0) return null;
  return <PromoMarqueeTrack banners={banners} className={className} />;
}
