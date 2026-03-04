'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import MobileLandingPage from './MobileLandingPage';

const BYPASS_PREFIXES = ['/login', '/auth', '/privacy', '/terms', '/api'];

export default function MobileGate({ children }: { children: React.ReactNode }) {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Not yet measured — prevent SSR/hydration flash
  if (isMobile === null) return null;

  const isBypass = BYPASS_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (isMobile && !isBypass) return <MobileLandingPage />;

  return <>{children}</>;
}
