import { FoodImage } from './FoodImage';
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
  return <figure className={`food-artwork ${imageUrl ? 'food-artwork--photo' : 'food-artwork--missing'} ${className}`}>
    {imageUrl ? (
      <FoodImage src={imageUrl} alt={`Фотоиллюстрация: ${caption}`} width="640" height="440" />
    ) : (
      <div className="text-sm text-[var(--kb-text-2)]">Фотоиллюстрация недоступна</div>
    )}
    {prepMinutes != null && <figcaption className="food-artwork__time">◷ {prepMinutes} мин · у плиты</figcaption>}
  </figure>;
}
