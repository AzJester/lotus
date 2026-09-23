// ============================================================================
// Pixel icon data format shared by the icon data files and the <Icon>
// renderer. An icon is `size` rows of exactly `size` characters; each
// character is a PALETTE key ("." transparent, "@" the tint slot).
// ============================================================================

export interface PixelIcon {
  size: 16 | 32;
  rows: string[];
}
