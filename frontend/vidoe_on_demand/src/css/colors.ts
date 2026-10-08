// The ONLY place raw color values live. Components import tokens, never hex/rgba.
export const colors = {
  background: {
    primary: '#12121A',
    secondary: '#0D0D13',
    elevated: '#1C1C28',
    player: '#030405',
  },
  surface: {
    /** Cards and inputs: faint cool fills over the dark navy background. */
    glass: 'rgba(255,255,255,0.04)',
    glassMedium: 'rgba(255,255,255,0.065)',
    glassStrong: 'rgba(255,255,255,0.10)',
    border: 'rgba(255,255,255,0.08)',
    borderStrong: 'rgba(124,58,237,0.55)',
    /** Solid surfaces. */
    base: '#171722',
    elevated: '#1C1C28',
    soft: '#242434',
    /** Text-field fill. */
    input: '#1A1A26',
  },
  text: {
    primary: '#ECECF2',
    secondary: '#A5A7B8',
    /** 4.7:1 or better on every surface (was 3.5-3.9:1, below the 4.5:1 AA minimum for real information). */
    muted: '#9094AA',
    /** Text on an accent (purple) surface. */
    inverse: '#FFFFFF',
  },
  /** Highlight for whichever text box is being typed in: a thick white ring. */
  focus: '#FFFFFF',
  icon: {
    primary: '#C9CBD9',
    muted: '#7A7D91',
  },
  accent: {
    primary: '#7A1FD9',
    pressed: '#6615B8',
    /** Purple used for links and active text/icons on dark: lighter than the button fill so it stays readable. */
    text: '#A57BEA',
    primarySoft: 'rgba(122,31,217,0.20)',
    glow: 'rgba(122,31,217,0.30)',
    secondary: '#8FA8FF',
    secondarySoft: 'rgba(143,168,255,0.14)',
  },
  status: {
    success: '#4FD18B',
    successSoft: 'rgba(79,209,139,0.16)',
    warning: '#FFC857',
    warningSoft: 'rgba(255,200,87,0.16)',
    error: '#FF5C66',
    errorSoft: 'rgba(255,92,102,0.16)',
  },
  overlay: {
    scrim: 'rgba(0,0,0,0.50)',
    scrimStrong: 'rgba(0,0,0,0.72)',
    /** A faint tint behind bottom sheets that sit over a video, so the video stays watchable. */
    scrimLight: 'rgba(0,0,0,0.12)',
    /** Opaque-ish stand-in for the glass blur on Android, where live blur flickers under text inputs. */
    /** The floating dock: nearly solid, so video and text behind it don't show through. */
    dock: 'rgba(24,24,35,0.985)',
    glassFlat: 'rgba(19,24,22,0.94)',
  },
  player: {
    /** Pure black behind full-screen video. */
    stage: '#000000',
    trackBase: 'rgba(255,255,255,0.28)',
    trackMini: 'rgba(255,255,255,0.2)',
    /** Captions: white text with a black outline. */
    captionText: '#FFFFFF',
    captionOutline: '#000000',
  },
} as const;
