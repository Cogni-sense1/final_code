/**
 * Branded Suspense fallback shown while a lazily-loaded page chunk loads.
 * Matches the NeuroVoice look (warm background + orange accent ring).
 */
const PageLoader = () => (
  <div className="min-h-screen bg-[#EFEBE6] flex flex-col items-center justify-center gap-5">
    <div className="relative w-16 h-16">
      <div className="absolute inset-0 rounded-full border-4 border-[#FFD4B8]" />
      <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-[#FF8C42] animate-spin" />
    </div>
    <p className="text-sm font-semibold text-[#6B6B6B] tracking-wide">Loading…</p>
  </div>
);

export default PageLoader;
