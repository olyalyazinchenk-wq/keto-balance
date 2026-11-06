import React from 'react';
export interface HeaderProps {
  isPremium?: boolean; onOpenPaywall?: () => void; canGoBack?: boolean;
  onGoBack?: () => void; onOpenSupport?: () => void; title?: string; usePortalIfAvailable?: boolean;
}
// The shared shell owns the single header; access controls live in More.
export const Header: React.FC<HeaderProps> = () => null;
