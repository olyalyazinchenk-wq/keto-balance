import type { RecipeViewModel, VisualDirection } from '../../types/ketoBalanceContract';

interface RecipeArtworkProps {
  artworkKey: RecipeViewModel['artworkKey'];
  caption: string;
  size?: 'compact' | 'regular' | 'editorial';
  visualDirection?: VisualDirection;
  prepMinutes?: number;
  slotLabel?: string;
  className?: string;
}

export function RecipeArtwork({ caption, prepMinutes, className = '' }: RecipeArtworkProps) {
  return <figure className={`rounded-2xl border border-[var(--kb-border)] p-5 ${className}`}>
    <div aria-label={caption} className="text-sm text-[var(--kb-text-2)]">Фото блюда пока не подключено</div>
    {prepMinutes != null && <figcaption className="mt-2 text-sm">Время приготовления: {prepMinutes} мин</figcaption>}
  </figure>;
}
