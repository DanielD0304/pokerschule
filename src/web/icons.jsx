// Einfache Linien-Icons (24×24), farblich über currentColor.
const I = ({ d, children }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d ? <path d={d} /> : children}
  </svg>
);
export const IconHome = () => <I d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />;
export const IconPlay = () => <I><rect x="3" y="4" width="11" height="16" rx="2" /><path d="M17 6.5 20.5 8a1 1 0 0 1 .5 1.3l-4 9.4" /><path d="M8.5 9.5c-1.2 1.4-2.5 2.3-2.5 3.6a1.6 1.6 0 0 0 2.6 1.2L8 16h3l-.6-1.7A1.6 1.6 0 0 0 13 13.1c0-1.3-1.3-2.2-2.5-3.6L9.5 8.5z" /></I>;
export const IconTarget = () => <I><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" /></I>;
export const IconBook = () => <I d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5zM4 20.5A2.5 2.5 0 0 0 6.5 21H20" />;
export const IconChart = () => <I d="M4 20V10M10 20V4M16 20v-7M22 20H2" />;
export const IconTrophy = () => <I d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H4.5a3 3 0 0 0 3.5 4M16 6h3.5a3 3 0 0 1-3.5 4M12 13v4M8 21h8M9 17h6" />;
export const IconRepeat = () => <I d="M4 12a8 8 0 0 1 13.7-5.6L20 9M20 4v5h-5M20 12a8 8 0 0 1-13.7 5.6L4 15M4 20v-5h5" />;
export const IconSpade = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.5C9.4 6 4 8.8 4 13.2a4.3 4.3 0 0 0 7.3 3.1L10.2 21h3.6l-1.1-4.7A4.3 4.3 0 0 0 20 13.2c0-4.4-5.4-7.2-8-10.7z" /></svg>;
export const IconUsers = () => <I d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 4.15a3.5 3.5 0 0 1 0 6.7" />;
export const IconCalc = () => <I><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8 7h8M8 11h2M14 11h2M8 15h2M14 15h2M8 18h2M14 18h2" /></I>;
export const IconGrid = () => <I><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></I>;
export const IconLayers = () => <I d="M12 3 2 8l10 5 10-5zM2 13l10 5 10-5M2 17.5l10 5 10-5" />;
