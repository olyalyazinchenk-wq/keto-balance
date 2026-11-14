import { useState } from 'react';
import type { RecipeViewModel, VisualDirection } from './contract';

interface RecipeArtworkProps {
  artworkKey: RecipeViewModel['artworkKey'];
  caption: string;
  imageUrl?: string | null;
  size?: 'compact' | 'regular' | 'editorial';
  visualDirection?: VisualDirection;
  prepMinutes?: number;
  slotLabel?: string;
  className?: string;
}

export function RecipeArtwork({ caption, imageUrl, prepMinutes, className = '' }: RecipeArtworkProps) {
  const [failed, setFailed] = useState(false);
  return <figure className={`food-artwork ${imageUrl && !failed ? 'food-artwork--photo' : 'food-artwork--missing'} ${className}`}>
    {imageUrl && !failed ? (
      <img src={imageUrl} alt={`Фотоиллюстрация: ${caption}`} width="640" height="440" onError={() => setFailed(true)} />
    ) : (
      <div className="text-sm text-[var(--kb-text-2)]">Фотоиллюстрация недоступна</div>
    )}
    {prepMinutes != null && <figcaption className="food-artwork__time">◷ {prepMinutes} мин · у плиты</figcaption>}
  </figure>;
}
