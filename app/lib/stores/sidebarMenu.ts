import { atom } from 'nanostores';

/**
 * Gemeinsamer Zustand für das Seitenmenü (Chat-Verlauf / Einstellungen).
 * Header (Button) und Menu (Seitenleiste) nutzen denselben Wert,
 * damit das Menü auch per Fingertipp geöffnet werden kann.
 */
export const sidebarOpenStore = atom<boolean>(false);
