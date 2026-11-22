import { useState } from 'react';
import type { ImgHTMLAttributes } from 'react';

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'onError' | 'src'> & { src: string; retryable?: boolean };
/** Retry the same dish in JPEG if WebP fails. Never substitute a different meal. */
export function FoodImage({ src, alt = '', className, retryable = false, ...props }: Props) {
  const [failure, setFailure] = useState({ source: '', fallback: false, unavailable: false });
  const status = failure.source === src ? failure : { fallback: false, unavailable: false };
  if (status.unavailable) return <span className="food-image-retry" role="group" aria-label={alt}>
    <span>Не удалось загрузить изображение</span>
    {retryable && <button type="button" onClick={event => { event.stopPropagation(); setFailure({ source: src, fallback: false, unavailable: false }); }}>Повторить загрузку</button>}
  </span>;
  return <img {...props} className={className} alt={alt} src={status.fallback ? src.replace(/\.webp$/, '.jpg') : src}
    decoding="async" onError={() => setFailure({ source: src, fallback: true, unavailable: status.fallback })} />;
}
